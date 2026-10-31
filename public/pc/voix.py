# Muninn sur le PC : transcription de la voix par Whisper (faster-whisper), sur le PC lui-même.
# La voix ne sort pas du PC. Ce service n'écoute que sur le PC (127.0.0.1:4748) ; seul Muninn du PC (muninn-pc.mjs)
# lui parle, après avoir vérifié le code du PC. Une transcription à la fois.
#   GET  /etat        -> {"pret": bool, "modele": "...", "appareil": "cpu"|"cuda", "erreur": "..."}
#   POST /transcrire  (le son tel qu'enregistré : webm, mp4, ogg, wav…) -> {"texte": "..."}
# Réglages : fichier voix.json du dossier de Muninn, écrit par installer.ps1 ({"modele": "large-v3-turbo", "gpu": false}).
import glob
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DOSSIER = os.environ.get("MUNINN_DOSSIER") or os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "Muninn")
try:
    with open(os.path.join(DOSSIER, "voix.json"), encoding="utf-8") as f:
        REGLAGES = json.load(f)
except (OSError, ValueError):
    REGLAGES = {}
MODELE = REGLAGES.get("modele", "large-v3-turbo")
PORT = int(os.environ.get("MUNINN_WHISPER_PORT", "4748"))
MAX = 150 * 1024 * 1024

# vocabulaire de kiné donné à Whisper pour l'aider sur les termes techniques
VOCABULAIRE = ("Séance de kinésithérapie, dictée par le kiné. Épaule, coiffe des rotateurs, sus-épineux, sous-scapulaire, "
               "infra-épineux, rotation externe, rotation interne, abduction, antépulsion, rétropulsion, test de Jobe, Neer, "
               "Hawkins, Patte, EVA, capsulite, tendinopathie, conflit sous-acromial, proprioception, mobilisation passive, "
               "renforcement, étirements, massage, cervicales, rachis, coude, épicondylite. Pour la prochaine séance.")

etat = {"pret": False, "modele": MODELE, "appareil": None, "erreur": None}
modele = None
verrou = threading.Lock()


def bibliotheques_nvidia():
    # sous Windows, les bibliothèques CUDA installées par pip (nvidia-cublas-cu12, nvidia-cudnn-cu12) doivent être déclarées
    for d in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        try:
            os.add_dll_directory(d)
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
        except OSError:
            pass


def charger():
    """Charge le modèle (téléchargé la première fois dans DOSSIER/modeles). Carte graphique NVIDIA si possible, sinon processeur."""
    global modele
    try:
        from faster_whisper import WhisperModel
        racine = os.path.join(DOSSIER, "modeles")
        essais = [("cpu", "int8")]
        if REGLAGES.get("gpu"):
            bibliotheques_nvidia()
            essais.insert(0, ("cuda", "float16"))
        for appareil, calcul in essais:
            try:
                modele = WhisperModel(MODELE, device=appareil, compute_type=calcul, download_root=racine,
                                      cpu_threads=max(1, (os.cpu_count() or 4) - 1))
                etat.update(pret=True, appareil=appareil, erreur=None)
                print(f"Whisper prêt : {MODELE} sur {appareil}", flush=True)
                return
            except Exception as e:  # carte graphique absente ou mal installée : on passe au processeur
                print(f"Whisper sur {appareil} impossible : {e}", flush=True)
                etat["erreur"] = str(e)
    except Exception as e:
        etat["erreur"] = str(e)
        print(f"Whisper indisponible : {e}", flush=True)


def transcrire(chemin):
    segments, _ = modele.transcribe(chemin, language="fr", initial_prompt=VOCABULAIRE, beam_size=5,
                                    vad_filter=True, condition_on_previous_text=False)
    return " ".join(s.text.strip() for s in segments).strip()


class Demandes(BaseHTTPRequestHandler):
    def repondre(self, statut, corps):
        donnees = json.dumps(corps, ensure_ascii=False).encode("utf-8")
        self.send_response(statut)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(donnees)))
        self.end_headers()
        self.wfile.write(donnees)

    def do_GET(self):
        if self.path == "/etat":
            return self.repondre(200, etat)
        self.repondre(404, {"erreur": "Introuvable."})

    def do_POST(self):
        if self.path != "/transcrire":
            return self.repondre(404, {"erreur": "Introuvable."})
        if not etat["pret"]:
            return self.repondre(503, {"erreur": "Whisper se prépare encore sur le PC (téléchargement du modèle). Réessayez dans quelques minutes."})
        taille = int(self.headers.get("Content-Length") or 0)
        if taille <= 0 or taille > MAX:
            return self.repondre(413 if taille else 400, {"erreur": "Enregistrement vide ou trop long."})
        son = self.rfile.read(taille)
        type_ = self.headers.get("Content-Type", "")
        suffixe = ".ogg" if "ogg" in type_ else ".m4a" if ("mp4" in type_ or "aac" in type_ or "m4a" in type_) else ".wav" if "wav" in type_ else ".webm"
        fichier = tempfile.NamedTemporaryFile(suffix=suffixe, delete=False)
        try:
            fichier.write(son)
            fichier.close()
            with verrou:
                texte = transcrire(fichier.name)
            self.repondre(200, {"texte": texte} if texte else {"erreur": "Rien n'a été compris dans l'enregistrement."})
        except Exception as e:
            print(f"Transcription impossible : {e}", flush=True)
            self.repondre(500, {"erreur": "La transcription a échoué sur le PC."})
        finally:
            try:
                os.remove(fichier.name)   # l'enregistrement ne reste pas sur le PC
            except OSError:
                pass

    def log_message(self, *args):
        pass


def charger_jusqua_reussir():
    # sans internet au démarrage du PC, le premier téléchargement échoue : nouvel essai toutes les 5 minutes
    import time
    while not etat["pret"]:
        charger()
        if not etat["pret"]:
            time.sleep(300)


if __name__ == "__main__":
    threading.Thread(target=charger_jusqua_reussir, daemon=True).start()
    print(f"Voix de Muninn sur http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Demandes).serve_forever()

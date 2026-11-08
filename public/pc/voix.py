# Muninn sur le PC : transcription de la voix par Whisper (faster-whisper), sur le PC lui-même.
# La voix ne sort pas du PC. Ce service n'écoute que sur le PC (127.0.0.1:4748) ; seul Muninn du PC (muninn-pc.mjs)
# lui parle, après avoir vérifié le code du PC. Une transcription à la fois.
#   GET  /etat        -> {"pret": bool, "modele": "...", "appareil": "cpu"|"cuda", "erreur": "..."}
#   POST /transcrire  (le son tel qu'enregistré : webm, mp4, ogg, wav…) -> {"texte": "..."}
# Réglages : fichier voix.json du dossier de Muninn, écrit par installer.ps1 ({"modele": "large-v3-turbo", "gpu": false}).
import glob
import json
import os
import re
import sys
import urllib.parse
import tempfile
import threading
import traceback
from datetime import datetime
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

JOURNAL = os.path.join(DOSSIER, "voix.log")
# le son reçu est écrit le temps de la transcription dans le dossier protégé de Muninn (pas dans le dossier temporaire
# de Windows, lisible plus largement) ; ce qui y resterait après une panne est effacé au démarrage
TEMP = os.path.join(DOSSIER, "temp")


def vider_temp():
    os.makedirs(TEMP, exist_ok=True)
    for f in glob.glob(os.path.join(TEMP, "*")):
        try:
            os.remove(f)
        except OSError:
            pass


def noter(texte):
    """Journal du PC (voix.log, dans le dossier de Muninn) : ce qui s'est passé, pour comprendre une panne. Jamais le texte dicté."""
    print(texte, flush=True)
    try:
        if os.path.exists(JOURNAL) and os.path.getsize(JOURNAL) > 500_000:
            os.replace(JOURNAL, JOURNAL + ".ancien")
        with open(JOURNAL, "a", encoding="utf-8") as f:
            f.write(datetime.now().strftime("%Y-%m-%d %H:%M:%S ") + texte + "\n")
    except OSError:
        pass


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
                noter(f"Whisper prêt : {MODELE} sur {appareil}")
                return
            except Exception as e:  # carte graphique absente ou mal installée : on passe au processeur
                noter(f"Whisper sur {appareil} impossible : {e!r}")
                etat["erreur"] = str(e)
    except Exception as e:
        etat["erreur"] = str(e)
        noter(f"Whisper indisponible : {e!r}")


# phrases que Whisper invente sur un passage sans voix (sous-titres de vidéos) : retirées
FANTOMES = [re.compile(m, re.I) for m in (
    r"sous-titr(?:es|age|é)[^.!?\n]*(?:amara(?:\.org)?|st' ?501|radio-canada|soustitreur|communaut[ée](?: d'amara(?:\.org)?)?)[^.!?\n]*[.!?]?",
    r"merci d'avoir regardé(?: cette vidéo)?\s*[.!?]?",
    r"(?:n'oubliez pas de |pensez à )?(?:vous )?abonne[zr][- ]vous[^.!?\n]*[.!?]?",
    r"n'oubliez pas de liker[^.!?\n]*[.!?]?")]


def nettoyer(texte):
    for f in FANTOMES:
        texte = f.sub(" ", texte)
    return " ".join(texte.split())


def invite(indice):
    """Ce que Whisper lit avant d'écouter : le vocabulaire de kiné, les patients du jour (pour écrire leurs noms juste)
    et la fin du texte déjà transcrit (transcription en direct, morceau par morceau). Le plus utile en dernier :
    Whisper ne garde que la fin d'une invite trop longue."""
    texte = VOCABULAIRE
    noms = [str(n)[:40] for n in (indice.get("noms") or []) if str(n).strip()][:40]
    if noms:
        liste = ", ".join(noms)
        texte += " Patients du jour : " + liste + ("" if liste.endswith(".") else ".")
    avant = str(indice.get("avant") or "")[-300:].strip()
    if avant:
        texte += " " + avant
    return texte


def lire_indice(entete):
    try:
        indice = json.loads(urllib.parse.unquote(entete or "")) if entete else {}
        return indice if isinstance(indice, dict) else {}
    except ValueError:
        return {}


def transcrire(chemin, indice=None):
    """Le filtre des silences (VAD) dépend d'une bibliothèque de plus (onnxruntime) : s'il échoue, on transcrit sans lui.
    Un passage où Whisper lui-même doute qu'il y ait une voix est écarté (il y invente souvent une phrase)."""
    amorce = invite(indice or {})

    def essai(vad):
        segments, _ = modele.transcribe(chemin, language="fr", initial_prompt=amorce, beam_size=5,
                                        vad_filter=vad, condition_on_previous_text=False)
        gardes = [s.text.strip() for s in segments if not (s.no_speech_prob > 0.6 and s.avg_logprob < -1.0)]
        return nettoyer(" ".join(gardes))
    try:
        return essai(True)
    except Exception as e:
        noter(f"Transcription avec filtre des silences impossible, nouvel essai sans : {e!r}")
        return essai(False)


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
        fichier = tempfile.NamedTemporaryFile(suffix=suffixe, delete=False, dir=TEMP)
        try:
            fichier.write(son)
            fichier.close()
            debut = datetime.now()
            with verrou:
                texte = transcrire(fichier.name, lire_indice(self.headers.get("X-Muninn-Indice")))
            noter(f"Transcription : {len(son)} octets ({type_}), {(datetime.now() - debut).seconds} s, {len(texte)} caractères")
            self.repondre(200, {"texte": texte} if texte else {"erreur": "Rien n'a été compris dans l'enregistrement."})
        except Exception as e:
            noter(f"Transcription impossible ({len(son)} octets, {type_}) : {e!r}\n{traceback.format_exc()}")
            self.repondre(500, {"erreur": f"La transcription a échoué sur le PC ({type(e).__name__} : {str(e)[:160]})."})
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
    vider_temp()
    threading.Thread(target=charger_jusqua_reussir, daemon=True).start()
    noter(f"Voix de Muninn sur http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Demandes).serve_forever()

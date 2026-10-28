// Transcription de la voix par Whisper (préparée pour l'arrivée du PC de Corentin, décision du 28 octobre 2026).
// Le serveur relaie l'enregistrement, en mémoire et le temps de la demande, vers un service compatible avec l'API
// « audio/transcriptions » d'OpenAI : l'API d'OpenAI elle-même, ou un Whisper installé sur un PC (faster-whisper-server,
// whisper.cpp…). Rien n'est écrit sur disque. Sans WHISPER_URL, la transcription est simplement absente.
//   WHISPER_URL    adresse complète, par exemple https://api.openai.com/v1/audio/transcriptions
//   WHISPER_CLE    clé du service, si besoin
//   WHISPER_MODELE modèle (par défaut whisper-1)

/* vocabulaire de kiné donné à Whisper pour l'aider sur les termes techniques */
const VOCABULAIRE = "Séance de kinésithérapie, dictée par le kiné. Épaule, coiffe des rotateurs, sus-épineux, sous-scapulaire, " +
  "infra-épineux, rotation externe, rotation interne, abduction, antépulsion, rétropulsion, test de Jobe, Neer, Hawkins, Patte, " +
  "EVA, capsulite, tendinopathie, conflit sous-acromial, proprioception, mobilisation passive, renforcement, étirements, " +
  "massage, cervicales, rachis, coude, épicondylite. Pour la prochaine séance.";

export const disponible = () => !!process.env.WHISPER_URL;

export async function transcrire(audio, type) {
  const url = process.env.WHISPER_URL;
  if (!url) return { erreur: "La transcription n'est pas encore branchée sur le serveur." };
  const extension = /ogg/.test(type) ? "ogg" : /mp4|m4a|aac/.test(type) ? "m4a" : /wav/.test(type) ? "wav" : "webm";
  const form = new FormData();
  form.append("file", new Blob([audio], { type }), "dictee." + extension);
  form.append("model", process.env.WHISPER_MODELE || "whisper-1");
  form.append("language", "fr");
  form.append("prompt", VOCABULAIRE);
  form.append("response_format", "json");
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: process.env.WHISPER_CLE ? { Authorization: "Bearer " + process.env.WHISPER_CLE } : {},
      body: form,
      signal: AbortSignal.timeout(5 * 60_000)
    });
  } catch { return { erreur: "Le service de transcription est injoignable." }; }
  let corps = {};
  try { corps = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) return { erreur: r.status === 401 ? "Le service de transcription refuse la clé." : `Le service de transcription a répondu par une erreur (${r.status}).` };
  const texte = typeof corps.text === "string" ? corps.text.trim() : "";
  return texte ? { texte } : { erreur: "Rien n'a été compris dans l'enregistrement." };
}

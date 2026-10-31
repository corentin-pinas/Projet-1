#!/usr/bin/env node
// Faux Whisper pour les tests : imite l'API « audio/transcriptions » (formulaire avec le fichier audio), sans rien transcrire.
// GET /dernier rend ce qu'il a reçu, pour que les tests vérifient l'envoi.
// Imite aussi le Whisper du PC (voix.py) : GET /etat, POST /transcrire (le son brut).
import { createServer } from "node:http";

let dernier = null;
createServer((req, res) => {
  if (req.method === "GET" && req.url === "/dernier") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(dernier)); }
  if (req.method === "GET" && req.url === "/etat") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ pret: true, modele: "large-v3-turbo", appareil: "cpu" })); }
  if (req.method === "POST" && req.url === "/transcrire") {
    let taille = 0;
    req.on("data", d => taille += d.length);
    req.on("end", () => {
      dernier = { pc: true, type: req.headers["content-type"], taille };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ texte: "avec Odile mobilisation passive, transcrit sur le PC" }));
    });
    return;
  }
  const morceaux = [];
  req.on("data", d => morceaux.push(d));
  req.on("end", () => {
    const corps = Buffer.concat(morceaux).toString("latin1");
    const champ = n => new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`).exec(corps)?.[1] ?? null;
    dernier = { type: req.headers["content-type"], taille: corps.length, model: champ("model"), language: champ("language"), prompt: champ("prompt"), fichier: /name="file"; filename="([^"]+)"/.exec(corps)?.[1] ?? null };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text: "avec Marc douleur 3 sur 10 renforcement des rotateurs externes" }));
  });
}).listen(Number(process.env.PORT) || 4181, () => console.log("faux Whisper prêt"));

// Fabrique les icônes PNG de l'appli à partir de public/icons/icon.svg.
// À relancer seulement si le dessin de l'icône change : npm run icons
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const src = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

const icones = [
  { fichier: "icon-192.png", taille: 192, marge: 0 },
  { fichier: "icon-512.png", taille: 512, marge: 0 },
  // Android rogne les icônes « maskable » en cercle : le dessin reste dans la zone centrale
  { fichier: "icon-maskable-512.png", taille: 512, marge: 0.14 }
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
for (const { fichier, taille, marge } of icones) {
  const m = Math.round(taille * marge);
  await page.setViewportSize({ width: taille, height: taille });
  await page.setContent(`<body style="margin:0;background:${marge ? "#23705F" : "transparent"}">
    <img src="${src}" style="display:block;margin:${m}px;width:${taille - 2 * m}px;height:${taille - 2 * m}px"></body>`);
  await page.screenshot({ path: `public/icons/${fichier}`, omitBackground: !marge });
}
await browser.close();
console.log("Icônes créées.");

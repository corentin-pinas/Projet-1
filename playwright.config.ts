import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1280, height: 800 }, // tablette en paysage
    locale: "fr-FR",
    launchOptions: {
      // micro simulé (son de test de Chromium), accordé sans question : pour la dictée enregistrée
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
      ...(process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_BROWSERS_PATH === "/opt/pw-browsers"
        ? { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" }
        : {})
    }
  },
  workers: 1, // le faux Claude Code garde un état (connecté ou non) partagé entre les tests
  webServer: [{
    command: "rm -rf .faux-claude && PORT=4173 CODE_ACCES=code-acces-essai-123 CLAUDE_BIN=tests/faux/claude.mjs CLAUDE_CONFIG_DIR=.faux-claude CLAUDE_DELAI_LIEN_MS=1000 WHISPER_URL=http://localhost:4181/v1/audio/transcriptions node server.mjs",
    url: "http://localhost:4173",
    reuseExistingServer: false
  }, {
    // Muninn du PC, pour le partage entre appareils
    command: "rm -rf .faux-pc && MUNINN_DOSSIER=.faux-pc MUNINN_PORT=4747 MUNINN_CODE=ESSA-IPCM-UNIN node public/pc/muninn-pc.mjs",
    url: "http://127.0.0.1:4747/",
    reuseExistingServer: false
  }, {
    command: "PORT=4181 node tests/faux/whisper.mjs",
    url: "http://localhost:4181/dernier",
    reuseExistingServer: false
  }]
});

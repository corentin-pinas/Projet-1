import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1280, height: 800 }, // tablette en paysage
    locale: "fr-FR",
    launchOptions: process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_BROWSERS_PATH === "/opt/pw-browsers"
      ? { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" }
      : {}
  },
  workers: 1, // le faux Claude Code garde un état (connecté ou non) partagé entre les tests
  webServer: {
    command: "rm -rf .faux-claude && PORT=4173 CODE_ACCES=code-acces-essai-123 CLAUDE_BIN=tests/faux/claude.mjs CLAUDE_CONFIG_DIR=.faux-claude node server.mjs",
    url: "http://localhost:4173",
    reuseExistingServer: false
  }
});

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
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false
  }
});

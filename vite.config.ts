import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: { __VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "Muninn",
        short_name: "Muninn",
        description: "Muninn, la mémoire du cabinet : bilans, séances et rendez-vous des patients.",
        lang: "fr",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#110F1A",
        theme_color: "#110F1A",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,woff2}"],
        globIgnores: ["pc/**"],                       // programme du PC : téléchargé par le PC seulement
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/pc\//]
      }
    })
  ],
  test: {
    include: ["src/**/*.test.ts"]
  }
});

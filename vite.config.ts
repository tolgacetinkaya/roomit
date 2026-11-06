import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  // Keep local images as files so the native app's strict CSP can load them.
  build: { assetsInlineLimit: 0 },
  server: {
    host: "localhost",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/crates/**", "**/target/**", "**/.local/**"],
    },
  },
});

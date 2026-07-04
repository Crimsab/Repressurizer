import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};
const appChannel = process.env.VITE_REPRESSURIZER_CHANNEL ?? process.env.REPRESSURIZER_CHANNEL ?? "stable";
const appVersion = process.env.REPRESSURIZER_PREVIEW_VERSION ?? packageJson.version;
const appDisplayVersion = appChannel === "preview"
  ? (process.env.REPRESSURIZER_PREVIEW_LABEL ?? "Preview")
  : packageJson.version;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_DISPLAY_VERSION__: JSON.stringify(appDisplayVersion),
    __APP_CHANNEL__: JSON.stringify(appChannel === "preview" ? "preview" : "stable"),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "ES2022",
    sourcemap: true,
  },
});

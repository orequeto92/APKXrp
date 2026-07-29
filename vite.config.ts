import { defineConfig } from "vite";

export default defineConfig({
  base: "./",              // rutas relativas: obligatorio dentro del APK
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
    // En el APK las llamadas las hace CapacitorHttp de forma nativa (sin CORS).
    // En `npm run dev` el navegador si aplica CORS, asi que se pasan por este proxy.
    proxy: {
      "/bitget": {
        target: "https://api.bitget.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bitget/, ""),
      },
    },
  },
});

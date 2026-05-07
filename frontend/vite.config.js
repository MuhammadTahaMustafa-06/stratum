import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Merge VITE_* from repo root and frontend/ so keys work from `frontend/.env` (or repo root `.env`).
// (Backend env is never visible to the browser — use `VITE_`-prefixed keys in `frontend/.env`.)
export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, "..");
  const feRoot = __dirname;
  const merged = {
    ...loadEnv(mode, repoRoot, ""),
    ...loadEnv(mode, feRoot, ""),
  };

  const define = {};
  for (const [key, value] of Object.entries(merged)) {
    if (key.startsWith("VITE_")) {
      define[`import.meta.env.${key}`] = JSON.stringify(value ?? "");
    }
  }

  const apiProxy = {
    "/api": {
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
    },
    // Avatar static files (FastAPI mounts /uploads) — same-origin in dev so CSP img-src 'self' applies.
    "/uploads": {
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
    },
  };

  return {
    plugins: [react()],
    define,
    // Dev / preview: same-origin `/api/...` → backend on IPv4 loopback (avoids Windows
    // `localhost` → ::1 while uvicorn listens on 127.0.0.1 → Axios "Network Error").
    server: { proxy: apiProxy },
    preview: { proxy: apiProxy },
  };
});

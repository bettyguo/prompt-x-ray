import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `base` is the prefix every emitted asset URL is rooted under. For local dev
// and `npm run preview` it stays `/`; the GitHub Pages workflow sets
// `VITE_BASE=/prompt-x-ray/` so assets resolve under that subpath. `SITE_URL`
// is the fully-qualified origin used to absolutize the og:image and
// twitter:image meta tags — relative paths confuse some social-card scrapers,
// so we substitute the value into a `__SITE_URL__` placeholder in index.html.
const BASE = process.env.VITE_BASE ?? "/";
const SITE_URL = (process.env.VITE_SITE_URL ?? "").replace(/\/+$/, "");

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "inject-site-url",
      transformIndexHtml(html: string) {
        return html.replace(/__SITE_URL__/g, SITE_URL);
      },
    },
  ],
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor libraries into cache-friendly chunks. Rationale:
        // - `transformers` (incl. onnxruntime-web) is the largest dep and
        //   only loads on first Analyze click — keep it out of first paint.
        // - `d3` is touched by every panel render but rarely changes version,
        //   so a separate chunk gives us long-term browser caching.
        // - `react` is the most stable of all, isolate it for cache hits
        //   across deploys.
        manualChunks(id: string) {
          if (
            id.includes("node_modules/@huggingface/transformers") ||
            id.includes("node_modules/onnxruntime-web") ||
            id.includes("node_modules/onnxruntime-common")
          ) {
            return "transformers";
          }
          if (id.includes("node_modules/d3-") || /node_modules[\\/]d3[\\/]/.test(id)) {
            return "d3";
          }
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
});

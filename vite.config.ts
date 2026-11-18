import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
    // During local development the Node API runs on :3000
    proxy: Object.fromEntries(
      ["/api", "/auth/v1", "/storage/v1", "/functions/v1"].map((p) => [p, { target: "http://localhost:3000", changeOrigin: false }]),
    ),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

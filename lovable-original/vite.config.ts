import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import { componentTagger } from "lovable-tagger";

// Temporary: copies the project source tree into the build output for backup purposes.
function sourceBackupPlugin() {
  const BACKUP_DIR = "__src_1fc08d49845196f2b1980d66";
  return {
    name: "source-backup",
    apply: "build" as const,
    closeBundle() {
      const root = process.cwd();
      const outDir = path.join(root, "dist", BACKUP_DIR);
      const copied: string[] = [];

      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          const rel = path.relative(root, full);
          if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith("dist")) {
              continue;
            }
            walk(full);
          } else if (entry.isFile()) {
            if (entry.name === ".env" || entry.name.startsWith(".env")) {
              continue;
            }
            const target = path.join(outDir, rel);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(full, target);
            copied.push(rel.split(path.sep).join("/"));
          }
        }
      };

      walk(root);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(copied, null, 2));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), sourceBackupPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

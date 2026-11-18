// Bundles the Node server (TypeScript) into server-dist/index.mjs with esbuild.
import { build } from "esbuild";

await build({
  entryPoints: ["server/src/index.ts"],
  outfile: "server-dist/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  packages: "external",
  loader: { ".sql": "text" },
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});

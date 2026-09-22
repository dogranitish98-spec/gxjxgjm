import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const base = process.env.VITE_BASE_PATH || "/synaptick/";

const result = spawnSync("npx", ["vite", "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GITHUB_PAGES: "true", VITE_BASE_PATH: base },
});
if (result.status !== 0) process.exit(result.status ?? 1);

// Vite's environments build (client + ssr) emits dist/client and dist/server,
// not a flat dist/. Prefer dist/client, and only accept a candidate that
// actually contains an index.html.
const candidates = [
  join(root, ".output", "public"),
  join(root, "dist", "client"),
  join(root, "dist"),
];
const source = candidates.find((dir) => existsSync(dir) && existsSync(join(dir, "index.html")));
if (!source) {
  console.error(
    "GitHub Pages build output was not found (.output/public, dist/client, or dist with an index.html).",
  );
  process.exit(1);
}

const out = join(root, "dist-pages");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(source, out, { recursive: true });

// GitHub Pages has no server-side SPA fallback. A 404 document bootstraps the
// same client router while preserving the requested URL.
const index = join(out, "index.html");
if (!existsSync(index)) {
  console.error(`Expected ${index} to exist after the build.`);
  process.exit(1);
}
cpSync(index, join(out, "404.html"));

// Keep a tiny marker for troubleshooting the published artifact.
writeFileSync(join(out, "pages-build.txt"), `Synaptick GitHub Pages build\nbase=${base}\n`, "utf8");
console.log(`Prepared ${out} from ${source} with base ${base}`);

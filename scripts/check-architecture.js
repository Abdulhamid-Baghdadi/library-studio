// Enforces the dependency rule in ARCHITECTURE.md: each layer may import only the layers listed for it.
// Run with `npm run check`; exits with an error listing every violation.
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, dirname, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "src");
const ALLOWED = {
  domain: ["domain"],                                  // pure: no I/O, no platform APIs
  ports: ["ports", "domain"],                          // interfaces (types only)
  services: ["services", "domain", "ports"],           // use cases
  adapters: ["adapters", "domain", "ports"],           // platform code implementing ports
  ui: ["ui", "", "adapters"],                          // the browser shell: public API (src/index.js) and adapters
  "": ["domain", "ports", "services", "adapters"],     // src/index.js
};
const PLATFORM_FREE = new Set(["domain", "ports", "services"]);  // must run unchanged in the browser

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

const layerOf = file => { const r = relative(ROOT, file).split(sep); return r.length > 1 ? r[0] : ""; };
const problems = [];
for (const file of await files(ROOT)) {
  const layer = layerOf(file), text = await readFile(file, "utf8");
  const imports = text.matchAll(/^\s*(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm);
  for (const m of imports) {
    const spec = m[1] ?? m[2];
    const where = relative(ROOT, file);
    if (spec.startsWith("node:") || !spec.startsWith(".")) {
      if (PLATFORM_FREE.has(layer)) problems.push(`${where}: imports "${spec}" — ${layer} must not depend on a platform or package`);
      continue;
    }
    const target = layerOf(resolve(dirname(file), spec));
    if (!ALLOWED[layer].includes(target)) problems.push(`${where}: imports ${target || "index"} — ${layer || "index"} may import ${ALLOWED[layer].join(", ")}`);
  }
}
if (problems.length) {
  console.error(`Architecture: ${problems.length} violation(s)\n` + problems.map(p => "  " + p).join("\n"));
  process.exit(1);
}
console.log("Architecture: dependency rule respected.");

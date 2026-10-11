// Development server: serves the repository as static files (the app is plain ES modules, no build step).
//   node scripts/serve.js [port] [--fixture <vault folder>]   then open http://localhost:<port>/web/
// --fixture serves a vault folder on disk at /fixture/ (manifest.json + files/…), so the app can copy it into
// the browser's own storage and open it without the folder picker (for automated testing; see web/dev.js).
import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { precacheList } from "./precache-list.js";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const PORT = Number(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 8771);
const fixtureAt = args.indexOf("--fixture");
const FIXTURE = fixtureAt >= 0 ? resolve(args[fixtureAt + 1]) : process.env.LIBRARY_STUDIO_FIXTURE ? resolve(process.env.LIBRARY_STUDIO_FIXTURE) : null;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".map": "application/json" };

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const headers = { "Cache-Control": "no-store" };
  if (url.pathname === "/web/precache.json") {
    res.writeHead(200, { ...headers, "Content-Type": "application/json" }).end(JSON.stringify(await precacheList(ROOT)));
    return;
  }
  if (FIXTURE && url.pathname.startsWith("/fixture/")) {
    if (url.pathname === "/fixture/manifest.json") {
      const files = (await walk(FIXTURE)).map(p => relative(FIXTURE, p).split("\\").join("/"));
      res.writeHead(200, { ...headers, "Content-Type": "application/json" }).end(JSON.stringify({ name: FIXTURE.split(/[\\/]/).pop(), files }));
      return;
    }
    const rel = decodeURIComponent(url.pathname.slice("/fixture/files/".length));
    const path = normalize(join(FIXTURE, rel));
    if (!path.startsWith(FIXTURE)) { res.writeHead(403).end(); return; }
    try { res.writeHead(200, { ...headers, "Content-Type": "application/octet-stream" }).end(await readFile(path)); } catch { res.writeHead(404).end(); }
    return;
  }
  let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    res.writeHead(200, { ...headers, "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" }).end(await readFile(path));
  } catch {
    res.writeHead(url.pathname === "/" ? 302 : 404, url.pathname === "/" ? { Location: "/web/" } : {}).end();
  }
}).listen(PORT, () => console.log(`Library Studio: http://localhost:${PORT}/web/${FIXTURE ? `  (fixture: ${FIXTURE})` : ""}`));

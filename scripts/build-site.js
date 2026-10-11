// Builds the static site for GitHub Pages into dist/: the page (web/) and the engine (src/). No bundler: the
// files are ES modules and load as they are.
//   node scripts/build-site.js        then publish dist/ (its index.html opens web/)
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { precacheList } from "./precache-list.js";

const ROOT = resolve(import.meta.dirname, ".."), DIST = join(ROOT, "dist");

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(join(ROOT, "web"), join(DIST, "web"), { recursive: true });
await cp(join(ROOT, "src"), join(DIST, "src"), { recursive: true, filter: p => !p.endsWith("node-folder.js") });   // Node-only adapter
await writeFile(join(DIST, "web", "precache.json"), JSON.stringify(await precacheList(DIST)));
await writeFile(join(DIST, "index.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=web/"><title>Library Studio</title><a href="web/">Library Studio</a>\n');
console.log("dist/ ready: publish it as a static site (opens web/).");

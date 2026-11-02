// Headings never skip a level (WCAG 1.3.1, W3C 2023): a page's h1, each card's title or a settings group an h2, a
// heading inside a card an h3, nothing deeper. Right results by definition. The pages as drawn were measured in the
// browser on 2026-11-02 (ARCHITECTURE.md); this holds the code that draws them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../../web/", import.meta.url));
const scripts = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? scripts(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : []);

test("the start page's headings go h1, then h2, never skipping", () => {
  const html = readFileSync(join(WEB, "index.html"), "utf8");
  const levels = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
  assert.ok(levels.length > 1);
  levels.reduce((last, level) => { assert.ok(level <= last + 1, `h${last} then h${level}`); return level; }, 0);
});

test("a card's title and an empty card's title are h2", () => {
  const ui = readFileSync(join(WEB, "ui.js"), "utf8");
  for (const name of ["card", "empty"]) {
    const line = ui.split("\n").find(l => l.startsWith(`export const ${name} =`));
    assert.match(line, /h\("h2"/, `${name}() makes its title an h2`);
  }
});

test("the pages make no heading deeper than h3", () => {
  for (const file of scripts(WEB)) {
    const deep = [...readFileSync(file, "utf8").matchAll(/h\("h([4-6])"/g)].map(m => `h${m[1]}`);
    assert.deepEqual(deep, [], `${file} makes ${deep.join(", ")}`);
  }
});

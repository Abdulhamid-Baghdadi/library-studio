// The architecture check (scripts/check-architecture.js) catches every break the design rules' layering contract
// lists (UA-SMARTLab/design-rules, skill/architecture.md), each on a small project made for the test; right results
// by definition: the layers and imports each project is written with. And this repository keeps its own layers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, codeOnly } from "../../scripts/check-architecture.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const LAYERS = [
  { name: "domain", files: ["src/domain/**/*.js"], packages: [], forbid: ["document"] },
  { name: "services", files: ["src/services/**/*.js"], packages: [] },
  { name: "ui", files: ["src/ui/**/*.js", "src/*.js", "!src/sw.js"], uses: ["services"], packages: ["pdfjs", "pdfjs/*"] },
];

const CLEAN = {
  "src/domain/a.js": "export const a = 1;\nexport default function b() {}\n",
  "src/services/s.js": "import b, { a as first } from \"../domain/a.js\";\nexport const s = () => b() + first;\n",
  "src/ui/u.js": "import {\n  s,\n} from '../services/s.js';\nexport const go = () => s();\n",
  "src/main.js": "import { go } from \"./ui/u.js\";\nimport \"pdfjs/worker\";\ngo();\n",
  "src/sw.js": "self.addEventListener('fetch', () => {});\n",
};

/** A made-up project: its files and an architecture.json; the findings' texts and the uses. */
function project(changes = {}, more = {}) {
  const root = mkdtempSync(join(tmpdir(), "architecture-"));
  for (const [path, text] of Object.entries({ ...CLEAN, ...changes })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const arch = { format: "design-rules architecture", version: 1, reader: "es-modules",
                 sources: ["src/**/*.js", "!src/sw.js"], layers: LAYERS, allow: [], ...more };
  writeFileSync(join(root, "architecture.json"), JSON.stringify(arch));
  const result = check(root);
  return { found: result.findings.map(f => f.text), uses: new Map(result.uses.map(u => [`${u.source} ${u.target}`, u])) };
}

test("a clean project has no findings, and every use with its names", () => {
  const { found, uses } = project();
  assert.deepEqual(found, []);
  assert.deepEqual([...uses.keys()].sort(), ["src/main.js src/ui/u.js", "src/services/s.js src/domain/a.js",
                                             "src/ui/u.js src/services/s.js"]);
  assert.deepEqual(uses.get("src/services/s.js src/domain/a.js").names, ["default", "a"]);
});

test("an import of a layer above", () => {
  const { found } = project({ "src/domain/a.js": "import { go } from '../ui/u.js';\nexport const a = go;\n" });
  assert.ok(found.includes("domain uses ui: src/domain/a.js takes go from src/ui/u.js"), found.join("\n"));
});

test("an import of a layer beneath that the layer's uses does not list", () => {
  const { found } = project({ "src/ui/u.js": "import { a } from '../domain/a.js';\nexport const go = a;\n" });
  assert.ok(found.includes("ui uses domain: src/ui/u.js takes a from src/domain/a.js; ui may use only itself and services"),
            found.join("\n"));
});

test("a cycle", () => {
  const { found } = project({ "src/domain/p.js": "import { q } from './q.js';\nexport const p = () => q();\n",
                              "src/domain/q.js": "import { p } from './p.js';\nexport const q = () => p();\n" });
  assert.ok(found.includes("A cycle: src/domain/p.js -> src/domain/q.js -> src/domain/p.js"), found.join("\n"));
});

test("a package a layer may not import, with its line", () => {
  const { found } = project({ "src/domain/a.js": "export const a = 1;\nimport { readFile } from 'node:fs';\n",
                              "src/main.js": "import { go } from './ui/u.js';\nimport 'lodash';\ngo();\n" });
  assert.ok(found.includes("src/domain/a.js imports node:fs, which the domain layer may not import (line 2)"), found.join("\n"));
  assert.ok(found.includes("src/main.js imports lodash, which the ui layer may not import (line 2)"), found.join("\n"));
});

test("a name a layer must keep out, in code but not in strings or comments", () => {
  const { found } = project({ "src/domain/a.js": "// document is not used here\nconst s = 'document';\n" +
                                                 "export const a = () => document.title;\nexport default function b() {}\n" });
  assert.deepEqual(found, ["src/domain/a.js uses document, which the domain layer must not use (line 3)"]);
});

test("a module in no layer, and one left out with an exclamation mark", () => {
  const { found, uses } = project({ "src/tools/x.js": "export const x = 1;\n" });
  assert.deepEqual(found, ["src/tools/x.js is in no layer: add it to one in architecture.json"]);
  assert.ok(![...uses.keys()].some(k => k.includes("src/sw.js")));
});

test("an import of a file that is not there, or that is in no layer", () => {
  const { found } = project({ "src/ui/u.js": "import { s } from '../services/s.js';\nimport './gone.js';\n" +
                                             "import { t } from '../../tools/t.js';\nexport const go = s;\n",
                              "tools/t.js": "export const t = 1;\n" });
  assert.ok(found.includes("src/ui/u.js imports ./gone.js, which is not there (line 2)"), found.join("\n"));
  assert.ok(found.includes("src/ui/u.js imports tools/t.js, which is in no layer: add it to one in architecture.json"),
            found.join("\n"));
});

test("imports in comments and strings do not count; import() is a use when it runs; export-from re-exports", () => {
  const { found, uses } = project({
    "src/domain/a.js": "/** @param {import(\"../ui/u.js\").Go} go */\n// import { go } from '../ui/u.js';\n" +
                       "const s = \"import x from '../ui/u.js'\";\nexport const a = 1;\nexport default function b() {}\n",
    "src/ui/u.js": "export { s } from '../services/s.js';\nexport const go = () => import('./late.js');\n",
    "src/ui/late.js": "export * from \"../services/s.js\";\n",
  });
  assert.deepEqual(found, []);
  assert.deepEqual(uses.get("src/ui/u.js src/services/s.js").names, ["s"]);
  assert.equal(uses.get("src/ui/u.js src/ui/late.js").load, false);
  assert.deepEqual(uses.get("src/ui/late.js src/services/s.js").names, ["*"]);
});

test("an allowed use is not reported", () => {
  const changes = { "src/ui/u.js": "import { a } from '../domain/a.js';\nexport const go = a;\n" };
  const { found } = project(changes, { allow: [{ from: "src/ui/u.js", to: "src/domain/*.js", why: "a test" }] });
  assert.deepEqual(found, []);
});

test("a key the check does not hold is an error saying what to do, not ignored", () => {
  assert.throws(() => project({}, { page: "index.html" }), /page.*not held by scripts\/check-architecture\.js/);
  assert.throws(() => project({}, { layers: [{ name: "domain", files: ["src/**/*.js"], uses: ["nope"] }] }),
                /domain layer may use "nope", which is no layer's name/);
});

test("a layer's why is words for readers: accepted, nothing checked", () => {
  const layers = LAYERS.map(layer => ({ ...layer, why: "what the layer is for" }));
  assert.deepEqual(project({}, { layers }).found, []);
});

test("code only: comments and the insides of strings blanked, positions kept, template code kept", () => {
  const text = "const a = 'x'; // y\nconst t = `a${b}c`; /* z */ const r = /re/g;";
  const code = codeOnly(text);
  assert.equal(code.length, text.length);
  assert.equal(code, "const a = ' ';     \nconst t = ` ${b} `;         const r = /  /g;");
});

test("this repository keeps the layers of its architecture.json", () => {
  const { findings, uses } = check(ROOT);
  assert.deepEqual(findings.map(f => f.text), []);
  assert.ok(uses.length > 100);
});

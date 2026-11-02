// Enforces the layers of ARCHITECTURE.md, written in architecture.json, to the design rules' layering contract
// (UA-SMARTLab/design-rules, skill/architecture.md). It fails on an import of a layer above, or of one beneath that a
// layer's "uses" does not list; a cycle between modules; a package a layer may not import; a name a layer must keep
// out; a module in no layer; and an import of a file that is not there. Run with `npm run check`; exits with an error
// listing every finding. Its own tests: tests/unit/architecture.test.js.
//
// The design rules' check_layers.py reads the same architecture.json, to cross-check this one and to draw the
// dependency matrix; this check needs nothing but Node, so it runs wherever the site is built.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FORMAT = "design-rules architecture";
const KEYS = new Set(["format", "version", "name", "about", "reader", "sources", "layers", "allow"]);
const LAYER_KEYS = new Set(["name", "why", "files", "uses", "packages", "forbid"]);
const IDENT = "[A-Za-z_$][\\w$]*";

/** The text with comments, the insides of strings and regular expression literals blanked, every position and line
 *  kept: what is code. A template's ${...} stays code. */
export function codeOnly(text) {
  const out = text.split(""), n = text.length, stack = [];
  let i = 0, last = "", depth = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < n) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      const j = text.indexOf("\n", i) < 0 ? n : text.indexOf("\n", i);
      blank(i, j); i = j;
    } else if (c === "/" && text[i + 1] === "*") {
      const j = text.indexOf("*/", i + 2) < 0 ? n : text.indexOf("*/", i + 2) + 2;
      blank(i, j); i = j;
    } else if (c === "'" || c === '"' || (c === "/" && (last === "" || "(,=:[!&|?{};+-*%<>~^".includes(last)))) {
      let j = i + 1, inClass = false;
      while (j < n && text[j] !== "\n") {
        if (text[j] === "\\") { j += 2; continue; }
        if (c === "/" && text[j] === "[") inClass = true;
        else if (c === "/" && text[j] === "]") inClass = false;
        else if (text[j] === c && !inClass) break;
        j++;
      }
      blank(i + 1, Math.min(j, n)); i = j + 1; last = c;
    } else if (c === "`" || (c === "}" && stack.length && stack.at(-1) === depth)) {
      if (c === "}") { stack.pop(); depth--; }
      let j = i + 1;
      while (j < n && text[j] !== "`" && !text.startsWith("${", j)) j += text[j] === "\\" ? 2 : 1;
      blank(i + 1, Math.min(j, n));
      if (text.startsWith("${", j)) { depth++; stack.push(depth); i = j + 2; } else i = j + 1;
      last = "`";
    } else {
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (!/\s/.test(c)) last = c;
      i++;
    }
  }
  return out.join("");
}

/** A glob as a regular expression: ** any folders, * any name part. */
function globRe(pattern) {
  const re = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\0").replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]").replace(/\0/g, "(?:.*/)?");
  return new RegExp(`^${re}$`);
}

function walk(root, dir, out) {
  if (!existsSync(join(root, dir))) return out;
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")) walk(root, p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** The files the patterns name, relative to root; a pattern starting with "!" leaves out what it names. */
function filesOf(root, patterns) {
  const found = new Set();
  for (const pattern of patterns) {
    const leave = pattern.startsWith("!"), glob = leave ? pattern.slice(1) : pattern;
    const base = glob.split("/").filter((part, k, all) => k < all.length - 1).reduce(
      (acc, part) => (acc.done || /[*?]/.test(part) ? { ...acc, done: true } : { path: acc.path ? `${acc.path}/${part}` : part }),
      { path: "" }).path;
    const re = globRe(glob);
    for (const p of walk(root, base, [])) if (re.test(p)) leave ? found.delete(p) : found.add(p);
  }
  return [...found].sort();
}

const matches = (path, pattern) => globRe(pattern).test(path);
const lineOf = (code, at) => code.slice(0, at).split("\n").length;

/** architecture.json, checked: an error says what is wrong and what to do. */
function load(root) {
  const file = join(root, "architecture.json");
  if (!existsSync(file)) throw new Error(`${file} is not there: write the layers, bottom first (ARCHITECTURE.md).`);
  const arch = JSON.parse(readFileSync(file, "utf8"));
  if (arch.format !== FORMAT || arch.reader !== "es-modules" || !Array.isArray(arch.layers))
    throw new Error(`${file} needs "format": "${FORMAT}", "reader": "es-modules" and "layers".`);
  const names = arch.layers.map(l => l.name);
  const unheld = [...Object.keys(arch).filter(k => !KEYS.has(k)),
                  ...arch.layers.flatMap(l => Object.keys(l).filter(k => !LAYER_KEYS.has(k)).map(k => `${l.name}.${k}`))];
  if (unheld.length)
    throw new Error(`${file} uses ${unheld.join(", ")}, not held by scripts/check-architecture.js: add it there with a test, or take it out.`);
  for (const layer of arch.layers)
    for (const other of layer.uses ?? [])
      if (!names.includes(other))
        throw new Error(`${file}: the ${layer.name} layer may use "${other}", which is no layer's name (${names.join(", ")}).`);
  return arch;
}

// A static import or export-from: between the keyword and "from" only names, "as", "*", braces and commas, which
// keeps "export const x = from('a')" out. The code has its strings blanked and their quotes kept.
const STATIC = /(?<![\w$.])(import|export)(?![\w$])([\w$*\s,{}]*?)\bfrom\s*(['"])/g;
const BARE = /(?<![\w$.])import\s*(['"])/g;
const DYNAMIC = /(?<![\w$.])import\s*\(\s*(['"])/g;

/** The names an import or export-from takes, as the target gives them: "default", "*" or its own names. */
function importedNames(keyword, clause) {
  const names = [], braces = clause.match(/\{([^{}]*)\}/);
  const head = (braces ? clause.slice(0, braces.index) : clause).trim();
  if (keyword === "import" && new RegExp(`^${IDENT}\\s*(?:,|$)`).test(head)) names.push("default");
  for (const entry of braces ? braces[1].split(",") : []) {
    const name = entry.match(new RegExp(`^\\s*(${IDENT})`));
    if (name) names.push(name[1]);
  }
  if (head.includes("*")) names.push("*");
  return names;
}

/** Each group of modules that import one another round in a circle, as one path through it (Tarjan's strongly
 *  connected components, in a fixed order so the same code gives the same answer). */
function cycles(uses) {
  const graph = new Map();
  for (const u of uses) {
    if (!graph.has(u.source)) graph.set(u.source, new Set());
    if (!graph.has(u.target)) graph.set(u.target, new Set());
    graph.get(u.source).add(u.target);
  }
  const index = new Map(), low = new Map(), on = new Set(), stack = [], groups = [];
  let counter = 0;
  const visit = v => {
    index.set(v, counter); low.set(v, counter++); stack.push(v); on.add(v);
    for (const w of [...graph.get(v)].sort()) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const group = [];
      let w;
      do { w = stack.pop(); on.delete(w); group.push(w); } while (w !== v);
      if (group.length > 1) groups.push(group.sort());
    }
  };
  for (const v of [...graph.keys()].sort()) if (!index.has(v)) visit(v);
  return groups.sort().map(group => {
    const start = group[0], inside = new Set(group), path = [start], seen = new Set(path);
    for (;;) {
      const nexts = [...graph.get(path.at(-1))].filter(w => inside.has(w)).sort();
      const step = nexts.find(w => !seen.has(w));
      if (step === undefined || (nexts.includes(start) && path.length > 1)) { path.push(start); break; }
      path.push(step); seen.add(step);
    }
    return { kind: "cycle", text: `A cycle: ${path.join(" -> ")}` };
  });
}

/** Every use between the project's modules, and every finding. */
export function check(root) {
  const arch = load(root), layerOf = new Map(), order = new Map(), named = new Map();
  arch.layers.forEach((layer, k) => {
    order.set(layer.name, k); named.set(layer.name, layer);
    for (const p of filesOf(root, layer.files)) if (!layerOf.has(p)) layerOf.set(p, layer.name);
  });
  const findings = [], found = new Map();
  const add = (kind, text) => findings.push({ kind, text });
  for (const p of filesOf(root, arch.sources ?? []))
    if (!layerOf.has(p)) add("placement", `${p} is in no layer: add it to one in architecture.json`);
  for (const path of [...layerOf.keys()].sort()) {
    const text = readFileSync(join(root, path), "utf8"), code = codeOnly(text), layer = named.get(layerOf.get(path));
    const hits = [...[...code.matchAll(STATIC)].map(m => [m.index, m.index + m[0].length - 1, true, importedNames(m[1], m[2])]),
                  ...[...code.matchAll(BARE)].map(m => [m.index, m.index + m[0].length - 1, true, []]),
                  ...[...code.matchAll(DYNAMIC)].map(m => [m.index, m.index + m[0].length - 1, false, ["*"]])]
      .sort((a, b) => a[0] - b[0]);
    for (const [at, quote, load, names] of hits) {
      const spec = text.slice(quote + 1, text.indexOf(text[quote], quote + 1)), line = lineOf(code, at);
      if (!spec.startsWith(".") && !spec.startsWith("/")) {
        if (layer.packages && !layer.packages.some(p => matches(spec, p)))
          add("package", `${path} imports ${spec}, which the ${layer.name} layer may not import (line ${line})`);
        continue;
      }
      const plain = spec.split(/[?#]/)[0];
      const target = plain.startsWith("/") ? posix.normalize(plain.slice(1))
        : relative(root, resolve(root, dirname(path), plain)).split(sep).join("/");
      if (!existsSync(join(root, target)) || !statSync(join(root, target)).isFile()) {
        add("name", `${path} imports ${spec}, which is not there (line ${line})`);
        continue;
      }
      if (!layerOf.has(target)) { add("placement", `${path} imports ${target}, which is in no layer: add it to one in architecture.json`); continue; }
      if (target === path) continue;
      const key = `${path}\n${target}`;
      if (!found.has(key)) found.set(key, { source: path, target, names: [], load: false });
      const use = found.get(key);
      for (const name of names.length ? names : ["(loads it)"]) if (!use.names.includes(name)) use.names.push(name);
      use.load ||= load;
    }
    for (const word of layer.forbid ?? []) {
      const hit = code.match(new RegExp(`(?<![\\w$.])${word.replace(/[$.]/g, "\\$&")}(?![\\w$])`));
      if (hit) add("forbid", `${path} uses ${word}, which the ${layer.name} layer must not use (line ${lineOf(code, hit.index)})`);
    }
  }
  const uses = [...found.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  const kept = uses.filter(u => !(arch.allow ?? []).some(a => matches(u.source, a.from) && matches(u.target, a.to)));
  for (const u of kept) {
    const above = layerOf.get(u.source), below = layerOf.get(u.target), listed = named.get(above).uses;
    const what = `${above} uses ${below}: ${u.source} takes ${u.names.join(", ")} from ${u.target}`;
    if (order.get(below) > order.get(above)) add("layer", what);
    else if (below !== above && listed && !listed.includes(below)) {
      const may = ["itself", ...listed];
      add("layer", `${what}; ${above} may use only ${may.length > 1 ? `${may.slice(0, -1).join(", ")} and ${may.at(-1)}` : may[0]}`);
    }
  }
  findings.push(...cycles(kept));
  return { uses, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const { uses, findings } = check(root);
    if (findings.length) {
      console.error(`Architecture: ${findings.length} finding(s)\n` + findings.map(f => "  " + f.text).join("\n"));
      process.exit(1);
    }
    console.log(`Architecture: the layers of architecture.json hold (${uses.length} imports between modules).`);
  } catch (error) {
    console.error(`Architecture: ${error.message}`);
    process.exit(2);
  }
}

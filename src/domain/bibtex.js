/**
 * BibTeX for the library: one entry per publication note, from the note's properties, and a stable cite
 * key per note (the `citekey` property).
 *
 *   parseAuthors(text, { surnamesOnly })  → [{ last, first, corporate? }]
 *       Full names: "Piers Forster; Trude Storelvmo; Nees Jan van Eck", "Simpson, TW; Bobuk, A",
 *       "Mikkola, J.H.; Gassmann, O.", "Ulrike von Luxburg", "Karl Ulrich & Steven Eppinger", "Ulrich, K. T.".
 *       Surnames only (the as-cited form of the file name, surnamesOnly): "Baldwin & Clark",
 *       "Stone Wood & Crawford", "Cordella, Alfieri, Clemm & Berwald", "Talens Peiró et al.".
 *       Corporate authors ("World Steel Association") are kept whole. "et al." becomes the author "others".
 *   authorsOf(paper)              parseAuthors on the note; surnames only when `authors` is the as-cited form
 *   citekeyFor(paper)             → "ulrich1995": first author's surname (ASCII, lower case) + year ("nd" if none);
 *                                   a corporate author gives its initials ("wsa2022")
 *   assignCitekeys(papers)        → Map note name → cite key: existing `citekey` properties are kept, new ones
 *                                   get a, b, c… when they would collide; deterministic (by library number)
 *   bibtexEntry(paper, key, { pdf })  → the entry text
 *   libraryBibtex(papers, keys, { pdfOf, generated })  → the whole file
 * @module domain/bibtex
 */
import { compareCodePoints } from "./text-rules.js";

const PARTICLES = new Set(["van", "von", "de", "der", "den", "del", "della", "di", "da", "le", "la", "du", "dos", "das", "ter", "ten", "af", "zu", "i", "y"]);
const CORPORATE = /\b(organi[sz]ation|institute|institution|association|commission|committee|council|agency|union|society|standardi[sz]ation|parliament|ministry|foundation|university|alliance|consortium|cent(?:re|er)|office|department|bureau|board|europe|international|federation|network|programme|program|initiative|platform|group)\b/i;
const SEP = /\s*(?:&|\band\b)\s*/;

const surname = s => ({ last: s.trim(), first: "" });
const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "Nees Jan van Eck" → { first: "Nees Jan", last: "van Eck" }; "Simpson TW" → { last: "Simpson", first: "TW" }. */
function splitName(full) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return surname(parts[0] ?? "");
  if (/^[A-Z]{1,3}$/.test(parts.at(-1)) && parts.length >= 2) return { last: parts.slice(0, -1).join(" "), first: parts.at(-1) };
  let i = parts.length - 1;
  while (i > 0 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  if (i === 0) i = parts.length - 1;
  return { last: parts.slice(i).join(" "), first: parts.slice(0, i).join(" ") };
}

/** "Last, First" when the part after the comma looks like given names or initials. */
function lastFirst(item) {
  const [last, first, ...rest] = item.split(",").map(x => x.trim());
  if (first === undefined || rest.length) return null;
  if (/^[A-Z][A-Za-z.\- ]*$/.test(first) && (/[.\- ]/.test(first) || first.length <= 3 || /^[A-Z][a-z]+$/.test(first))) return { last, first };
  return null;
}

/** Space-separated surnames, particles kept with the following word ("van Eck", "den Hollander"). */
function surnames(text) {
  const out = [];
  let pending = [];
  for (const w of text.trim().split(/\s+/).filter(Boolean)) {
    if (PARTICLES.has(w.toLowerCase())) { pending.push(w); continue; }
    out.push(surname([...pending, w].join(" ")));
    pending = [];
  }
  return out;
}

export function parseAuthors(text, { surnamesOnly = false } = {}) {
  let s = String(text ?? "").trim();
  if (!s) return [];
  const etAl = /\bet al\.?$/i.test(s);
  s = s.replace(/\bet al\.?$/i, "").replace(/[,;\s]+$/, "").trim();
  let names;
  if (surnamesOnly) {
    if (s.includes(",")) names = s.split(/,|&|\band\b/).map(x => x.trim()).filter(Boolean).map(surname);
    else if (SEP.test(s)) names = s.split(SEP).flatMap(surnames);
    else names = [s.split(/\s+/).length >= 2 && CORPORATE.test(s) ? { last: s, first: "", corporate: true } : surname(s)];   // one compound surname, or an organisation
  } else if (s.includes(";")) {
    names = s.split(";").map(x => x.trim()).filter(Boolean).map(item => lastFirst(item) ?? (item.includes(",") ? surname(item.split(",")[0]) : splitName(item)));
  } else if (!SEP.test(s) && !s.includes(",") && s.split(/\s+/).length >= 2 && CORPORATE.test(s)) {
    names = [{ last: s, first: "", corporate: true }];                           // "World Steel Association"
  } else if (SEP.test(s) && !s.includes(",")) names = s.split(SEP).map(x => x.trim()).filter(Boolean).map(splitName);
  else if (s.includes(",")) {
    const one = lastFirst(s);
    names = one && !SEP.test(s) ? [one] : s.split(/,|&|\band\b/).map(x => x.trim()).filter(Boolean).map(surname);
  } else names = [splitName(s)];
  if (etAl) names.push(surname("others"));
  return names.filter(n => n.last);
}

/** The note's authors; the file name's as-cited form ("Baldwin & Clark") carries surnames only. */
export const authorsOf = paper => parseAuthors(paper.authors, { surnamesOnly: !paper.authors || fold(paper.authors) === fold(paper.cite ?? "") });

const ascii = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
const initials = s => s.split(/\s+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join("");

export function citekeyFor(paper) {
  const first = authorsOf(paper)[0] ?? surname(String(paper.cite ?? "").split(/[\s,&]+/)[0] ?? "");
  const name = first.corporate ? ascii(initials(first.last)) : ascii(first.last);
  const year = /^\d{4}/.test(paper.year) ? paper.year.slice(0, 4) : "nd";
  return `${name || "anon"}${year}`;
}

export function assignCitekeys(papers) {
  const keys = new Map(), used = new Set();
  for (const p of papers) if (p.citekey && !used.has(p.citekey)) { keys.set(p.stem, p.citekey); used.add(p.citekey); }
  const ordered = [...papers].filter(p => !keys.has(p.stem)).sort((a, b) => a.no - b.no || compareCodePoints(a.stem, b.stem));
  for (const p of ordered) {
    const base = citekeyFor(p);
    let key = base, n = 0;
    while (used.has(key)) key = base + String.fromCharCode(97 + n++);
    keys.set(p.stem, key);
    used.add(key);
  }
  return keys;
}

const TYPES = {
  "journal-article": ["article", "journal"], "magazine-article": ["article", "journal"], "web-article": ["misc", "howpublished"],
  "conference-paper": ["inproceedings", "booktitle"], "book-chapter": ["incollection", "booktitle"], book: ["book", "publisher"],
  thesis: ["phdthesis", "school"], "technical-report": ["techreport", "institution"], report: ["techreport", "institution"],
  "working-paper": ["techreport", "institution"], standard: ["misc", "organization"], dataset: ["misc", "publisher"],
};

const escape = s => String(s).replace(/[{}]/g, "").replace(/([&%$#_])/g, "\\$1");
/** Words with capitals after the first letter (DSM, IoT) keep their case in BibTeX. */
const protectCase = s => s.split(" ").map(w => (/^.+[A-Z]/.test(w) ? `{${w}}` : w)).join(" ");
const scalarUrl = p => (Array.isArray(p.props?.url) ? "" : String(p.props?.url ?? ""));
const bibName = n => (n.corporate ? `{${escape(n.last)}}` : n.first ? `${escape(n.last)}, ${escape(n.first)}` : escape(n.last));

export function bibtexEntry(paper, key, { pdf = "" } = {}) {
  const [type, venueField] = TYPES[paper.type] ?? ["misc", "howpublished"];
  const fields = [
    ["author", authorsOf(paper).map(bibName).join(" and ")], ["title", protectCase(escape(paper.title))], ["year", /^\d{4}/.test(paper.year) ? paper.year.slice(0, 4) : ""],
    [venueField, escape(paper.journal)], ["doi", String(paper.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, "")], ["url", escape(scalarUrl(paper))],
    ["keywords", (paper.tags ?? []).map(escape).join(", ")], ["abstract", escape(paper.abstract ?? "")],
    ["file", pdf ? `:${pdf}:PDF` : ""], ["note", `Library No. ${String(paper.no).padStart(3, "0")}`],
  ].filter(([, v]) => v);
  const width = Math.max(...fields.map(([k]) => k.length));
  return `@${type}{${key},\n${fields.map(([k, v]) => `  ${k.padEnd(width)} = {${v}}`).join(",\n")}\n}\n`;
}

export function libraryBibtex(papers, keys, { pdfOf = () => "", generated = "" } = {}) {
  const head = `% BibTeX export of the publication library (${papers.length} entries)${generated ? `, generated ${generated}` : ""} by Library Studio.\n% Generated from the notes in 98 - Publications: edit the notes, not this file. Cite keys = the notes' citekey property.\n\n`;
  return head + [...papers].sort((a, b) => a.no - b.no).map(p => bibtexEntry(p, keys.get(p.stem), { pdf: pdfOf(p) })).join("\n");
}

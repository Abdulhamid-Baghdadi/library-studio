/**
 * The text of a publication note as the cluster analysis sees it, and TF-IDF vectors over those texts.
 * A port of the text handling of the Python analysis (scikit-learn TfidfVectorizer).
 *
 *   contentLines(body)        the lines of the sections that describe the paper (reader-perspective sections dropped)
 *   boilerplate(notes, min)   lines (normalised) repeated verbatim in `min` or more notes: template text, not content
 *   noteText(note, boiler)    one string per note: title twice, tags, cleaned body without boilerplate
 *   tokens(text)              lower-cased word tokens (letters, 3+ characters, hyphens allowed inside)
 *   tfidf(texts, options)     { vocab, idf, rows } — sublinear tf, smooth idf, l2-normalised rows,
 *                             unigrams + bigrams, stop words removed before the bigrams are formed,
 *                             terms kept when 2 ≤ df ≤ maxDf · n (sklearn defaults as used in the analysis)
 *   cosineMatrix(rows, n)     Float64Array n×n of cosine similarities (diagonal 0)
 *   centroid(rows, members, size)   mean vector of some rows (Float64Array over the vocabulary)
 * @module domain/cluster-text
 */
import { ENGLISH_STOP_WORDS } from "./stopwords.js";
import { compareCodePoints, splitLines } from "./text-rules.js";

/** Words that appear in nearly every note of this library and carry no topical signal. */
export const DOMAIN_STOPWORDS = [
  "modularity", "modular", "module", "modules", "design", "designs", "product",
  "products", "paper", "study", "why", "matters", "key", "findings", "useful",
  "takeaway", "approach", "limits", "research", "question", "questions", "method",
  "methods", "pdf", "doi", "https", "org", "www", "vs", "e.g", "i.e",
];

export const STOP_WORDS = new Set([...ENGLISH_STOP_WORDS, ...DOMAIN_STOPWORDS]);

/** Sections written from the reader's perspective rather than about the paper. */
export const READER_SECTIONS = /open gaps|research gaps|questions for this research|questions raised|my interpretation|most useful insight|implications for modular electronics|for my research/i;

export function contentLines(body) {
  const kept = [];
  for (const sec of String(body).split(/^#{1,6} /m)) {
    const nl = sec.indexOf("\n");
    const heading = nl < 0 ? sec : sec.slice(0, nl);
    const rest = nl < 0 ? "" : sec.slice(nl + 1);
    if (!READER_SECTIONS.test(heading)) kept.push(rest);
  }
  return splitLines(kept.join("\n")).filter(l => l.trim());
}

const norm = line => line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** @param {{lines: string[]}[]} notes */
export function boilerplate(notes, min = 3) {
  const df = new Map();
  for (const n of notes) {
    for (const k of new Set(n.lines.map(norm))) {
      if (k.split(" ").length >= 4) df.set(k, (df.get(k) || 0) + 1);
    }
  }
  return new Set([...df].filter(([, c]) => c >= min).map(([k]) => k));
}

/** @param {{title: string, tags: string[], lines: string[]}} note @param {Set<string>} boiler */
export function noteText(note, boiler) {
  const kept = note.lines.filter(l => !boiler.has(norm(l)));
  let clean = kept.join("\n").replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2");   // keep link aliases
  clean = clean.replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, " ");                     // drop maths
  clean = clean.replace(/[#>*=`|\-]+/g, " ");
  return [note.title, note.title, note.tags.join(" ").replaceAll("-", " "), clean].join(" ");
}

// Python's \b in Unicode mode: between a word character ([\p{L}\p{N}_]) and a non-word one.
const B = String.raw`(?:(?<=[\p{L}\p{N}_])(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?=[\p{L}\p{N}_]))`;
const TOKEN = new RegExp(`${B}[a-zA-Z][a-zA-Z\\-]{2,}${B}`, "gu");

export function tokens(text) {
  return String(text).toLowerCase().match(TOKEN) ?? [];
}

function ngrams(words, max = 2) {
  const out = [...words];
  for (let n = 2; n <= Math.min(max, words.length); n++) {
    for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * @param {string[]} texts
 * @param {{stopWords?: Set<string>, minDf?: number, maxDf?: number, ngram?: number}} [options]
 * @returns {{vocab: string[], idf: Float64Array, rows: {idx: Int32Array, val: Float64Array}[]}}
 */
export function tfidf(texts, { stopWords = STOP_WORDS, minDf = 2, maxDf = 0.5, ngram = 2 } = {}) {
  const docs = texts.map(t => ngrams(tokens(t).filter(w => !stopWords.has(w)), ngram));
  const n = docs.length;
  const df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const high = maxDf * n;
  const vocab = [...df].filter(([, c]) => c >= minDf && c <= high).map(([t]) => t).sort(compareCodePoints);
  const col = new Map(vocab.map((t, i) => [t, i]));
  const idf = Float64Array.from(vocab, t => Math.log((1 + n) / (1 + df.get(t))) + 1);
  const rows = docs.map(d => {
    const counts = new Map();
    for (const t of d) { const c = col.get(t); if (c !== undefined) counts.set(c, (counts.get(c) || 0) + 1); }
    const idx = Int32Array.from([...counts.keys()].sort((a, b) => a - b));
    const val = Float64Array.from(idx, i => (1 + Math.log(counts.get(i))) * idf[i]);
    let norm2 = 0;
    for (const v of val) norm2 += v * v;
    const s = norm2 > 0 ? 1 / Math.sqrt(norm2) : 0;
    for (let i = 0; i < val.length; i++) val[i] *= s;
    return { idx, val };
  });
  return { vocab, idf, rows };
}

function dot(a, b) {
  let i = 0, j = 0, s = 0;
  while (i < a.idx.length && j < b.idx.length) {
    if (a.idx[i] === b.idx[j]) { s += a.val[i] * b.val[j]; i++; j++; }
    else if (a.idx[i] < b.idx[j]) i++; else j++;
  }
  return s;
}

export function cosineMatrix(rows, n = rows.length) {
  const S = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) { const s = dot(rows[i], rows[j]); S[i * n + j] = s; S[j * n + i] = s; }
  }
  return S;
}

export function centroid(rows, members, size) {
  const c = new Float64Array(size);
  for (const m of members) { const r = rows[m]; for (let k = 0; k < r.idx.length; k++) c[r.idx[k]] += r.val[k]; }
  if (members.length) for (let k = 0; k < size; k++) c[k] /= members.length;
  return c;
}

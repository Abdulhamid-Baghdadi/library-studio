/**
 * Cluster discovery over the publication library: the whole analysis as a pure function of the notes and
 * the settings (the only randomness is the seed), returning everything the hub notes, the report, the
 * graph presets and the page need.
 *
 *   DEFAULTS                     the settings and their default values
 *   STEPS                        the eight step names shown while it runs
 *   clusterNotes(papers, dir)    the notes as the analysis sees them (stem, path, index, title, categories, tags, links, lines)
 *   analyze(papers, settings, { onStep, libraryDir })  → Analysis
 *
 * Method (as in the Python analysis this replaces):
 *   graph       TF-IDF cosine similarity between mutual k-nearest neighbours + shared tags (idf-weighted)
 *               + explicit wikilinks (similarity-graph.js)
 *   clusters    Leiden (modularity with resolution γ, or CPM with density threshold γ) or Louvain, repeated
 *               `runs` times with different seeds and combined by consensus clustering (community.js)
 *   robustness  CPM sweep over density thresholds 1, 2, 4, 8, 16, 32 × the graph density
 *   quality     modularity Q of the final partition
 *   roles       participation coefficient P, within-module degree z, betweenness → bridge papers
 *   labels      terms whose TF-IDF weight is highest in the cluster relative to the rest of the library
 *   agreement   NMI and ARI against each note's first `category` (concept map)
 *   layout      clusters on a ring, spring layout inside each cluster (for the map and the graph presets)
 * @module domain/cluster-analysis
 */
import { boilerplate, centroid, contentLines, noteText, tfidf } from "./cluster-text.js";
import { consensusPartition, disconnectedCount, leiden, modularity } from "./community.js";
import { ari, betweenness, clusterLayout, nmi, nodeRoles, weightedDensity } from "./graph-metrics.js";
import { LIBRARY_DIR } from "./publications.js";
import { createRandom } from "./random.js";
import { buildGraph } from "./similarity-graph.js";
import { fixed, general } from "./text-rules.js";

export const DEFAULTS = {
  wText: 1.0, k: 5, wTag: 0.5, wLink: 0.5,
  algorithm: "leiden", quality: "modularity", resolution: 1.0, gamma: null,
  runs: 100, threshold: 0.5, bridgeP: 0.5, seed: 42, dryRun: true,
};

export const STEPS = [
  "Reading publication notes", "Building similarity graph", "Detecting communities", "Robustness check",
  "Node roles and labels", "Comparing with concept maps", "Writing hub notes and report", "Writing graph presets",
];

export const SWEEP_FACTORS = [1, 2, 4, 8, 16, 32];

/** @param {import("./publications.js").Paper[]} papers */
export function clusterNotes(papers, libraryDir = LIBRARY_DIR) {
  return papers.map(p => ({
    stem: p.stem, path: `${libraryDir}/${p.stem}.md`, index: p.index, title: p.title, year: p.year,
    categories: p.categories, tags: p.tags, links: p.links, lines: contentLines(p.body),
  }));
}

/** Settings as numbers, with the γ of the quality function resolved. */
export function normalizeSettings(settings = {}) {
  const o = { ...DEFAULTS };
  for (const [k, v] of Object.entries(settings)) {
    if (v === undefined || v === null || v === "") { if (k === "gamma") o.gamma = null; continue; }
    o[k] = ["algorithm", "quality"].includes(k) ? String(v) : k === "dryRun" ? Boolean(v) : Number(v);
  }
  if (!["leiden", "louvain"].includes(o.algorithm)) throw new Error(`Unknown algorithm "${o.algorithm}"`);
  if (!["modularity", "cpm"].includes(o.quality)) throw new Error(`Unknown quality "${o.quality}"`);
  if (o.algorithm === "louvain" && o.quality !== "modularity") throw new Error("Louvain is only available with modularity; use Leiden for CPM.");
  for (const k of ["k", "runs"]) if (!(Number.isInteger(o[k]) && o[k] >= 1)) throw new Error(`${k} must be a whole number ≥ 1`);
  for (const k of ["wText", "wTag", "wLink", "threshold", "bridgeP", "resolution"]) if (!Number.isFinite(o[k])) throw new Error(`${k} must be a number`);
  return o;
}

/**
 * @typedef {object} Analysis
 * @property {object} options  the settings used, with `gammaUsed`
 * @property {object[]} notes  clusterNotes with `text`
 * @property {number[][]} parts  clusters (node indices), largest first
 * @property {number[]} stability  per node
 * @property {{terms: string[], tags: string[]}[]} labels  per cluster
 * @property {Set<number>} bridges  bridge papers (node indices)
 * @property {[number, number][]} pos  layout per node @property {[number, number][]} centres  per cluster
 */

/**
 * @param {import("./publications.js").Paper[]} papers
 * @param {Partial<typeof DEFAULTS>} settings
 * @param {{onStep?: (n: number, text: string, detail: string) => void, libraryDir?: string}} [p]
 * @returns {Analysis}
 */
export function analyze(papers, settings = {}, { onStep = () => {}, libraryDir = LIBRARY_DIR } = {}) {
  const o = normalizeSettings(settings);
  onStep(1, STEPS[0], "frontmatter, tags, links, summary text");
  const notes = clusterNotes(papers, libraryDir);
  const boiler = boilerplate(notes);
  for (const x of notes) x.text = noteText(x, boiler);
  const n = notes.length;
  if (n < 3) throw new Error(`Only ${n} publication notes found; the analysis needs at least 3.`);

  onStep(2, STEPS[1], `${n} notes; text k=${o.k}, weights text/tag/link = ${o.wText}/${o.wTag}/${o.wLink}`);
  const X = tfidf(notes.map(x => x.text));
  const { graph, layers, layerCounts } = buildGraph(notes, X, o);
  const density = weightedDensity(graph);
  let gamma = o.gamma ?? (o.quality === "modularity" ? o.resolution : null);
  if (gamma == null) gamma = 4 * density;                       // CPM default: 4 × overall density

  onStep(3, STEPS[2], `${o.algorithm} + ${o.quality}, γ = ${general(gamma)}, ${o.runs} runs -> consensus (threshold ${o.threshold})`);
  const { communities: parts, stability } = consensusPartition(graph, {
    algorithm: o.algorithm, quality: o.quality, gamma, runs: o.runs, threshold: o.threshold, random: createRandom(o.seed),
  });
  const disconnected = disconnectedCount(graph, parts);

  onStep(4, STEPS[3], `CPM sweep over ${SWEEP_FACTORS.length} density thresholds`);
  const sweep = cpmSweep(graph, parts, o.seed, density);
  const Q = modularity(graph, parts);

  onStep(5, STEPS[4], "participation coefficient P, within-module z, betweenness, TF-IDF terms");
  const { P, z, member } = nodeRoles(graph, parts);
  const B = betweenness(graph);
  const labels = parts.map(p => labelCluster(p, notes, X));
  const topB = Array.from({ length: n }, (_, i) => i).sort((a, b) => B[b] - B[a] || a - b).slice(0, Math.max(3, Math.floor(n / 20)));
  const bridges = new Set([...Array.from({ length: n }, (_, i) => i).filter(i => P[i] >= o.bridgeP), ...topB]);

  const cats = notes.map(x => x.categories[0] ?? "none");
  const pred = Array.from(member);
  const nmiValue = nmi(cats, pred), ariValue = ari(cats, pred);
  onStep(6, STEPS[5], `NMI = ${fixed(nmiValue, 2)}, ARI = ${fixed(ariValue, 2)}`);

  const { pos, centres } = clusterLayout(graph, parts, { random: createRandom(o.seed) });
  return {
    options: { ...o, gammaUsed: gamma }, notes, boiler, X, graph, layers, layerCounts, density,
    parts, stability, disconnected, sweep, Q, P, z, B, member, labels, bridges, cats, nmi: nmiValue, ari: ariValue, pos, centres,
  };
}

/**
 * CPM with increasing density thresholds γ = factor × overall density. Returns one row per γ and, per
 * main cluster, the mean share of its members that stay together in one CPM community.
 */
export function cpmSweep(graph, parts, seed, density = weightedDensity(graph), factors = SWEEP_FACTORS) {
  const n = graph.n;
  const main = new Int32Array(n);
  parts.forEach((p, c) => { for (const i of p) main[i] = c; });
  const rows = [], kept = new Float64Array(parts.length);
  for (const f of factors) {
    const gamma = density * f;
    const cp = leiden(graph, { quality: "cpm", gamma, random: createRandom(seed) });
    const member = new Int32Array(n);
    cp.forEach((q, c) => { for (const i of q) member[i] = c; });
    const real = cp.filter(q => q.length >= 2).length;
    rows.push({
      factor: f, gamma, communities: real, largest: Math.max(0, ...cp.map(q => q.length)),
      singletons: cp.filter(q => q.length === 1).length, nmi: nmi(Array.from(main), Array.from(member)),
    });
    parts.forEach((p, c) => {
      const count = new Map();
      for (const i of p) count.set(member[i], (count.get(member[i]) || 0) + 1);
      kept[c] += Math.max(...count.values()) / p.length;
    });
  }
  return { density, rows, robustness: Array.from(kept, k => k / factors.length) };
}

/** Distinctive terms of a cluster (TF-IDF weight in the cluster minus the rest) and its shared tags. */
export function labelCluster(p, notes, X, top = 6) {
  const size = X.vocab.length;
  const inside = new Set(p);
  const rest = notes.map((_, i) => i).filter(i => !inside.has(i));
  const c = centroid(X.rows, p, size);
  const other = rest.length ? centroid(X.rows, rest, size) : new Float64Array(size);
  const order = Array.from({ length: size }, (_, i) => i).sort((a, b) => (c[b] - other[b]) - (c[a] - other[a]) || a - b);
  const picked = [];
  for (const i of order.slice(0, top * 3)) {
    const t = X.vocab[i];
    if (!picked.some(q => t.includes(q) || q.includes(t))) picked.push(t);   // avoid "dsm" + "dsm clustering"
    if (picked.length === top) break;
  }
  const tagCount = new Map();
  for (const i of p) for (const t of notes[i].tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  const tags = [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 5).filter(([, n]) => n > 1).map(([t]) => t);
  return { terms: picked, tags };
}

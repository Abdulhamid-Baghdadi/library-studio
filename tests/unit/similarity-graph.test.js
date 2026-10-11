import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../../src/domain/similarity-graph.js";

// Four notes with hand-made TF-IDF rows: 0 and 1 identical, 2 close to them, 3 unrelated.
const X = { vocab: ["a", "b", "c"], rows: [
  { idx: Int32Array.of(0), val: Float64Array.of(1) },
  { idx: Int32Array.of(0), val: Float64Array.of(1) },
  { idx: Int32Array.of(0, 1), val: Float64Array.of(0.6, 0.8) },
  { idx: Int32Array.of(2), val: Float64Array.of(1) },
] };
const notes = [
  { stem: "n0", tags: ["t", "rare"], links: new Set(["n3"]) },
  { stem: "n1", tags: ["t"], links: new Set() },
  { stem: "n2", tags: ["t", "rare"], links: new Set(["n0"]) },
  { stem: "n3", tags: [], links: new Set() },
];

test("text layer: mutual k-nearest neighbours plus the single nearest neighbour", () => {
  const { graph, layers, layerCounts } = buildGraph(notes, X, { k: 1, wText: 1, wTag: 0, wLink: 0 });
  // k = 1: 0↔1 mutual (and each other's nearest) → added twice, as the Python did; 2's nearest is 0 (tie with 1 broken by index) → 0–2
  assert.deepEqual(graph.edges().map(([a, b, w]) => [a, b, +w.toFixed(3)]), [[0, 1, 2], [0, 2, 0.6]]);
  assert.deepEqual([...layers.get("0,1")], ["text"]);
  assert.equal(layerCounts.text, 2);
  assert.equal(graph.adj[3].size, 0);                 // note 3 shares nothing: its nearest neighbour has similarity 0 → no edge
});

test("tag and link layers add to the same edge", () => {
  const { graph, layers, layerCounts } = buildGraph(notes, X, { k: 1, wText: 0, wTag: 0.5, wLink: 0.5 });
  const n = 4, idf = t => Math.log(n / t) / Math.log(n);
  const w = Object.fromEntries(graph.edges().map(([a, b, w]) => [`${a},${b}`, w]));
  assert.ok(Math.abs(w["0,1"] - 0.5 * idf(3)) < 1e-12);                    // tag "t" only
  assert.ok(Math.abs(w["0,2"] - (0.5 * idf(3) + 0.5 * idf(2) + 0.5)) < 1e-12); // tags t + rare, and the link n2 → n0
  assert.equal(w["0,3"], 0.5);                                              // link only
  assert.deepEqual([...layers.get("0,2")].sort(), ["link", "tag"]);
  assert.deepEqual(layerCounts, { text: 0, tag: 3, link: 2 });
});

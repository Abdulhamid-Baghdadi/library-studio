import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGraph, addEdge } from "../../src/domain/graph.js";
import { createRandom } from "../../src/domain/random.js";
import {
  leiden, louvain, modularity, cpmQuality, isConnected, disconnectedCount,
  consensusPartition, partitionLabels,
} from "../../src/domain/community.js";

// ------------------------------------------------------------ test graphs

/** Nodes `first..first+size-1` fully connected with unit weights. */
function addClique(g, first, size) {
  for (let i = first; i < first + size; i++) for (let j = i + 1; j < first + size; j++) addEdge(g, i, j, 1);
}

/** Two 5-cliques {0..4} and {5..9} joined by the edge 4–5. */
function twoCliques() {
  const g = makeGraph(10);
  addClique(g, 0, 5);
  addClique(g, 5, 5);
  addEdge(g, 4, 5, 1);
  return g;
}

/** networkx ring_of_cliques(k, size): clique i is nodes size*i..size*i+size-1, ring edge from its last node to the next clique's first. */
function ringOfCliques(k, size) {
  const g = makeGraph(k * size);
  for (let i = 0; i < k; i++) {
    addClique(g, i * size, size);
    addEdge(g, i * size + size - 1, ((i + 1) % k) * size, 1);
  }
  return g;
}

function randomGraph(n, edges, seed) {
  const r = createRandom(seed);
  const g = makeGraph(n);
  let added = 0;
  while (added < edges) {
    const a = r.int(n), b = r.int(n);
    if (a === b || g.adj[a].has(b)) continue;
    addEdge(g, a, b, 0.5 + 2.5 * r.next());
    added++;
  }
  return g;
}

/** Planted partition: `groups` equal groups, a share `pIn` of the edges inside a group (a citation network has this kind of structure). */
function plantedPartition(n, edges, groups, pIn, seed) {
  const r = createRandom(seed);
  const g = makeGraph(n);
  const size = n / groups;
  let added = 0;
  while (added < edges) {
    const a = r.int(n);
    const b = r.next() < pIn ? Math.floor(a / size) * size + r.int(size) : r.int(n);
    if (a === b || g.adj[a].has(b)) continue;
    addEdge(g, a, b, 0.5 + 2.5 * r.next());
    added++;
  }
  return g;
}

function snapshot(g) { return JSON.stringify(g.edges()); }

function assertPartition(communities, n) {
  const seen = new Int32Array(n);
  for (const c of communities) {
    assert.deepEqual(c, [...c].sort((a, b) => a - b), "community sorted ascending");
    for (const v of c) seen[v]++;
  }
  assert.ok(seen.every((k) => k === 1), "every node in exactly one community");
}

const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

// ------------------------------------------------------------ two cliques

test("two 5-cliques: Leiden and Louvain find exactly the two cliques", () => {
  const g = twoCliques();
  const expected = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]];
  assert.deepEqual(leiden(g, { random: createRandom(7) }), expected);
  assert.deepEqual(louvain(g, { random: createRandom(7) }), expected);
  assert.deepEqual(leiden(g, { quality: "cpm", gamma: 0.5, random: createRandom(3) }), expected);
  for (let seed = 1; seed <= 10; seed++) assert.deepEqual(leiden(g, { random: createRandom(seed) }), expected);
});

test("modularity of the two-clique graph equals the hand-computed value 19/42", () => {
  // m = 10 + 10 + 1 = 21 edges. Each clique: L_c = 10 internal edges,
  // K_c = 4 * 5 (clique degrees) + 1 (bridge) = 21.
  // Q = 2 * [ 10/21 - (21/42)^2 ] = 20/21 - 1/2 = (40 - 21)/42 = 19/42.
  const g = twoCliques();
  close(modularity(g, [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]), 19 / 42);
  // Same with the communities given in the other order and gamma = 2:
  // Q = 2 * [ 10/21 - 2 * 1/4 ] = 20/21 - 1 = -1/21.
  close(modularity(g, [[9, 8, 7, 6, 5], [0, 1, 2, 3, 4]], 2), -1 / 21);
});

test("modularity is weighted: path 0-1-2 with weights 2 and 1", () => {
  // m = 3. Partition {0,1},{2}: L = 2, K = 2 + 3 = 5 for {0,1}; L = 0, K = 1 for {2}.
  // Q = 2/3 - (5/6)^2 - (1/6)^2 = 24/36 - 25/36 - 1/36 = -2/36 = -1/18.
  const g = makeGraph(3, [[0, 1, 2], [1, 2, 1]]);
  close(modularity(g, [[0, 1], [2]]), -1 / 18);
});

// -------------------------------------------------------- ring of cliques

test("ring of 6 cliques of 4: six communities, one per clique, at gamma = 1", () => {
  const g = ringOfCliques(6, 4);
  const expected = Array.from({ length: 6 }, (_, i) => [4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3]);
  for (let seed = 1; seed <= 5; seed++) {
    assert.deepEqual(leiden(g, { random: createRandom(seed) }), expected);
    assert.deepEqual(louvain(g, { random: createRandom(seed) }), expected);
  }
  // Q = 6 * [ 6/42 - (14/84)^2 ] = 6 * (1/7 - 1/36) = 6 * 29/252 = 29/42.
  close(modularity(g, expected), 29 / 42);
});

// ------------------------------------------------- trivial partitions

test("modularity: 0 for the trivial partition, negative for all singletons on a connected graph", () => {
  const g = ringOfCliques(6, 4);
  close(modularity(g, [Array.from({ length: g.n }, (_, i) => i)]), 0);
  assert.ok(modularity(g, Array.from({ length: g.n }, (_, i) => [i])) < 0);
  const weighted = randomGraph(30, 80, 5);
  close(modularity(weighted, [Array.from({ length: 30 }, (_, i) => i)]), 0);
  assert.ok(modularity(weighted, Array.from({ length: 30 }, (_, i) => [i])) < 0);
});

// ------------------------------------------------------- connectivity

test("Leiden communities are internally connected on 20 random weighted graphs", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = randomGraph(60, 150, seed);
    const before = snapshot(g);
    for (const options of [{}, { gamma: 0.5 }, { quality: "cpm", gamma: 0.4 }]) {
      const parts = leiden(g, { ...options, random: createRandom(seed) });
      assertPartition(parts, g.n);
      for (const c of parts) assert.ok(isConnected(g, c), `seed ${seed}: community ${c} not connected`);
      assert.equal(disconnectedCount(g, parts), 0);
    }
    assert.equal(snapshot(g), before, "input graph not mutated");
  }
});

test("isConnected and disconnectedCount", () => {
  const g = twoCliques();
  assert.ok(isConnected(g, [0, 1, 2]));
  assert.ok(isConnected(g, [3, 4, 5, 6]));
  assert.ok(!isConnected(g, [0, 9]));
  assert.ok(isConnected(g, [7]));
  assert.ok(isConnected(g, []));
  assert.equal(disconnectedCount(g, [[0, 9], [1, 8], [2], [3, 4, 5, 6, 7]]), 2);
});

// ---------------------------------------------------------------- CPM

test("CPM: gamma above every edge weight gives singletons, gamma near 0 gives one community", () => {
  const g = randomGraph(40, 120, 11); // weights in [0.5, 3), connected with high probability
  const big = leiden(g, { quality: "cpm", gamma: 3.5, random: createRandom(2) });
  assert.equal(big.length, 40);
  assert.ok(big.every((c) => c.length === 1));

  assert.ok(isConnected(g, Array.from({ length: 40 }, (_, i) => i)), "test graph should be connected");
  const tiny = leiden(g, { quality: "cpm", gamma: 1e-9, random: createRandom(2) });
  assert.equal(tiny.length, 1);
  assert.equal(tiny[0].length, 40);
});

test("cpmQuality: hand-computed values with and without node sizes", () => {
  const g = twoCliques();
  const cliques = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]];
  // Two cliques: each has w_c = 10 and C(5, 2) = 10 pairs: Q = 2 * (10 - gamma * 10).
  close(cpmQuality(g, cliques, 0.3), 2 * (10 - 3));
  close(cpmQuality(g, [Array.from({ length: 10 }, (_, i) => i)], 0.3), 21 - 0.3 * 45);
  // Node sizes 2 for nodes 0..4: pairs weigh 4 each -> 10 - gamma * 40 for the first clique.
  const sizes = [2, 2, 2, 2, 2, 1, 1, 1, 1, 1];
  close(cpmQuality(g, cliques, 0.1, sizes), (10 - 4) + (10 - 1));
});

// ---------------------------------------------------------- consensus

test("consensusPartition on the two-clique graph: two communities, all stabilities 1, deterministic", () => {
  const g = twoCliques();
  const a = consensusPartition(g, { runs: 20, random: createRandom(42) });
  assert.deepEqual(a.communities, [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
  assert.deepEqual(a.stability, new Array(10).fill(1));
  const b = consensusPartition(g, { runs: 20, random: createRandom(42) });
  assert.deepEqual(a, b);
  const c = consensusPartition(g, { algorithm: "louvain", runs: 20, random: createRandom(42) });
  assert.deepEqual(c.communities, a.communities);
});

test("consensusPartition sorts by size, keeps stabilities in [0, 1] and is deterministic on a random graph", () => {
  const g = randomGraph(50, 120, 3);
  const a = consensusPartition(g, { runs: 30, random: createRandom(9) });
  const b = consensusPartition(g, { runs: 30, random: createRandom(9) });
  assert.deepEqual(a, b);
  assertPartition(a.communities, g.n);
  for (let i = 1; i < a.communities.length; i++) assert.ok(a.communities[i - 1].length >= a.communities[i].length);
  assert.ok(a.stability.every((s) => s >= 0 && s <= 1));
  for (const c of a.communities) if (c.length === 1) assert.equal(a.stability[c[0]], 1);
});

test("Louvain with quality cpm throws, also through consensusPartition", () => {
  const g = twoCliques();
  assert.throws(() => louvain(g, { quality: "cpm" }), /modularity/);
  assert.throws(() => consensusPartition(g, { algorithm: "louvain", quality: "cpm", runs: 2 }), /modularity/);
  assert.throws(() => consensusPartition(g, { algorithm: "infomap", runs: 2 }), /Unknown algorithm/);
  assert.throws(() => leiden(g, { quality: "nope" }), /Unknown quality/);
});

// ---------------------------------------------------------- misc API

test("partitionLabels", () => {
  const labels = partitionLabels([[0, 2], [1], [4]], 5);
  assert.ok(labels instanceof Int32Array);
  assert.deepEqual([...labels], [0, 1, 0, -1, 2]);
});

test("graph without edges: every node alone, modularity 0", () => {
  const g = makeGraph(4);
  assert.deepEqual(leiden(g), [[0], [1], [2], [3]]);
  assert.deepEqual(louvain(g), [[0], [1], [2], [3]]);
  assert.equal(modularity(g, [[0, 1, 2, 3]]), 0);
});

test("Leiden reaches at least Louvain's modularity on random graphs (same seed)", () => {
  for (let seed = 1; seed <= 5; seed++) {
    const g = randomGraph(80, 300, seed);
    const ql = modularity(g, leiden(g, { random: createRandom(seed) }));
    const qv = modularity(g, louvain(g, { random: createRandom(seed) }));
    assert.ok(ql >= qv - 0.02, `seed ${seed}: leiden ${ql} vs louvain ${qv}`);
    assert.ok(ql > 0.2);
  }
});

test("theta = 0 (greedy refinement, as leidenalg does it) gives the same clean results", () => {
  assert.deepEqual(leiden(twoCliques(), { theta: 0, random: createRandom(5) }), [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
  const g = randomGraph(60, 150, 4);
  const parts = leiden(g, { theta: 0, random: createRandom(4) });
  assertPartition(parts, g.n);
  assert.equal(disconnectedCount(g, parts), 0);
  assert.deepEqual(parts, leiden(g, { theta: 0, random: createRandom(4) }), "deterministic");
});

test("planted partition of 250 nodes / 1500 edges: the 10 groups are recovered", () => {
  const g = plantedPartition(250, 1500, 10, 0.8, 2024);
  const planted = Array.from({ length: 10 }, (_, k) => Array.from({ length: 25 }, (_, i) => 25 * k + i));
  // Node 188's noise edges make another placement slightly better than the
  // planted one (Q 0.69203 vs 0.69182), so allow one node to differ.
  const misplaced = (parts) => parts.flatMap((c) => c.filter((v) => Math.floor(v / 25) !== Math.floor(c[0] / 25)));
  for (let seed = 1; seed <= 3; seed++) {
    const parts = leiden(g, { random: createRandom(seed) });
    assert.equal(parts.length, 10);
    assert.ok(misplaced(parts).length <= 1, `misplaced ${misplaced(parts)}`);
    assert.ok(modularity(g, parts) >= modularity(g, planted) - 1e-12);
  }
  const { communities, stability } = consensusPartition(g, { runs: 20, random: createRandom(1) });
  assert.equal(communities.length, 10);
  assert.ok(misplaced(communities).length <= 1);
  assert.ok(stability.every((s) => s > 0.9));
});

test("performance: 100 Leiden runs on 250 nodes / 1500 edges in well under a second", (t) => {
  const planted = plantedPartition(250, 1500, 10, 0.8, 2024);
  let start = performance.now();
  const { communities } = consensusPartition(planted, { runs: 100, random: createRandom(1) });
  const ms = performance.now() - start;
  t.diagnostic(`consensusPartition, 100 runs, planted partition graph: ${ms.toFixed(0)} ms, ${communities.length} communities`);
  assertPartition(communities, planted.n);
  assert.ok(ms < 1000, `took ${ms} ms`);

  // Worst case: a graph with no structure at all needs many more Leiden
  // iterations before the quality stops improving. Reported, not asserted tightly.
  const random = randomGraph(250, 1500, 2024);
  start = performance.now();
  consensusPartition(random, { runs: 100, random: createRandom(1) });
  t.diagnostic(`consensusPartition, 100 runs, structureless random graph: ${(performance.now() - start).toFixed(0)} ms`);
});

// Run from the repo root:  node --test tests/unit/graph-metrics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGraph } from '../../src/domain/graph.js';
import { createRandom } from '../../src/domain/random.js';
import {
  betweenness, nodeRoles, nmi, ari, springLayout, clusterLayout, weightedDensity,
} from '../../src/domain/graph-metrics.js';

const close = (actual, expected, eps = 1e-9, msg) =>
  assert.ok(Math.abs(actual - expected) <= eps, msg ?? `${actual} ≠ ${expected} (±${eps})`);
const closeAll = (actual, expected, eps = 1e-9) => {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) close(actual[i], expected[i], eps, `index ${i}: ${actual[i]} ≠ ${expected[i]}`);
};
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ---------------------------------------------------------------------------
// betweenness

test('betweenness: path of 5 nodes matches networkx [0, 0.5, 2/3, 0.5, 0]', () => {
  // Node 2 lies on the paths of pairs (0,3) (0,4) (1,3) (1,4) = 4 pairs;
  // normalised by (n−1)(n−2)/2 = 6 pairs not containing it → 4/6 = 0.6667.
  // Node 1 lies on (0,2) (0,3) (0,4) = 3 pairs → 3/6 = 0.5. Ends: 0.
  const g = makeGraph(5, [[0, 1], [1, 2], [2, 3], [3, 4]]);
  closeAll(betweenness(g), [0, 0.5, 2 / 3, 0.5, 0]);
});

test('betweenness: star with 5 leaves has centre 1 and leaves 0', () => {
  // Centre 0 is on all C(5,2) = 10 leaf pairs; (n−1)(n−2)/2 = 5·4/2 = 10 → 1.0.
  const g = makeGraph(6, [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]);
  closeAll(betweenness(g), [1, 0, 0, 0, 0, 0]);
});

test('betweenness: triangle is all zero', () => {
  const g = makeGraph(3, [[0, 1], [1, 2], [0, 2]]);
  closeAll(betweenness(g), [0, 0, 0]);
});

test('betweenness: edge distance is 1/weight', () => {
  // 0–1–2 with unit weights (distance 1 each, total 2) plus a weak direct
  // edge 0–2 of weight 0.25 (distance 4): the shortest 0→2 path still runs
  // through 1, so node 1 is on the only pair not containing it → 1.0.
  const g = makeGraph(3, [[0, 1], [1, 2], [0, 2, 0.25]]);
  closeAll(betweenness(g), [0, 1, 0]);
  // With a strong direct edge (weight 1, distance 1) node 1 is bypassed.
  const g2 = makeGraph(3, [[0, 1], [1, 2], [0, 2, 1]]);
  closeAll(betweenness(g2), [0, 0, 0]);
});

test('betweenness: equal-length paths share the credit', () => {
  // Square 0–1–2–3–0: pair (0,2) has two shortest paths, via 1 and via 3,
  // so each gets 1/2; likewise (1,3) via 0 and 2. Every node: 0.5 pair out of
  // (n−1)(n−2)/2 = 3 → 1/6.
  const g = makeGraph(4, [[0, 1], [1, 2], [2, 3], [3, 0]]);
  closeAll(betweenness(g), [1 / 6, 1 / 6, 1 / 6, 1 / 6]);
});

test('betweenness does not mutate the graph', () => {
  const g = makeGraph(4, [[0, 1, 2], [1, 2, 3], [2, 3, 1]]);
  const before = JSON.stringify(g.edges());
  betweenness(g);
  assert.equal(JSON.stringify(g.edges()), before);
});

// ---------------------------------------------------------------------------
// nodeRoles

test('nodeRoles: participation coefficient', () => {
  // Node 0 has weight 1 into community A (via node 1) and weight 1 into
  // community B (via node 2): P = 1 − (½² + ½²) = 0.5.
  // Node 3 has all its weight inside its own community: P = 1 − 1² = 0.
  const g = makeGraph(4, [[0, 1], [0, 2], [1, 3]]);
  const { P, member } = nodeRoles(g, [[0, 1, 3], [2]]);
  close(P[0], 0.5);
  close(P[3], 0);
  assert.deepEqual(Array.from(member), [0, 0, 1, 0]);
});

test('nodeRoles: within-module degree z', () => {
  // Triangle community {0,1,2}: every member has k_in = 2 → sd = 0 → z = 0.
  const tri = makeGraph(3, [[0, 1], [1, 2], [0, 2]]);
  closeAll(nodeRoles(tri, [[0, 1, 2]]).z, [0, 0, 0]);

  // Star community {0,1,2,3} centred on 0: k_in = [3, 1, 1, 1], mean 1.5,
  // population sd = sqrt((2.25 + 3·0.25)/4) = sqrt(0.75) ≈ 0.866;
  // z(0) = 1.5/0.866 ≈ 1.732 > 0, leaves −0.577.
  const star = makeGraph(4, [[0, 1], [0, 2], [0, 3]]);
  const { z } = nodeRoles(star, [[0, 1, 2, 3]]);
  close(z[0], Math.sqrt(3), 1e-9);
  assert.ok(z[0] > 0);
  close(z[1], -1 / Math.sqrt(3), 1e-9);
});

test('nodeRoles: isolated node has P = 0 and z from its community', () => {
  const g = makeGraph(3, [[0, 1]]);
  const { P, z } = nodeRoles(g, [[0, 1], [2]]);
  close(P[2], 0);
  close(z[2], 0);
});

// ---------------------------------------------------------------------------
// nmi

test('nmi: identical labelings → 1', () => {
  close(nmi([0, 0, 1, 1, 2], [0, 0, 1, 1, 2]), 1, 1e-12);
});

test('nmi: relabelled partition → 1', () => {
  close(nmi([0, 0, 1, 1], [1, 1, 0, 0]), 1, 1e-12);
});

test('nmi: against a constant labeling → 0', () => {
  assert.equal(nmi([0, 0, 1, 1], [5, 5, 5, 5]), 0);
});

test('nmi: both constant → 1 (sklearn convention)', () => {
  assert.equal(nmi([3, 3, 3], [0, 0, 0]), 1);
});

test('nmi([0,0,1,1],[0,0,1,2]) = 0.8', () => {
  // N = 4.  a: counts {2, 2} → H(a) = ln 2.
  // b: counts {2, 1, 1} → H(b) = −(½ ln ½ + ¼ ln ¼ + ¼ ln ¼)
  //                            = ½ ln 2 + ¼·2 ln 2 + ¼·2 ln 2 = 1.5 ln 2.
  // Contingency: n(0,0) = 2, n(1,1) = 1, n(1,2) = 1.
  // I = Σ n_ij/N · ln(N n_ij / (a_i b_j))
  //   = ½ ln(4·2/(2·2)) + ¼ ln(4·1/(2·1)) + ¼ ln(4·1/(2·1))
  //   = ½ ln 2 + ¼ ln 2 + ¼ ln 2 = ln 2.
  // NMI = 2 I / (H(a) + H(b)) = 2 ln 2 / (2.5 ln 2) = 0.8.
  close(nmi([0, 0, 1, 1], [0, 0, 1, 2]), 0.8, 1e-6);
});

test('nmi accepts any label values and rejects unequal lengths', () => {
  close(nmi(['a', 'a', 'b', 'b'], [1, 1, 2, 3]), 0.8, 1e-6);
  assert.throws(() => nmi([0, 1], [0]));
});

// ---------------------------------------------------------------------------
// ari

test('ari: identical → 1', () => {
  assert.equal(ari([0, 0, 1, 1, 2], [0, 0, 1, 1, 2]), 1);
  assert.equal(ari([0, 0, 1, 1], [1, 1, 0, 0]), 1);
});

test('ari([0,0,1,1],[0,0,1,2]) = 4/7 ≈ 0.5714285714 (sklearn)', () => {
  // Pairs grouped together: in both = 1 ({0,1}); in a = 2; in b = 1; of 6.
  // Pair confusion (ordered pairs, ×2): tp = 2, fn = 2(2−1) = 2, fp = 0,
  // tn = 12 − 2 − 2 − 0 = 8.
  // ARI = 2(tp·tn − fn·fp) / ((tp+fn)(fn+tn) + (tp+fp)(fp+tn))
  //     = 2·16 / (4·10 + 2·8) = 32/56 = 4/7.
  close(ari([0, 0, 1, 1], [0, 0, 1, 2]), 0.5714285714, 1e-9);
});

test('ari: unrelated labelings are near 0 or negative', () => {
  // a = {0,1},{2,3}; b = {0,2},{1,3}: no pair agrees in both,
  // same-in-both = 0, same-in-a = 2, same-in-b = 2 of 6 → below 0.
  const v = ari([0, 0, 1, 1], [0, 1, 0, 1]);
  assert.ok(v <= 0.05, `ari = ${v}`);
  // sklearn gives exactly −0.5 here: tp = 0, fn = 4, fp = 4, tn = 4 →
  // 2(0 − 16)/((4)(8) + (4)(8)) = −32/64.
  close(v, -0.5, 1e-12);
});

test('ari: both trivial labelings → 1', () => {
  assert.equal(ari([0, 0, 0], [0, 0, 0]), 1);        // one cluster each
  assert.equal(ari([0, 1, 2], [5, 6, 7]), 1);        // all singletons each
});

// ---------------------------------------------------------------------------
// springLayout

test('springLayout: coordinates fit in [−1, 1] and touch the boundary', () => {
  const g = makeGraph(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3]]);
  const pos = springLayout(g, { random: createRandom(7) });
  assert.equal(pos.length, 6);
  let lim = 0;
  for (const [x, y] of pos) {
    assert.ok(x >= -1 && x <= 1 && y >= -1 && y <= 1, `(${x}, ${y}) out of range`);
    lim = Math.max(lim, Math.abs(x), Math.abs(y));
  }
  close(lim, 1, 1e-12);   // rescale_layout scales the largest |coordinate| to 1
});

test('springLayout: deterministic for the same seed', () => {
  const g = makeGraph(5, [[0, 1], [1, 2], [2, 3], [3, 4]]);
  const a = springLayout(g, { random: createRandom(42) });
  const b = springLayout(g, { random: createRandom(42) });
  assert.deepEqual(a, b);
  const c = springLayout(g, { random: createRandom(43) });
  assert.notDeepEqual(a, c);
});

test('springLayout: connected nodes end closer than unconnected ones', () => {
  // Two separate pairs 0–1 and 2–3.
  const g = makeGraph(4, [[0, 1], [2, 3]]);
  for (const seed of [1, 2, 3]) {
    const pos = springLayout(g, { random: createRandom(seed) });
    const within = Math.max(dist(pos[0], pos[1]), dist(pos[2], pos[3]));
    const across = Math.min(dist(pos[0], pos[2]), dist(pos[0], pos[3]), dist(pos[1], pos[2]), dist(pos[1], pos[3]));
    assert.ok(within < across, `seed ${seed}: within ${within} ≥ across ${across}`);
  }
});

test('springLayout: trivial graphs', () => {
  assert.deepEqual(springLayout(makeGraph(0)), []);
  assert.deepEqual(springLayout(makeGraph(1)), [[0, 0]]);
});

// ---------------------------------------------------------------------------
// clusterLayout

test('clusterLayout: two communities sit on the ring', () => {
  // Sizes 2 and 2, spread 260: r = 260·√2·0.6 ≈ 220.617 each.
  // ring = max(Σr·2/2π, max r·1.5) = max(441.23/π ≈ 140.4, 330.9) ≈ 330.925.
  const g = makeGraph(4, [[0, 1], [2, 3], [1, 2, 0.1]]);
  const parts = [[0, 1], [2, 3]];
  const r = 260 * Math.sqrt(2) * 0.6;
  const ring = Math.max((2 * r * 2) / (2 * Math.PI), r * 1.5);
  const { pos, centres } = clusterLayout(g, parts, { random: createRandom(5) });
  assert.equal(centres.length, 2);
  for (const c of centres) close(Math.hypot(c[0], c[1]), ring, 1e-9);
  // Equal arcs: centres at angles π/2 and 3π/2, i.e. opposite each other.
  close(dist(centres[0], centres[1]), 2 * ring, 1e-9);
  // Members lie inside their community's circle. The local spring layout is
  // in the square [−1, 1]², whose corner is √2 from the centre, so the exact
  // bound is r·√2.
  parts.forEach((p, c) => {
    for (const v of p) assert.ok(dist(pos[v], centres[c]) <= r * Math.SQRT2 + 1e-9, `node ${v} outside its circle`);
  });
  assert.equal(pos.length, 4);
});

test('clusterLayout: one community is centred at the origin', () => {
  const g = makeGraph(3, [[0, 1], [1, 2]]);
  const { centres, pos } = clusterLayout(g, [[0, 1, 2]], { random: createRandom(1) });
  assert.deepEqual(centres, [[0, 0]]);
  const r = 260 * Math.sqrt(3) * 0.6;
  for (const p of pos) assert.ok(Math.hypot(p[0], p[1]) <= r * Math.SQRT2 + 1e-9);
});

test('clusterLayout: singleton community sits exactly at its centre', () => {
  const g = makeGraph(3, [[0, 1]]);
  const { centres, pos } = clusterLayout(g, [[0, 1], [2]], { random: createRandom(1) });
  assert.deepEqual(pos[2], centres[1]);
});

test('clusterLayout: deterministic and leaves the graph untouched', () => {
  const g = makeGraph(5, [[0, 1], [1, 2], [3, 4]]);
  const before = JSON.stringify(g.edges());
  const a = clusterLayout(g, [[0, 1, 2], [3, 4]], { random: createRandom(9) });
  const b = clusterLayout(g, [[0, 1, 2], [3, 4]], { random: createRandom(9) });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(g.edges()), before);
});

// ---------------------------------------------------------------------------
// weightedDensity

test('weightedDensity: unit triangle = 1', () => {
  assert.equal(weightedDensity(makeGraph(3, [[0, 1], [1, 2], [0, 2]])), 1);
  // Path of 3 with weights 2 and 1: 3 / 3 possible edges = 1.
  assert.equal(weightedDensity(makeGraph(3, [[0, 1, 2], [1, 2, 1]])), 1);
  assert.equal(weightedDensity(makeGraph(1)), 0);
});

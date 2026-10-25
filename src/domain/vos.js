/**
 * The VOS methods of VOSviewer (Van Eck & Waltman 2009, 2010; Waltman, Van Eck & Noyons 2010) for a co-occurrence
 * network such as co-citations: normalisation, clustering and mapping.
 *
 *   associationStrength(nodes, pairs)
 *       [[i, j, s]] for the pairs whose two works are both in `nodes` (i, j = positions in `nodes`):
 *       s_ij = 2m c_ij / (c_i c_j), with c_i the total co-occurrence of i and m the total over all pairs, both
 *       counted inside `nodes`. 1 means the pair occurs as often as expected by chance.
 *   vosClusters(nodes, pairs, { resolution = 1, runs = 20 })
 *       → { cluster: Map node → cluster index, count, quality }. VOSviewer's own clustering: the Constant Potts
 *       Model on association strength (communities.js leiden, quality "cpm"); the best of `runs` runs with seeds
 *       1 … runs. Clusters are numbered by size, largest first.
 *   vosLayout(n, pairs, { starts = 10, iterations = 1500, seed = 100 })
 *       → [[x, y]] for nodes 0 … n−1: minimises Σ s_ij d_ij² − Σ d_ij (attraction 2, repulsion 1) by gradient
 *       steps with an adaptive step length, from `starts` random starts (seeds seed, seed + 1, …); the best map is
 *       centred and turned so that its widest spread lies along x.
 * Deterministic for the same input: all randomness comes from random.js.
 * @module domain/vos
 */
import { cpmQuality, leiden } from "./community.js";
import { makeGraph } from "./graph.js";
import { createRandom } from "./random.js";

export function associationStrength(nodes, pairs) {
  const pos = new Map(nodes.map((v, i) => [v, i]));
  const total = new Float64Array(nodes.length);
  let m = 0;
  const kept = [];
  for (const [a, b, c] of pairs) {
    if (!pos.has(a) || !pos.has(b)) continue;
    const i = pos.get(a), j = pos.get(b);
    total[i] += c; total[j] += c; m += c;
    kept.push([i, j, c]);
  }
  return kept.map(([i, j, c]) => [i, j, (2 * m * c) / (total[i] * total[j])]);
}

export function vosClusters(nodes, pairs, { resolution = 1, runs = 20 } = {}) {
  const g = makeGraph(nodes.length, associationStrength(nodes, pairs));
  let best = null, quality = -Infinity;
  for (let seed = 1; seed <= runs; seed++) {
    const parts = leiden(g, { quality: "cpm", gamma: resolution, random: createRandom(seed) });
    const q = cpmQuality(g, parts, resolution);
    if (q > quality) { quality = q; best = parts; }
  }
  const cluster = new Map();
  best.forEach((part, k) => part.forEach(i => cluster.set(nodes[i], k)));
  return { cluster, count: best.length, quality };
}

export function vosLayout(n, pairs, { starts = 10, iterations = 1500, seed = 100 } = {}) {
  if (n === 0) return [];
  if (n === 1) return [[0, 0]];
  const S = new Float64Array(n * n);
  for (const [i, j, s] of pairs) { S[i * n + j] = s; S[j * n + i] = s; }
  const stress = x => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(x[2 * i] - x[2 * j], x[2 * i + 1] - x[2 * j + 1]);
        v += S[i * n + j] * d * d - d;
      }
    }
    return v;
  };
  let best = null, bestV = Infinity;
  for (let start = 0; start < starts; start++) {
    const random = createRandom(seed + start);
    const x = Float64Array.from({ length: 2 * n }, () => random.next() * 2 - 1);
    let step = 1, v = stress(x), improved = 0;
    for (let it = 0; it < iterations && step > 1e-4; it++) {
      for (const i of random.shuffle([...Array(n).keys()])) {
        let gx = 0, gy = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = x[2 * i] - x[2 * j], dy = x[2 * i + 1] - x[2 * j + 1], d = Math.hypot(dx, dy) || 1e-9;
          const s = S[i * n + j];
          gx += 2 * s * dx - dx / d;
          gy += 2 * s * dy - dy / d;
        }
        const length = Math.hypot(gx, gy) || 1;
        x[2 * i] -= step * gx / length;
        x[2 * i + 1] -= step * gy / length;
      }
      const next = stress(x);
      if (next < v) { if (++improved >= 5) { step /= 0.9; improved = 0; } } else { step *= 0.9; improved = 0; }
      v = next;
    }
    if (v < bestV) { bestV = v; best = x; }
  }
  // centre, then turn onto the principal axis
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += best[2 * i]; my += best[2 * i + 1]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const a = best[2 * i] - mx, b = best[2 * i + 1] - my; sxx += a * a; syy += b * b; sxy += a * b; }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy), cos = Math.cos(-angle), sin = Math.sin(-angle);
  return [...Array(n).keys()].map(i => { const a = best[2 * i] - mx, b = best[2 * i + 1] - my; return [a * cos - b * sin, a * sin + b * cos]; });
}

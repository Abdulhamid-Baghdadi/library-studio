/**
 * Graph metrics for Library Studio: ports of the networkx / scikit-learn
 * functions the Python analysis used, on the weighted undirected graph of
 * `graph.js`. Pure functions; nothing here mutates its input graph, and the
 * only source of randomness is the `random` option (see `random.js`), so the
 * same seed always gives the same result.
 *
 *   betweenness(graph)
 *     → Float64Array, normalised betweenness centrality per node
 *       (Brandes 2001 with Dijkstra, edge distance = 1 / weight;
 *       networkx `betweenness_centrality(G, weight="distance", normalized=True)`).
 *
 *   nodeRoles(graph, communities)
 *     → { P, z, member } (Guimerà & Amaral 2005):
 *       P[i]      participation coefficient, 1 − Σ_c (w_ic / s_i)²
 *       z[i]      within-module degree, (k_in − mean) / sd over i's community
 *       member[i] index of i's community in `communities` (−1 if in none)
 *
 *   nmi(a, b)   → normalised mutual information of two labelings
 *                 (2·I / (H(a) + H(b)), natural log; sklearn's default).
 *   ari(a, b)   → adjusted Rand index (sklearn `adjusted_rand_score`).
 *
 *   springLayout(graph, { random, k, iterations = 50 })
 *     → [[x, y], …] per node, Fruchterman–Reingold as networkx
 *       `spring_layout(weight="weight")`, rescaled to fit in [−1, 1].
 *
 *   clusterLayout(graph, communities, { random, spread = 260 })
 *     → { pos, centres }: communities placed on a ring, each laid out with
 *       its own spring layout inside a circle of radius spread·√size·0.6.
 *
 *   weightedDensity(graph) → total edge weight / (n(n − 1)/2).
 *
 * `communities` is always an array of arrays of node indices (a partition).
 */
import { subgraph } from './graph.js';
import { createRandom } from './random.js';

// ---------------------------------------------------------------------------
// Betweenness centrality (Brandes 2001, "A faster algorithm for betweenness
// centrality"), weighted variant: shortest paths by Dijkstra where the length
// of an edge is 1 / weight, so strong ties are short.

/** Binary min-heap of Dijkstra entries, ordered by (distance, insertion order). */
class MinHeap {
  constructor() { this.items = []; this.counter = 0; }
  get size() { return this.items.length; }
  push(dist, pred, node) {
    const items = this.items;
    items.push({ dist, order: this.counter++, pred, node });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!MinHeap.less(items[i], items[parent])) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < items.length && MinHeap.less(items[l], items[m])) m = l;
        if (r < items.length && MinHeap.less(items[r], items[m])) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top;
  }
  static less(a, b) { return a.dist < b.dist || (a.dist === b.dist && a.order < b.order); }
}

export function betweenness(graph) {
  const n = graph.n;
  const bc = new Float64Array(n);
  const sigma = new Float64Array(n);   // number of shortest paths s → v
  const seen = new Float64Array(n);    // best tentative distance so far
  const done = new Uint8Array(n);      // settled by Dijkstra
  const delta = new Float64Array(n);   // dependency of s on v
  const pred = Array.from({ length: n }, () => []);
  const order = [];                    // nodes in order of settling

  for (let s = 0; s < n; s++) {
    sigma.fill(0); seen.fill(Infinity); done.fill(0); delta.fill(0);
    for (const p of pred) p.length = 0;
    order.length = 0;

    // Single-source shortest paths (networkx `_single_source_dijkstra_path_basic`).
    sigma[s] = 1;
    seen[s] = 0;
    const heap = new MinHeap();
    heap.push(0, -1, s);
    while (heap.size) {
      const { dist, pred: p, node: v } = heap.pop();
      if (done[v]) continue;
      if (p >= 0) sigma[v] += sigma[p];
      done[v] = 1;
      order.push(v);
      for (const [w, weight] of graph.adj[v]) {
        const vw = dist + 1 / weight;
        if (!done[w] && vw < seen[w]) {
          seen[w] = vw;
          heap.push(vw, v, w);
          sigma[w] = 0;
          pred[w] = [v];
        } else if (vw === seen[w]) {       // another shortest path to w
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }

    // Back-propagate dependencies (networkx `_accumulate_basic`).
    while (order.length) {
      const w = order.pop();
      const coeff = (1 + delta[w]) / sigma[w];
      for (const v of pred[w]) delta[v] += sigma[v] * coeff;
      if (w !== s) bc[w] += delta[w];
    }
  }

  // Undirected: every pair was counted from both ends, so halve; then
  // normalise by the number of ordered pairs not containing the node,
  // 2 / ((n − 1)(n − 2)) (networkx `_rescale`, normalized=True).
  if (n > 2) {
    const scale = 0.5 * 2 / ((n - 1) * (n - 2));
    for (let i = 0; i < n; i++) bc[i] *= scale;
  }
  return bc;
}

// ---------------------------------------------------------------------------
// Node roles (Guimerà & Amaral 2005, "Functional cartography of complex
// metabolic networks"): participation coefficient P and within-module
// degree z-score, with weights in place of degree counts.

export function nodeRoles(graph, communities) {
  const n = graph.n;
  const member = new Int32Array(n).fill(-1);
  communities.forEach((part, c) => { for (const v of part) member[v] = c; });

  const P = new Float64Array(n);
  const z = new Float64Array(n);
  const kIn = new Float64Array(n);                 // weight into own community
  const wc = new Float64Array(communities.length); // weight from i into each community

  for (let i = 0; i < n; i++) {
    wc.fill(0);
    let s = 0;
    for (const [j, w] of graph.adj[i]) {
      s += w;
      if (member[j] >= 0) wc[member[j]] += w;
    }
    if (s > 0) {
      // P_i = 1 − Σ_c (w_ic / s_i)²
      let sum = 0;
      for (const w of wc) sum += (w / s) * (w / s);
      P[i] = 1 - sum;
    }
    if (member[i] >= 0) kIn[i] = wc[member[i]];
  }

  for (const part of communities) {
    if (part.length === 0) continue;
    // z_i = (k_in − mean) / sd, mean and population sd over the community.
    let mean = 0;
    for (const v of part) mean += kIn[v];
    mean /= part.length;
    let variance = 0;
    for (const v of part) variance += (kIn[v] - mean) ** 2;
    const sd = Math.sqrt(variance / part.length);
    for (const v of part) z[v] = sd > 0 ? (kIn[v] - mean) / sd : 0;
  }
  return { P, z, member };
}

// ---------------------------------------------------------------------------
// Comparing two labelings (clusterings) of the same items.

/** Contingency table of two labelings: row/column totals and cell counts. */
function contingency(a, b) {
  if (a.length !== b.length) throw new Error(`labelings differ in length (${a.length} vs ${b.length})`);
  const rows = new Map(), cols = new Map(), cells = new Map();
  for (let i = 0; i < a.length; i++) {
    rows.set(a[i], (rows.get(a[i]) || 0) + 1);
    cols.set(b[i], (cols.get(b[i]) || 0) + 1);
    let row = cells.get(a[i]);
    if (!row) cells.set(a[i], row = new Map());
    row.set(b[i], (row.get(b[i]) || 0) + 1);
  }
  return { n: a.length, rows, cols, cells };
}

/** Shannon entropy in nats of a distribution given as counts. */
function entropy(counts, n) {
  let h = 0;
  for (const c of counts.values()) if (c > 0) h -= (c / n) * Math.log(c / n);
  return h;
}

/**
 * Normalised mutual information, NMI = 2·I(a; b) / (H(a) + H(b))
 * (Strehl & Ghosh 2002; sklearn `normalized_mutual_info_score` with its
 * default arithmetic-mean normalisation). Natural logarithms throughout.
 */
export function nmi(a, b) {
  const { n, rows, cols, cells } = contingency(a, b);
  // sklearn: two trivial labelings (both one cluster, or both empty) → 1.
  if (rows.size <= 1 && cols.size <= 1) return 1;
  const ha = entropy(rows, n), hb = entropy(cols, n);
  // I(a; b) = Σ_ij (n_ij / N) · ln(N · n_ij / (a_i · b_j))
  let mi = 0;
  for (const [la, row] of cells) {
    for (const [lb, nij] of row) mi += (nij / n) * Math.log((n * nij) / (rows.get(la) * cols.get(lb)));
  }
  if (mi <= 0) return 0;
  return mi / ((ha + hb) / 2);
}

/**
 * Adjusted Rand index (Hubert & Arabie 1985), via the pair confusion matrix
 * exactly as sklearn `adjusted_rand_score`:
 *   ARI = 2 (tp·tn − fn·fp) / ((tp + fn)(fn + tn) + (tp + fp)(fp + tn))
 * where tp/tn/fp/fn count ordered pairs of items grouped together in both,
 * in neither, only in b, only in a.
 */
export function ari(a, b) {
  const { n, rows, cols, cells } = contingency(a, b);
  const pairs = x => x * (x - 1) / 2;
  let sameBoth = 0, sameA = 0, sameB = 0;
  for (const row of cells.values()) for (const nij of row.values()) sameBoth += pairs(nij);
  for (const c of rows.values()) sameA += pairs(c);
  for (const c of cols.values()) sameB += pairs(c);
  const tp = 2 * sameBoth;
  const fp = 2 * (sameB - sameBoth);
  const fn = 2 * (sameA - sameBoth);
  const tn = n * (n - 1) - tp - fp - fn;
  // Identical partitions (including both trivial ones) → 1, avoiding 0/0.
  if (fn === 0 && fp === 0) return 1;
  return (2 * (tp * tn - fn * fp)) / ((tp + fn) * (fn + tn) + (tp + fp) * (fp + tn));
}

// ---------------------------------------------------------------------------
// Layouts.

/**
 * Fruchterman–Reingold force-directed layout (Fruchterman & Reingold 1991),
 * following networkx `_fruchterman_reingold` (dense version) and
 * `rescale_layout(scale=1)`: repulsion k² / d between every pair, attraction
 * w · d² / k along edges, step length limited by a temperature that cools
 * linearly from a tenth of the initial frame to zero.
 */
export function springLayout(graph, { random = createRandom(1), k, iterations = 50 } = {}) {
  const n = graph.n;
  if (n === 0) return [];
  if (n === 1) return [[0, 0]];

  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = random.next(); y[i] = random.next(); }
  const kk = k ?? Math.sqrt(1 / n);

  // Temperature: a tenth of the larger side of the initial bounding box.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]);
    minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]);
  }
  let t = Math.max(maxX - minX, maxY - minY) * 0.1;
  const dt = t / (iterations + 1);

  const dx = new Float64Array(n), dy = new Float64Array(n);
  for (let iter = 0; iter < iterations; iter++) {
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < n; i++) {
      const adj = graph.adj[i];
      for (let j = i + 1; j < n; j++) {
        const ddx = x[i] - x[j], ddy = y[i] - y[j];
        let d = Math.hypot(ddx, ddy);
        if (d < 0.01) d = 0.01;                  // keep coincident nodes apart
        const w = adj.get(j) || 0;
        const f = (kk * kk) / (d * d) - (w * d) / kk;   // repulsion − attraction, per unit delta
        dx[i] += ddx * f; dy[i] += ddy * f;
        dx[j] -= ddx * f; dy[j] -= ddy * f;      // equal and opposite
      }
    }
    for (let i = 0; i < n; i++) {
      let len = Math.hypot(dx[i], dy[i]);
      if (len < 0.01) len = 0.1;
      x[i] += (dx[i] * t) / len;
      y[i] += (dy[i] * t) / len;
    }
    t -= dt;
  }

  // rescale_layout: centre on the mean and scale so the largest |coordinate| is 1.
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let lim = 0;
  for (let i = 0; i < n; i++) {
    x[i] -= mx; y[i] -= my;
    lim = Math.max(lim, Math.abs(x[i]), Math.abs(y[i]));
  }
  const scale = lim > 0 ? 1 / lim : 1;
  return Array.from({ length: n }, (_, i) => [x[i] * scale, y[i] * scale]);
}

/**
 * Cluster layout: each community gets a circle of radius spread·√size·0.6;
 * the circles sit on a ring with arc lengths proportional to their diameters
 * (ring = max(Σ radii · 2 / 2π, max radius · 1.5), 0 for a single community),
 * and the members are placed by a spring layout inside their circle.
 */
export function clusterLayout(graph, communities, { random = createRandom(1), spread = 260 } = {}) {
  const parts = communities;
  const radii = parts.map(p => spread * Math.sqrt(p.length) * 0.6);
  const sumRadii = radii.reduce((s, r) => s + r, 0);
  const ring = parts.length > 1 ? Math.max((sumRadii * 2) / (2 * Math.PI), Math.max(...radii) * 1.5) : 0;
  const total = sumRadii * 2;                        // sum of diameters

  const pos = Array.from({ length: graph.n }, () => [0, 0]);
  const centres = [];
  let angle = 0;
  parts.forEach((p, c) => {
    const r = radii[c];
    const halfArc = total > 0 ? (Math.PI * 2 * r) / total : 0;
    angle += halfArc;
    // `+ 0` turns a −0 (ring = 0 times a negative cosine) into 0.
    const cx = ring * Math.cos(angle) + 0, cy = ring * Math.sin(angle) + 0;
    angle += halfArc;
    centres.push([cx, cy]);

    let local;
    if (p.length > 1) {
      const { graph: sub } = subgraph(graph, p);     // renumbered in the order of p
      local = springLayout(sub, { random, k: 1.2 / Math.sqrt(Math.max(p.length, 1)) });
    } else {
      local = [[0, 0]];
    }
    p.forEach((v, i) => { pos[v] = [cx + r * local[i][0], cy + r * local[i][1]]; });
  });
  return { pos, centres };
}

// ---------------------------------------------------------------------------

/** Weighted density: total edge weight over the number of possible edges n(n − 1)/2. */
export function weightedDensity(graph) {
  const n = graph.n;
  if (n < 2) return 0;
  return graph.totalWeight() / ((n * (n - 1)) / 2);
}

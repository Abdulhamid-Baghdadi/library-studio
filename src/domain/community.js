/**
 * Community detection on the weighted undirected graphs of graph.js.
 *
 * Port of the community part of the Python analysis (leidenalg + networkx):
 *
 *   leiden(graph, { quality = "modularity", gamma = 1, random, nodeSizes, theta = 0.01 })
 *       Leiden algorithm (Traag, Waltman & van Eck 2019): fast local moving,
 *       refinement, aggregation; the whole thing is repeated until the quality
 *       stops improving (leidenalg `n_iterations = -1`). Every community is
 *       internally connected. quality "modularity" = Reichardt–Bornholdt
 *       modularity with resolution gamma; "cpm" = Constant Potts Model
 *       (nodeSizes optional, default 1 per node). theta is the randomness of
 *       the refinement step as in the paper (merge into a random well-connected
 *       sub-community with probability ∝ exp(gain / theta)); theta = 0 merges
 *       greedily into the best one, which is what the leidenalg package does.
 *   louvain(graph, { gamma = 1, random })
 *       Louvain algorithm (Blondel et al. 2008), modularity only, no refinement,
 *       so communities may be internally disconnected.
 *   modularity(graph, communities, gamma = 1)
 *       Q = Σ_c [ L_c / m − gamma · (K_c / 2m)² ], weighted (L_c = weight inside
 *       c, K_c = summed weighted degree of c, m = total weight); equals
 *       networkx.community.modularity(G, parts, weight="weight") for gamma = 1.
 *       0 for a graph without edges.
 *   cpmQuality(graph, communities, gamma = 1, nodeSizes)
 *       Q = Σ_c [ w_c − gamma · Σ_{i<j in c} n_i n_j ]; with unit node sizes
 *       this is Σ_c [ w_c − gamma · n_c (n_c − 1) / 2 ] as in leidenalg.
 *   isConnected(graph, nodes)          induced subgraph on `nodes` connected?
 *   disconnectedCount(graph, communities)
 *       number of communities with ≥ 2 nodes that are not internally connected.
 *   consensusPartition(graph, { algorithm = "leiden", quality = "modularity",
 *                               gamma = 1, runs = 100, threshold = 0.5, random })
 *       Consensus clustering (Lancichinetti & Fortunato 2012):
 *       → { communities, stability } where stability[i] is the mean co-occurrence
 *       of node i with the other members of its consensus community (1 for a
 *       singleton). Communities are sorted by size, largest first.
 *   partitionLabels(communities, n)
 *       Int32Array with the community index of every node (−1 if in none).
 *
 * Communities are arrays of node indices sorted ascending, ordered by size
 * (largest first) and then by first node. All randomness comes from `random`
 * (random.js; `createRandom(1)` when none is given), so the same seed always
 * gives the same result. Input graphs are never mutated. One local-moving pass
 * costs O(n + m).
 */
import { makeGraph, addEdge } from "./graph.js";
import { createRandom } from "./random.js";

const THETA = 0.01;          // default randomness of the refinement step (Leiden paper)
const EPS = 1e-12;           // tolerance for "strictly better" comparisons
const MAX_ITERATIONS = 100;  // safety cap on the outer Leiden loop

// ------------------------------------------------------------------ quality

export function modularity(graph, communities, gamma = 1) {
  const m = graph.totalWeight();
  if (m <= 0) return 0;
  const label = partitionLabels(communities, graph.n);
  const inside = new Float64Array(communities.length); // L_c
  const degree = new Float64Array(communities.length); // K_c
  for (let i = 0; i < graph.n; i++) {
    const c = label[i];
    if (c < 0) continue;
    for (const [j, w] of graph.adj[i]) {
      degree[c] += w;
      if (j > i && label[j] === c) inside[c] += w;
    }
  }
  let q = 0;
  for (let c = 0; c < communities.length; c++) q += inside[c] / m - gamma * (degree[c] / (2 * m)) ** 2;
  return q;
}

export function cpmQuality(graph, communities, gamma = 1, nodeSizes) {
  const size = unitSizes(graph.n, nodeSizes);
  const label = partitionLabels(communities, graph.n);
  let q = 0;
  for (let c = 0; c < communities.length; c++) {
    let inside = 0, total = 0, squares = 0;
    for (const i of communities[c]) {
      total += size[i];
      squares += size[i] * size[i];
      for (const [j, w] of graph.adj[i]) if (j > i && label[j] === c) inside += w;
    }
    // Σ_{i<j} n_i n_j = ((Σ n_i)² − Σ n_i²) / 2
    q += inside - gamma * (total * total - squares) / 2;
  }
  return q;
}

export function isConnected(graph, nodes) {
  return components(graph, nodes).length <= 1;
}

export function disconnectedCount(graph, communities) {
  let count = 0;
  for (const c of communities) if (c.length >= 2 && !isConnected(graph, c)) count++;
  return count;
}

export function partitionLabels(communities, n) {
  const label = new Int32Array(n).fill(-1);
  communities.forEach((c, ci) => { for (const v of c) label[v] = ci; });
  return label;
}

// --------------------------------------------------------------- algorithms

export function leiden(graph, { quality = "modularity", gamma = 1, random, nodeSizes, theta = THETA } = {}) {
  random = random || createRandom(1);
  const ctx = setup(graph, quality, gamma, nodeSizes, random);
  if (ctx) ctx.theta = theta;
  if (!ctx) return singletons(graph.n);

  let membership = identity(graph.n);
  let best = partitionScore(ctx, membership);
  // leidenalg n_iterations = -1: run the three Leiden steps again from the
  // previous partition until the quality no longer improves.
  for (let it = 0; it < MAX_ITERATIONS; it++) {
    membership = leidenOnce(ctx, membership);
    const score = partitionScore(ctx, membership);
    if (!(score > best + 1e-10 * Math.max(1, Math.abs(best)))) break;
    best = score;
  }
  // Leiden guarantees connected communities; splitting a disconnected one into
  // its components never lowers either quality, so this is a cheap safety net.
  return sortCommunities(splitDisconnected(graph, toCommunities(membership)));
}

export function louvain(graph, { gamma = 1, random, quality = "modularity" } = {}) {
  if (quality !== "modularity") throw new Error(`louvain supports only quality "modularity" (got "${quality}"); use leiden for CPM`);
  random = random || createRandom(1);
  const ctx = setup(graph, quality, gamma, undefined, random);
  if (!ctx) return singletons(graph.n);

  let level = ctx.level;
  let part = makePartition(level, identity(level.n));
  // Blondel et al. 2008: local moving, then aggregate the communities into
  // nodes and start again from singletons, until no node moves any more.
  while (moveNodesFast(ctx, level, part)) {
    level = aggregate(level, part.comm, part.comm).level;
    part = makePartition(level, identity(level.n));
  }
  return sortCommunities(toCommunities(unfold(level, part.comm, graph.n)));
}

export function consensusPartition(graph, {
  algorithm = "leiden", quality = "modularity", gamma = 1, runs = 100, threshold = 0.5, random,
} = {}) {
  random = random || createRandom(1);
  const n = graph.n;
  const D = new Float64Array(n * n); // co-occurrence matrix, row-major

  // Lancichinetti & Fortunato 2012: how often do i and j end up together?
  for (let run = 0; run < runs; run++) {
    const parts = onePartition(graph, algorithm, quality, gamma, createRandom(random.seed()));
    for (const c of parts) for (const i of c) for (const j of c) D[i * n + j] += 1;
  }
  for (let k = 0; k < D.length; k++) D[k] /= runs;
  for (let i = 0; i < n; i++) D[i * n + i] = 0;

  // Consensus graph: pairs that co-occur at least `threshold` of the time.
  const consensus = makeGraph(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = D[i * n + j];
      if (d >= threshold) addEdge(consensus, i, j, d);
    }
  }
  const communities = sortCommunities(onePartition(consensus, algorithm, "modularity", 1, createRandom(random.seed())));

  const stability = new Array(n).fill(1);
  for (const c of communities) {
    if (c.length < 2) continue;
    for (const i of c) {
      let sum = 0;
      for (const j of c) if (j !== i) sum += D[i * n + j];
      stability[i] = sum / (c.length - 1);
    }
  }
  return { communities, stability };
}

function onePartition(graph, algorithm, quality, gamma, random) {
  if (algorithm === "leiden") return leiden(graph, { quality, gamma, random });
  if (algorithm === "louvain") return louvain(graph, { quality, gamma, random });
  throw new Error(`Unknown algorithm "${algorithm}"; use "leiden" or "louvain"`);
}

// ------------------------------------------------------------ Leiden steps
//
// A "level" is the graph the algorithm currently works on: the input graph
// first, then aggregate graphs whose nodes stand for groups of input nodes.
// It is stored in compressed sparse rows (typed arrays, fast to scan):
//   off[v] .. off[v+1]-1   the edge slots of node v
//   nbr[e], wt[e]          neighbour and weight of slot e (no self-loops: they
//                          do not change any gain)
//   sz[v]     the node's weight in the quality's null model: weighted degree
//             for modularity, node size for CPM; summed on aggregation
//   nodes[v]  input nodes represented by level node v
//
// With res = gamma / 2m (modularity) or gamma (CPM), the gain of moving node v
// into community C is the same expression for both qualities:
//   gain(v, C) = w(v, C) − res · sz[v] · Σ_{u in C} sz[u]
// i.e. k_v,in(C) − gamma · k_v · Σ_tot(C) / 2m, or w_v,in(C) − gamma · n_v · n_C.
// `scale` turns a gain into a change of the quality value (used with theta).

function setup(graph, quality, gamma, nodeSizes, random) {
  const n = graph.n;
  let sz, res, scale;
  if (quality === "modularity") {
    sz = new Float64Array(n);
    let twoM = 0;
    for (let i = 0; i < n; i++) { sz[i] = graph.strength(i); twoM += sz[i]; }
    if (twoM === 0) return null;
    res = gamma / twoM;
    scale = 2 / twoM; // 1 / m
  } else if (quality === "cpm") {
    sz = unitSizes(n, nodeSizes);
    res = gamma;
    scale = 1;
  } else {
    throw new Error(`Unknown quality "${quality}"; use "modularity" or "cpm"`);
  }
  return { level: levelFromGraph(graph, sz), res, scale, random };
}

function levelFromGraph(graph, sz) {
  const n = graph.n;
  const off = new Int32Array(n + 1);
  for (let v = 0; v < n; v++) off[v + 1] = off[v] + graph.adj[v].size;
  const nbr = new Int32Array(off[n]);
  const wt = new Float64Array(off[n]);
  for (let v = 0; v < n; v++) {
    let e = off[v];
    for (const [u, w] of graph.adj[v]) { nbr[e] = u; wt[e] = w; e++; }
  }
  return { n, off, nbr, wt, sz, nodes: Array.from({ length: n }, (_, i) => [i]) };
}

/**
 * Quality of a membership on the input level, up to a constant and a positive
 * factor: Σ_c [ L_c − res · Σ_tot(c)² / 2 ]. Only used to decide whether an
 * iteration improved anything, so the omitted constants do not matter.
 */
function partitionScore(ctx, membership) {
  const { n, off, nbr, wt, sz } = ctx.level;
  const tot = new Float64Array(n);
  let inside = 0;
  for (let v = 0; v < n; v++) {
    const c = membership[v];
    tot[c] += sz[v];
    for (let e = off[v]; e < off[v + 1]; e++) if (nbr[e] > v && membership[nbr[e]] === c) inside += wt[e];
  }
  let null_ = 0;
  for (let c = 0; c < n; c++) null_ += tot[c] * tot[c];
  return inside - ctx.res * null_ / 2;
}

/** One Leiden iteration (Algorithm 1 of the paper) from an initial membership. */
function leidenOnce(ctx, membership) {
  let level = ctx.level;
  let part;
  for (;;) {
    part = makePartition(level, membership);
    moveNodesFast(ctx, level, part);
    if (countCommunities(part) === level.n) break; // every node alone: done
    const refined = refinePartition(ctx, level, part);
    const agg = aggregate(level, refined, part.comm);
    if (agg.level.n === level.n) break; // refinement merged nothing (leidenalg stops here too)
    level = agg.level;
    membership = agg.membership;
  }
  return unfold(level, part.comm, ctx.level.n);
}

function makePartition(level, membership) {
  const n = level.n;
  const comm = Int32Array.from(membership);
  const tot = new Float64Array(n);   // Σ sz over members
  const count = new Int32Array(n);   // number of level nodes
  for (let v = 0; v < n; v++) { tot[comm[v]] += level.sz[v]; count[comm[v]]++; }
  const free = [];                   // community ids currently empty
  for (let c = 0; c < n; c++) if (count[c] === 0) free.push(c);
  return { comm, tot, count, free };
}

function countCommunities(part) {
  let k = 0;
  for (const c of part.count) if (c > 0) k++;
  return k;
}

/**
 * Fast local moving (Leiden Algorithm 2 / MoveNodesFast). Nodes are visited
 * from a queue in random order; a node goes to the neighbouring community (or
 * an empty one) with the largest gain, and the neighbours that are not in its
 * new community are queued again. Returns whether any node moved.
 */
function moveNodesFast(ctx, level, part) {
  const { n, off, nbr, wt, sz } = level;
  const { comm, tot, count, free } = part;
  const { res, random } = ctx;
  const queue = random.shuffle(Array.from(identity(n)));
  const queued = new Uint8Array(n).fill(1);
  const wTo = new Float64Array(n);  // weight from v to each community (scratch)
  const touched = [];
  let moved = false;

  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    queued[v] = 0;
    const old = comm[v];
    tot[old] -= sz[v];
    if (--count[old] === 0) free.push(old);

    touched.length = 0;
    for (let e = off[v]; e < off[v + 1]; e++) {
      const c = comm[nbr[e]];
      if (wTo[c] === 0) touched.push(c);
      wTo[c] += wt[e];
    }
    let best = old;
    let bestGain = wTo[old] - res * sz[v] * tot[old];
    for (const c of touched) {
      if (c === old) continue;
      const gain = wTo[c] - res * sz[v] * tot[c];
      if (gain > bestGain + EPS) { best = c; bestGain = gain; }
    }
    if (bestGain < -EPS) best = free[free.length - 1]; // an empty community has gain 0
    if (count[best] === 0) free.pop();                 // `best` is then the top of `free`

    comm[v] = best;
    tot[best] += sz[v];
    count[best]++;
    if (best !== old) {
      moved = true;
      for (let e = off[v]; e < off[v + 1]; e++) {
        const u = nbr[e];
        if (comm[u] !== best && !queued[u]) { queued[u] = 1; queue.push(u); }
      }
    }
    for (const c of touched) wTo[c] = 0;
  }
  return moved;
}

/**
 * Refinement (Leiden Algorithm 3 / RefinePartition + MergeNodesSubset). Inside
 * every community S of `part`, start from singletons and merge a node only if
 * it is well connected to S, only into a sub-community that is well connected
 * to S, choosing randomly among candidates with positive gain with probability
 * proportional to exp(gain / theta). Returns the refined membership.
 */
function refinePartition(ctx, level, part) {
  const { n, off, nbr, wt, sz } = level;
  const { comm } = part;
  const { res, scale, random, theta } = ctx;
  const refined = identity(n);
  const rCount = new Int32Array(n).fill(1);
  const rTot = Float64Array.from(sz);
  const rExt = new Float64Array(n);  // E(C, S − C): weight from sub-community C to the rest of S
  const wToS = new Float64Array(n);  // E(v, S − v)
  const wTo = new Float64Array(n);   // weight from v to each sub-community (scratch)
  const touched = [];
  const { order, start } = groupMembers(comm, n);

  for (let s = 0; s + 1 < start.length; s++) {
    if (start[s + 1] - start[s] < 2) continue;
    const S = order.subarray(start[s], start[s + 1]);
    let szS = 0;
    for (const v of S) {
      let w = 0;
      for (let e = off[v]; e < off[v + 1]; e++) if (comm[nbr[e]] === comm[v]) w += wt[e];
      wToS[v] = rExt[v] = w;
      szS += sz[v];
    }
    random.shuffle(S);
    for (const v of S) {
      if (rCount[refined[v]] !== 1) continue;                       // only singletons move
      if (wToS[v] < res * sz[v] * (szS - sz[v]) - EPS) continue;     // v not well connected to S

      touched.length = 0;
      for (let e = off[v]; e < off[v + 1]; e++) {
        const u = nbr[e];
        if (comm[u] !== comm[v]) continue;
        const c = refined[u];
        if (wTo[c] === 0) touched.push(c);
        wTo[c] += wt[e];
      }
      const candidates = [], gains = [];
      let maxGain = -Infinity;
      for (const c of touched) {
        if (rExt[c] < res * rTot[c] * (szS - rTot[c]) - EPS) continue; // C not well connected to S
        const gain = scale * (wTo[c] - res * sz[v] * rTot[c]);
        if (gain > EPS) { candidates.push(c); gains.push(gain); if (gain > maxGain) maxGain = gain; }
      }
      if (candidates.length > 0) {
        const pick = candidates.length === 1 || !(theta > 0)
          ? candidates[gains.indexOf(maxGain)]
          : chooseWeighted(candidates, gains, maxGain, theta, random);
        const old = refined[v];
        rCount[old] = 0; rTot[old] = 0; rExt[old] = 0;
        refined[v] = pick;
        rCount[pick]++;
        rTot[pick] += sz[v];
        rExt[pick] += wToS[v] - 2 * wTo[pick];
      }
      for (const c of touched) wTo[c] = 0;
    }
  }
  return refined;
}

function chooseWeighted(candidates, gains, maxGain, theta, random) {
  // Pr(C) ∝ exp(gain / theta); subtracting maxGain avoids overflow.
  const weights = gains.map((g) => Math.exp((g - maxGain) / theta));
  let total = 0;
  for (const w of weights) total += w;
  let r = random.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Aggregation (Leiden Algorithm 1, step 3): one node per group of `groups`
 * (the refined partition), with edge weights, sizes and node lists summed.
 * `comm` (the non-refined partition) becomes the initial membership of the
 * aggregate nodes, renumbered 0..C-1 so that it indexes the aggregate's arrays.
 */
function aggregate(level, groups, comm) {
  const { order, start, id } = groupMembers(groups, level.n);
  const R = start.length - 1;
  const commId = new Int32Array(level.n).fill(-1);
  let C = 0;

  const off = new Int32Array(R + 1);
  const nbr = new Int32Array(level.nbr.length); // upper bound, trimmed below
  const wt = new Float64Array(level.nbr.length);
  const sz = new Float64Array(R);
  const nodes = Array.from({ length: R }, () => []);
  const membership = new Int32Array(R);
  const wTo = new Float64Array(R);
  const touched = [];
  let e = 0;
  for (let r = 0; r < R; r++) {
    touched.length = 0;
    for (let k = start[r]; k < start[r + 1]; k++) {
      const v = order[k];
      sz[r] += level.sz[v];
      for (const x of level.nodes[v]) nodes[r].push(x);
      if (commId[comm[v]] < 0) commId[comm[v]] = C++;
      membership[r] = commId[comm[v]];
      for (let f = level.off[v]; f < level.off[v + 1]; f++) {
        const ru = id[groups[level.nbr[f]]];
        if (ru === r) continue;
        if (wTo[ru] === 0) touched.push(ru);
        wTo[ru] += level.wt[f];
      }
    }
    for (const ru of touched) { nbr[e] = ru; wt[e] = wTo[ru]; wTo[ru] = 0; e++; }
    off[r + 1] = e;
  }
  return { level: { n: R, off, nbr: nbr.subarray(0, e), wt: wt.subarray(0, e), sz, nodes }, membership };
}

/**
 * Nodes bucketed by label (counting sort): bucket g holds
 * order[start[g] .. start[g+1]-1]; id[label] is the bucket of a label.
 */
function groupMembers(label, n) {
  const id = new Int32Array(n).fill(-1);
  let G = 0;
  for (let v = 0; v < n; v++) if (id[label[v]] < 0) id[label[v]] = G++;
  const start = new Int32Array(G + 1);
  for (let v = 0; v < n; v++) start[id[label[v]] + 1]++;
  for (let g = 0; g < G; g++) start[g + 1] += start[g];
  const fill = start.slice(0, G);
  const order = new Int32Array(n);
  for (let v = 0; v < n; v++) order[fill[id[label[v]]]++] = v;
  return { order, start, id };
}

/** Membership of the input nodes from a membership of level nodes. */
function unfold(level, comm, n0) {
  const out = new Int32Array(n0);
  for (let r = 0; r < level.n; r++) for (const v of level.nodes[r]) out[v] = comm[r];
  return out;
}

// ------------------------------------------------------------------ helpers

function identity(n) {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

function singletons(n) {
  return Array.from({ length: n }, (_, i) => [i]);
}

function unitSizes(n, nodeSizes) {
  if (nodeSizes == null) return new Float64Array(n).fill(1);
  if (nodeSizes.length !== n) throw new Error(`nodeSizes has ${nodeSizes.length} entries for ${n} nodes`);
  return Float64Array.from(nodeSizes);
}

/** Communities (arrays of nodes, ascending) from a membership array. */
function toCommunities(membership) {
  const groups = new Map();
  for (let v = 0; v < membership.length; v++) {
    const g = groups.get(membership[v]);
    if (g) g.push(v); else groups.set(membership[v], [v]);
  }
  return [...groups.values()];
}

function sortCommunities(communities) {
  for (const c of communities) c.sort((a, b) => a - b);
  return communities.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/** Connected components of the subgraph induced by `nodes` (BFS). */
function components(graph, nodes) {
  const inSet = new Set(nodes);
  const seen = new Set();
  const out = [];
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const comp = [start];
    seen.add(start);
    for (let head = 0; head < comp.length; head++) {
      for (const u of graph.adj[comp[head]].keys()) {
        if (inSet.has(u) && !seen.has(u)) { seen.add(u); comp.push(u); }
      }
    }
    out.push(comp);
  }
  return out;
}

function splitDisconnected(graph, communities) {
  const out = [];
  for (const c of communities) {
    if (c.length < 2) out.push(c);
    else out.push(...components(graph, c));
  }
  return out;
}

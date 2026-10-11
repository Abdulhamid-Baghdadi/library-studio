/**
 * Weighted undirected graph on nodes 0..n-1, shared by all graph modules.
 *
 *   const g = makeGraph(4, [[0, 1, 2.5], [1, 2, 1]]);
 *   g.n                 // 4
 *   g.adj[1]            // Map { 0 => 2.5, 2 => 1 }
 *   g.strength(1)       // 3.5 (weighted degree)
 *   g.totalWeight()     // 3.5 (sum over edges, each once)
 *   g.edges()           // [[0, 1, 2.5], [1, 2, 1]] with a < b
 *   addEdge(g, a, b, w) // adds w to an existing edge or creates it (w <= 0 ignored)
 *   subgraph(g, nodes)  // { graph, index } with the nodes renumbered 0..k-1
 */
export function makeGraph(n, edges = []) {
  const adj = Array.from({ length: n }, () => new Map());
  const g = {
    n,
    adj,
    strength(i) { let s = 0; for (const w of adj[i].values()) s += w; return s; },
    totalWeight() { let s = 0; for (let i = 0; i < n; i++) for (const [j, w] of adj[i]) if (j > i) s += w; return s; },
    edgeCount() { let c = 0; for (let i = 0; i < n; i++) for (const j of adj[i].keys()) if (j > i) c++; return c; },
    edges() { const out = []; for (let i = 0; i < n; i++) for (const [j, w] of adj[i]) if (j > i) out.push([i, j, w]); return out; },
  };
  for (const [a, b, w] of edges) addEdge(g, a, b, w);
  return g;
}

export function addEdge(g, a, b, w = 1) {
  if (!(w > 0) || a === b) return;
  g.adj[a].set(b, (g.adj[a].get(b) || 0) + w);
  g.adj[b].set(a, (g.adj[b].get(a) || 0) + w);
}

export function subgraph(g, nodes) {
  const index = new Map(nodes.map((v, i) => [v, i]));
  const sub = makeGraph(nodes.length);
  for (const v of nodes) for (const [u, w] of g.adj[v]) if (index.has(u) && u > v) addEdge(sub, index.get(v), index.get(u), w);
  return { graph: sub, index };
}

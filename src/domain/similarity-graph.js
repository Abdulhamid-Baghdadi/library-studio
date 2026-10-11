/**
 * The weighted similarity graph over the publication notes, built without the hand-made `category` field
 * so the clusters can be compared against the concept maps.
 *
 *   buildGraph(notes, X, { k, wText, wTag, wLink })
 *     → { graph, S, layers, layerCounts }
 *     notes  [{ stem, tags, links }], in the order of the TF-IDF rows X.rows
 *     graph  graph.js graph; edge weight = sum of the three layers:
 *            text   cosine similarity × wText, kept only between mutual k-nearest neighbours
 *                   (and always to a note's single nearest neighbour)
 *            tag    shared tags, each weighted wTag · ln(n / df) / ln(n)
 *            link   wLink per explicit [[link]] between two notes
 *     S      the cosine matrix (Float64Array n×n)
 *     layers Map "a,b" → Set of layer names of that edge
 *     layerCounts  { text, tag, link } number of edges carrying each layer
 * @module domain/similarity-graph
 */
import { cosineMatrix } from "./cluster-text.js";
import { addEdge, makeGraph } from "./graph.js";

export function buildGraph(notes, X, { k = 5, wText = 1, wTag = 0.5, wLink = 0.5 } = {}) {
  const n = notes.length;
  const S = cosineMatrix(X.rows, n);
  const graph = makeGraph(n);
  const layers = new Map();
  const add = (a, b, w, layer) => {
    if (!(w > 0) || a === b) return;
    addEdge(graph, a, b, w);
    const key = `${a},${b}`;
    if (!layers.has(key)) layers.set(key, new Set());
    layers.get(key).add(layer);
  };

  // content layer: mutual k-nearest neighbours, plus each note's nearest neighbour as a fallback
  const nn = [], knn = [];
  for (let i = 0; i < n; i++) {
    const order = Array.from({ length: n }, (_, j) => j).sort((a, b) => S[i * n + b] - S[i * n + a] || a - b);
    nn.push(order.slice(0, k));
    knn.push(new Set(nn[i]));
  }
  for (let i = 0; i < n; i++) {
    for (const j of knn[i]) {
      if ((i < j && knn[j].has(i)) || j === nn[i][0]) {
        const a = Math.min(i, j), b = Math.max(i, j);
        add(a, b, wText * S[a * n + b], "text");
      }
    }
  }

  // tag layer: shared tags weighted by inverse document frequency
  const byTag = new Map();
  notes.forEach((x, i) => { for (const t of new Set(x.tags)) { if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(i); } });
  for (const members of byTag.values()) {
    if (members.length < 2) continue;
    const idf = Math.log(n / members.length);
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) add(members[a], members[b], wTag * idf / Math.log(n), "tag");
    }
  }

  // link layer: explicit wikilinks between publication notes
  const stemToI = new Map(notes.map((x, i) => [x.stem, i]));
  notes.forEach((x, i) => {
    for (const target of x.links) {
      const j = stemToI.get(target);
      if (j !== undefined && j !== i) add(Math.min(i, j), Math.max(i, j), wLink, "link");
    }
  });

  const layerCounts = { text: 0, tag: 0, link: 0 };
  for (const set of layers.values()) for (const l of set) layerCounts[l]++;
  return { graph, S, layers, layerCounts };
}

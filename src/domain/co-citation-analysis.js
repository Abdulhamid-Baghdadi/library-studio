/**
 * The co-citation analysis as one pure function: citing papers and the metadata of the cited works in, maps per
 * scope (all years, then each phase) out, with clusters, a layout shared by all scopes and the perspectives.
 *
 *   STEPS                                       names of the steps reported through onStep (1-based)
 *   prepareCoCitation(records, settings)        → { settings, papers, candidates }: the citing set, and the works
 *                                               whose metadata is needed (look them up before the analysis)
 *   analyzeCoCitation(prepared, meta, { requested, library, onStep })  → result:
 *     nodes        [{ id, label, year, title, doi, source, lib: { no, stem } | null, cites: [per scope], avgYear,
 *                     merged: [ids], x, y, persp }] — every work shown in some scope, sorted by id
 *     perspectives [{ k, anchor, name, top, size, slot }] — the clusters of the all-years map; a work outside that
 *                  map belongs to the perspective it is co-cited with most. name: from the settings (by anchor
 *                  work), else ""; slot: colour order (named ones as in the settings first)
 *     scopes       [{ name, phase, from, to, threshold, citing, refsAvg, nodes, clusterOf, clusters, links,
 *                     cocit, density, outShare, quality }]
 *                  clusterOf: cluster index of each work in `nodes`; clusters: [{ k, size, persp, mix, top }];
 *                  links: pairs co-cited at least linkThreshold times; density: links / possible pairs;
 *                  outShare[p]: share of perspective p's co-citations (inside the scope) that go to another one
 *     citing, cleaning, settings
 * @module domain/co-citation-analysis
 */
import { candidateIds, citingSet, cleaning, countScopes, normalizeSettings, normTitle, workLabel } from "./co-citation.js";
import { normalizeDoi } from "./openalex.js";
import { associationStrength, vosClusters, vosLayout } from "./vos.js";

export const STEPS = [
  "Choosing the citing papers",
  "Looking up the cited works",
  "Cleaning and counting co-citations",
  "Clustering each map",
  "Placing the works (VOS layout)",
  "Writing the files",
];

export function prepareCoCitation(records, settings) {
  const s = normalizeSettings(settings);
  const papers = citingSet(records, s);
  return { settings: s, papers, candidates: candidateIds(papers, s) };
}

/** Library notes by DOI, then by the first 40 characters of the normalised title. */
function libraryMatcher(library) {
  const byDoi = new Map(), byTitle = new Map();
  for (const p of library) {
    const ref = { no: p.no, stem: p.stem };
    if (p.doi) byDoi.set(normalizeDoi(p.doi), ref);
    if (p.title) byTitle.set(normTitle(p.title).slice(0, 40), ref);
  }
  return work => (work.doi && byDoi.get(normalizeDoi(work.doi))) || byTitle.get(normTitle(work.title).slice(0, 40)) || null;
}

/** Index of the largest value; the first one on ties. */
function firstMax(weights) {
  let best = -1, value = -Infinity;
  for (const [k, w] of weights) if (w > value) { value = w; best = k; }
  return best;
}

export function analyzeCoCitation(prepared, meta, { requested = [], library = [], onStep = () => {} } = {}) {
  const { settings: s, papers, candidates } = prepared;
  onStep(3, STEPS[2], `${papers.length} citing papers, ${candidates.length} works looked up`);
  const clean = cleaning(meta, papers, { candidates, requested, corrections: s.corrections });
  const counted = countScopes(papers, meta, s, clean);
  const { ids, counts, union } = counted;
  const n = ids.length;

  onStep(4, STEPS[3], `${counted.scopes.length} maps, ${s.runs} Leiden runs each`);
  const scopes = counted.scopes.map(sc => {
    const c = vosClusters(sc.nodes, sc.cocit, { resolution: s.resolution, runs: s.runs });
    return { ...sc, cluster: c.cluster, count: c.count, quality: c.quality };
  });

  onStep(5, STEPS[4], `${n} works`);
  const xy = vosLayout(n, associationStrength([...Array(n).keys()], union), { starts: s.layoutStarts, iterations: s.layoutIterations });

  // perspectives: the clusters of the all-years map; other works join the one they are co-cited with most
  const overall = scopes[0];
  const persp = new Array(n).fill(-1);
  for (const i of overall.nodes) persp[i] = overall.cluster.get(i);
  const ties = new Map();
  const tie = (i, k, c) => { if (!ties.has(i)) ties.set(i, new Map()); const t = ties.get(i); t.set(k, (t.get(k) || 0) + c); };
  const fixed = [...persp];
  for (const [a, b, c] of union) {
    if (fixed[b] >= 0) tie(a, fixed[b], c);
    if (fixed[a] >= 0) tie(b, fixed[a], c);
  }
  for (let i = 0; i < n; i++) if (persp[i] < 0 && ties.has(i)) persp[i] = firstMax(ties.get(i));
  const named = new Map();
  for (const [rank, p] of s.perspectives.entries()) {
    const i = ids.indexOf(p.anchor);
    const k = i >= 0 ? overall.cluster.get(i) : undefined;
    if (k !== undefined && !named.has(k)) named.set(k, { anchor: p.anchor, name: p.name, rank });
  }
  const label = id => clean.labels.get(id)?.label ?? workLabel(meta.get(id));
  const perspectives = [...Array(overall.count).keys()].map(k => {
    const members = overall.nodes.filter(i => overall.cluster.get(i) === k);
    const top = members.reduce((a, i) => (a < 0 || counts[i].cites[0] > counts[a].cites[0] ? i : a), -1);
    const own = named.get(k);
    return { k, anchor: own?.anchor ?? ids[top], name: own?.name ?? "", top: label(ids[top]), size: members.length, slot: own ? own.rank : s.perspectives.length + k };
  });
  // colour slots: the named perspectives in the order of the settings, then the others by size
  [...perspectives].sort((a, b) => a.slot - b.slot).forEach((p, i) => { p.slot = i; });

  const match = libraryMatcher(library);
  const nodes = ids.map((id, i) => {
    const m = meta.get(id), lab = clean.labels.get(id);
    const group = clean.groups.find(g => g.head === id);
    return {
      id, label: lab?.label ?? workLabel(m), year: lab?.year || m.year, title: m.title, doi: m.doi, source: m.source,
      lib: match(m), cites: counts[i].cites, avgYear: counts[i].yearSum / counts[i].cites[0],
      merged: group ? group.members.filter(x => x !== id) : [], x: xy[i][0], y: xy[i][1], persp: persp[i],
    };
  });

  const K = perspectives.length;
  const out = scopes.map((sc, si) => {
    const inside = new Array(K).fill(0), total = new Array(K).fill(0);
    for (const [a, b, c] of sc.cocit) {
      const pa = persp[a], pb = persp[b];
      if (pa >= 0) total[pa] += c;
      if (pb >= 0) total[pb] += c;
      if (pa >= 0 && pa === pb) inside[pa] += 2 * c;
    }
    const links = sc.cocit.filter(([, , c]) => c >= s.linkThreshold);
    const k = sc.nodes.length;
    const members = new Map();
    for (const i of sc.nodes) { const c = sc.cluster.get(i); if (!members.has(c)) members.set(c, []); members.get(c).push(i); }
    const clusters = [...members].sort((a, b) => a[0] - b[0]).map(([c, list]) => {
      list.sort((a, b) => nodes[b].cites[si] - nodes[a].cites[si]);
      const mix = new Map();
      for (const i of list) mix.set(persp[i], (mix.get(persp[i]) || 0) + 1);
      return { k: c, size: list.length, persp: firstMax(mix), mix: [...mix], top: list.slice(0, 6) };
    });
    return {
      name: sc.name, phase: sc.phase, from: sc.from, to: sc.to, threshold: sc.threshold, citing: sc.citing, refsAvg: sc.refsAvg,
      nodes: sc.nodes, clusterOf: sc.nodes.map(i => sc.cluster.get(i)), clusters, links, cocit: sc.cocit,
      density: k > 1 ? links.length / (k * (k - 1) / 2) : 0,
      outShare: total.map((t, p) => (t ? 1 - inside[p] / t : null)), quality: sc.quality,
    };
  });

  const cited = id => clean.total.get(id) ?? 0;
  return {
    settings: s, nodes, perspectives, scopes: out,
    citing: { total: papers.length, candidates: candidates.length },
    cleaning: {
      merged: clean.groups.filter(g => meta.has(g.head)).map(g => ({
        head: g.head, label: label(g.head),
        members: g.members.map(id => ({ id, title: meta.get(id)?.title ?? "", year: meta.get(id)?.year ?? 0, cites: cited(id) })),
      })),
      dropped: [...clean.drop].map(([id, why]) => ({ id, why, title: meta.get(id)?.title ?? "", cites: cited(id) })).sort((a, b) => b.cites - a.cites),
      missing: counted.missing.map(id => ({ id, cites: cited(id) })),
      errors: clean.errors,
    },
  };
}

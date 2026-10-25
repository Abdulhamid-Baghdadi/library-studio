/**
 * Co-citation counts in time phases (the method of Mertens et al. 2023, after Small 1973): a set of citing papers,
 * the works they cite, and how often two works are cited by the same paper, over all years and per phase of
 * citing years. Works are OpenAlex ids without the URL ("W1562578637").
 *
 *   DEFAULTS, MERTENS_2023                  settings and their defaults; the settings of the Mertens et al. 2023 replica
 *   normalizeSettings(settings)             numbers parsed, phases sorted, lists cleaned
 *   citingRecords(pages)                    OpenAlex result pages → [{ id, year, core, source, subfield, refs }], one per work
 *   citingSet(records, settings)            the citing papers: with references, in the years, core sources and kept
 *                                           subfields only; each gets `phase` (index, −1 outside every phase)
 *   subfieldCounts(records, settings)       [[subfield, papers]] before the subfield filter, most first
 *   scopesOf(settings)                      [{ name, phase, from, to, threshold }]: all years first, then each phase
 *   phaseOf(year, phases)                   index of the first phase that holds the year, or −1
 *   citationCounts(papers, phaseCount, refsOf)  Map id → { cites: [all years, phase 1, …], yearSum }
 *   candidateIds(papers, settings)          works cited at least 90 % of a threshold: their titles are needed to clean
 *   citedRecord(work)                       an OpenAlex work → { id, title, year, authors, source, doi, type }
 *   parseCorrections(text)                  "merge / drop / label" lines → { merge, drop, label, errors }
 *   cleaning(meta, papers, { candidates, requested, corrections })
 *                                           → { canon, groups, drop, missing, labels, errors }: editions and duplicate
 *                                           records merged, records OpenAlex no longer has dropped, labels
 *   workLabel(work, year)                   "Ulrich 1995", "Baldwin & Clark 2000", "Liu et al. 2024"
 *   coCitations(refSets, index, size)       [[a, b, count]] with a < b, in order of first occurrence
 *   countScopes(papers, meta, settings, clean)  { ids, counts, union, scopes, missing }: the input of the clustering
 *
 * A pair of works counts one co-citation for every citing paper that cites both. A work enters the map of a scope
 * when the papers of that scope cite it at least `threshold` times; it needs metadata (a title) to be shown.
 * @module domain/co-citation
 */
import { compareCodePoints } from "./text-rules.js";

export const DEFAULTS = Object.freeze({
  query: "",
  from: 1990,
  to: 2020,
  types: ["article", "review", "book-chapter"],
  language: "en",
  fields: [],            // OpenAlex field ids (11–36); none = every field
  coreOnly: true,        // only papers in OpenAlex's core sources (selective, like Web of Science)
  subfields: [],         // subfield names kept; none = every subfield
  phases: [],            // [{ name, from, to }] by citing year
  overallThreshold: 45,
  phaseThreshold: 17,
  linkThreshold: 10,
  resolution: 1,
  runs: 20,
  layoutStarts: 10,
  layoutIterations: 1500,
  corrections: "",
  perspectives: [],      // [{ anchor: work id, name }]: names of the clusters of the all-years map
});

/** The settings that rebuild Mertens, Rennpferdt, Greve, Krause & Meyer 2023 (JPIM 40(1)) from OpenAlex. */
export const MERTENS_2023 = Object.freeze({
  query: "(modular OR modularity OR modularization OR modularisation OR modularized OR modularised OR modularizing OR modularising OR modularly OR commonality OR commonalities OR \"product platform\" OR \"product platforms\") AND (product OR products)",
  from: 1990, to: 2020,
  types: ["article", "review", "book-chapter"],
  language: "en",
  fields: [22, 14, 18, 17, 20],
  coreOnly: true,
  subfields: [
    "Management of Technology and Innovation", "Strategy and Management", "Business and International Management",
    "Management Information Systems", "Marketing", "Organizational Behavior and Human Resource Management",
    "General Business, Management and Accounting", "Industrial relations", "Accounting",
    "Management Science and Operations Research", "Information Systems and Management", "Statistics, Probability and Uncertainty",
    "Economics and Econometrics", "General Economics, Econometrics and Finance", "Finance",
    "Industrial and Manufacturing Engineering", "Mechanical Engineering", "Control and Systems Engineering",
    "Automotive Engineering", "Aerospace Engineering", "General Engineering", "Safety, Risk, Reliability and Quality",
    "Information Systems", "Software", "Computer Science Applications", "General Computer Science",
  ],
  phases: [
    { name: "Emergence", from: 1990, to: 2006 }, { name: "Fermentation", from: 2007, to: 2012 },
    { name: "Take-off", from: 2013, to: 2017 }, { name: "Consolidation", from: 2018, to: 2020 },
  ],
  overallThreshold: 45, phaseThreshold: 17, linkThreshold: 10,
  corrections: [
    "drop W4297081765   # \"Harvard business review\": a journal's name as title, not one work",
    "label W1562578637 Ulrich & Eppinger 1995   # the records are later editions and book reviews",
    "label W278393680 Baldwin & Clark 1997   # the most-cited record names a wrong author",
    "label W3041149780 Pahl & Beitz 1984   # first English edition; the records carry wrong authors and years",
    "label W1519593622 Fine 1998   # OpenAlex has no author and a 1999 review",
    "label W1588942736 Simon 1962   # OpenAlex dates the record 1991",
    "label W1985971011 Gershenson et al. 2004   # JED 15(1), 2004; OpenAlex dates it 2003",
  ].join("\n"),
  perspectives: [
    { anchor: "W1562578637", name: "Engineering design methods" },
    { anchor: "W1489719656", name: "Platforms, families and variety" },
    { anchor: "W2123731236", name: "Organisation and architecture" },
  ],
});

/** Share of a threshold a work must reach before cleaning to be looked up: merging editions can lift it over. */
export const CANDIDATE_SHARE = 0.9;
const TITLE_KEY = 45, TITLE_MIN = 15;

const int = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Math.round(Number(v)) : d);
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);
const list = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : String(v).split(/[,;\n]/)).map(x => String(x).trim()).filter(Boolean);

export const shortId = id => String(id ?? "").trim().split("/").pop();
const idNumber = id => Number(String(id).replace(/^\D+/, "")) || 0;
/** Lower case, every run of other characters one space (Python: re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()). */
export const normTitle = t => String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function normalizeSettings(settings = {}) {
  const s = { ...DEFAULTS, ...settings };
  const phases = (Array.isArray(s.phases) ? s.phases : [])
    .map(p => ({ name: String(p?.name ?? "").trim(), from: int(p?.from, NaN), to: int(p?.to, NaN) }))
    .filter(p => Number.isFinite(p.from) && Number.isFinite(p.to) && p.from <= p.to)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    query: String(s.query ?? "").trim(),
    from: int(s.from, DEFAULTS.from), to: int(s.to, DEFAULTS.to),
    types: list(s.types), language: String(s.language ?? "").trim(),
    fields: list(s.fields).map(Number).filter(Number.isFinite),
    coreOnly: s.coreOnly !== false && s.coreOnly !== "false",
    subfields: list(Array.isArray(s.subfields) ? s.subfields : []),
    phases,
    overallThreshold: Math.max(1, int(s.overallThreshold, DEFAULTS.overallThreshold)),
    phaseThreshold: Math.max(1, int(s.phaseThreshold, DEFAULTS.phaseThreshold)),
    linkThreshold: Math.max(1, int(s.linkThreshold, DEFAULTS.linkThreshold)),
    resolution: num(s.resolution, DEFAULTS.resolution),
    runs: Math.max(1, int(s.runs, DEFAULTS.runs)),
    layoutStarts: Math.max(1, int(s.layoutStarts, DEFAULTS.layoutStarts)),
    layoutIterations: Math.max(1, int(s.layoutIterations, DEFAULTS.layoutIterations)),
    corrections: String(s.corrections ?? ""),
    perspectives: (Array.isArray(s.perspectives) ? s.perspectives : [])
      .map(p => ({ anchor: shortId(p?.anchor), name: String(p?.name ?? "").trim() })).filter(p => p.anchor && p.name),
  };
}

// ------------------------------------------------------------------ citing papers

export function citingRecord(w) {
  const source = w?.primary_location?.source ?? null;
  return {
    id: shortId(w.id), year: Number(w.publication_year) || 0,
    core: Boolean(source?.is_core), source: source?.display_name ?? "",
    subfield: w.primary_topic?.subfield?.display_name ?? "",
    refs: (w.referenced_works ?? []).map(shortId),
  };
}

/** One record per work id, in the order the works first appear; a later copy replaces the earlier one in place. */
export function citingRecords(pages) {
  const byId = new Map();
  for (const page of pages) for (const w of page ?? []) if (w?.id) byId.set(shortId(w.id), citingRecord(w));
  return [...byId.values()];
}

export function phaseOf(year, phases) {
  return phases.findIndex(p => year >= p.from && year <= p.to);
}

const kept = (r, s) => r.refs.length > 0 && r.year >= s.from && r.year <= s.to && (!s.coreOnly || r.core);

export function citingSet(records, settings) {
  const s = normalizeSettings(settings);
  const keep = s.subfields.length ? new Set(s.subfields) : null;
  return records.filter(r => kept(r, s) && (!keep || keep.has(r.subfield))).map(r => ({ ...r, phase: phaseOf(r.year, s.phases) }));
}

export function subfieldCounts(records, settings) {
  const s = normalizeSettings(settings);
  const out = new Map();
  for (const r of records) if (kept(r, s)) out.set(r.subfield, (out.get(r.subfield) || 0) + 1);
  return [...out].sort((a, b) => b[1] - a[1] || compareCodePoints(a[0], b[0]));
}

export function scopesOf(settings) {
  const s = normalizeSettings(settings);
  const years = (a, b) => `${a}–${b}`;
  return [
    { name: years(s.from, s.to), phase: "All years", from: s.from, to: s.to, threshold: s.overallThreshold },
    ...s.phases.map((p, i) => ({ name: years(p.from, p.to), phase: p.name || `Phase ${i + 1}`, from: p.from, to: p.to, threshold: s.phaseThreshold })),
  ];
}

// ------------------------------------------------------------------ counting

/** Each paper counts a work once; `refsOf(paper, k)` gives the paper's references (default: its `refs`). */
export function citationCounts(papers, phaseCount, refsOf = p => new Set(p.refs)) {
  const out = new Map();
  for (const [k, p] of papers.entries()) {
    for (const r of refsOf(p, k)) {
      let c = out.get(r);
      if (!c) out.set(r, (c = { cites: new Array(phaseCount + 1).fill(0), yearSum: 0 }));
      c.cites[0]++;
      if (p.phase >= 0 && p.phase < phaseCount) c.cites[p.phase + 1]++;
      c.yearSum += p.year;
    }
  }
  return out;
}

export function candidateIds(papers, settings) {
  const s = normalizeSettings(settings);
  const all = Math.floor(CANDIDATE_SHARE * s.overallThreshold), phase = Math.floor(CANDIDATE_SHARE * s.phaseThreshold);
  const out = [];
  for (const [id, { cites }] of citationCounts(papers, s.phases.length)) if (cites[0] >= all || cites.slice(1).some(v => v >= phase)) out.push(id);
  return out.sort(compareCodePoints);
}

// ------------------------------------------------------------------ cited works: metadata, cleaning, labels

export function citedRecord(w) {
  return {
    id: shortId(w.id), title: w.display_name || w.title || "", year: Number(w.publication_year) || 0,
    authors: (w.authorships ?? []).map(a => a?.author?.display_name).filter(Boolean),
    source: w.primary_location?.source?.display_name ?? "",
    doi: String(w.doi ?? "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase(), type: w.type ?? "",
  };
}

/** Authors as cited (the vault's rule): one surname, two joined by "&", three or more "First et al."; then the year. */
export function workLabel(work, year = work?.year) {
  const last = n => String(n).trim().split(/\s+/).pop() || "?";
  const a = work?.authors ?? [];
  const who = !a.length ? work?.source || "Anon" : a.length === 1 ? last(a[0]) : a.length === 2 ? `${last(a[0])} & ${last(a[1])}` : `${last(a[0])} et al.`;
  return year ? `${who} ${year}` : who;
}

const WORK_ID = /^W\d+$/;

/**
 * One instruction per line; "#" starts a comment.
 *   merge W1 W2 …     the same work: count them as one (the most-cited record is kept)
 *   drop W1 …         not a work (a journal's name as title, a catch-all record): leave it out
 *   label W1 Text     the label shown for a work; a year at the end is its year ("label W1 Pahl & Beitz 1984")
 */
export function parseCorrections(text) {
  const merge = [], drop = new Set(), label = new Map(), errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!line) continue;
    const [verb, ...rest] = line.split(/\s+/);
    const ids = rest.map(shortId);
    const bad = why => errors.push({ line: i + 1, text: raw.trim(), why });
    if (verb === "merge") {
      if (ids.length >= 2 && ids.every(id => WORK_ID.test(id))) merge.push(ids);
      else bad("merge needs two or more work ids (W…)");
    } else if (verb === "drop") {
      if (ids.length && ids.every(id => WORK_ID.test(id))) ids.forEach(id => drop.add(id));
      else bad("drop needs one or more work ids (W…)");
    } else if (verb === "label") {
      const text = rest.slice(1).join(" ").trim();
      if (WORK_ID.test(ids[0] ?? "") && text) label.set(ids[0], { label: text, year: Number(/(\d{4})[a-z]?$/.exec(text)?.[1]) || 0 });
      else bad("label needs a work id and a text");
    } else bad(`unknown instruction "${verb}" (use merge, drop or label)`);
  }
  return { merge, drop, label, errors };
}

/**
 * @param {Map<string, ReturnType<typeof citedRecord>>} meta metadata of the cited works that were looked up
 * @param {object[]} papers the citing set (citingSet)
 * @param {{candidates?: string[], requested?: Iterable<string>, corrections?: string}} p `requested`: every id
 *        asked from OpenAlex; a candidate that was asked for and not returned is a record OpenAlex no longer has
 */
export function cleaning(meta, papers, { candidates = [], requested = [], corrections = "" } = {}) {
  const fix = parseCorrections(corrections);
  const total = new Map([...citationCounts(papers, 0)].map(([id, c]) => [id, c.cites[0]]));
  const drop = new Map();
  for (const id of fix.drop) drop.set(id, "correction");
  const asked = new Set([...requested].map(shortId));
  for (const id of candidates) if (!meta.has(id) && asked.has(id) && !drop.has(id)) drop.set(id, "not in OpenAlex");
  const missing = candidates.filter(id => !meta.has(id) && !asked.has(id) && !drop.has(id));

  // groups of records of one work (union–find)
  const parent = new Map();
  const find = id => { let r = id; while (parent.get(r) !== r) r = parent.get(r); parent.set(id, r); return r; };
  const add = id => { if (!parent.has(id)) parent.set(id, id); };
  const union = (a, b) => { add(a); add(b); const x = find(a), y = find(b); if (x !== y) parent.set(y, x); };
  const ids = [...meta.keys()].filter(id => !drop.has(id));
  ids.forEach(add);
  const title = ids.map(id => normTitle(meta.get(id).title));
  const surname = ids.map(id => (meta.get(id).authors[0] ?? "").trim().split(/\s+/).pop().toLowerCase());
  // 1. the same title (its first 45 characters): editions and duplicate records
  const byTitle = new Map();
  for (const [i, id] of ids.entries()) {
    if (title[i].length < TITLE_MIN) continue;
    const key = title[i].slice(0, TITLE_KEY);
    if (byTitle.has(key)) union(byTitle.get(key), id); else byTitle.set(key, id);
  }
  // 2. one title is the other plus a subtitle, with the same year and first author
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (!surname[i] || surname[i] !== surname[j] || meta.get(ids[i]).year !== meta.get(ids[j]).year) continue;
      const [s, l] = [title[i], title[j]].sort((x, y) => x.length - y.length);
      if (s.length >= TITLE_MIN && l.startsWith(s + " ")) union(ids[i], ids[j]);
    }
  }
  // 3. the corrections
  for (const g of fix.merge) { const live = g.filter(id => !drop.has(id)); for (const id of live.slice(1)) union(live[0], id); }

  const members = new Map();
  for (const id of parent.keys()) { const r = find(id); if (!members.has(r)) members.set(r, []); members.get(r).push(id); }
  const better = (a, b) => (meta.has(b) - meta.has(a)) || ((total.get(b) ?? 0) - (total.get(a) ?? 0)) || (idNumber(a) - idNumber(b));
  const canon = new Map(), groups = [];
  for (const list of members.values()) {
    if (list.length < 2) continue;
    list.sort(better);
    for (const id of list) canon.set(id, list[0]);
    groups.push({ head: list[0], members: list });
  }
  groups.sort((a, b) => (total.get(b.head) ?? 0) - (total.get(a.head) ?? 0) || compareCodePoints(a.head, b.head));

  // labels: the authors of the most-cited record that has any, the earliest year among the records of the work
  // (editions, reprints); a correction overrides both
  const labels = new Map();
  for (const id of ids) {
    const head = canon.get(id) ?? id;
    if (labels.has(head)) continue;
    const group = groups.find(g => g.head === head)?.members ?? [head];
    const years = group.map(m => meta.get(m)?.year).filter(Boolean);
    const year = years.length ? Math.min(...years) : 0;
    const named = group.find(m => meta.get(m)?.authors.length) ?? head;
    const fixed = group.map(m => fix.label.get(m)).find(Boolean);
    labels.set(head, fixed ?? { label: workLabel(meta.get(named), year), year });
  }
  return { canon, groups, drop, missing, labels, errors: fix.errors, total };
}

// ------------------------------------------------------------------ co-citation

/** Pairs of works in `index` (id → position) cited by the same paper, counted over the papers' reference sets. */
export function coCitations(refSets, index, size = index.size) {
  const counts = new Map();
  for (const refs of refSets) {
    const hit = [];
    for (const r of refs) { const i = index.get(r); if (i !== undefined) hit.push(i); }
    hit.sort((a, b) => a - b);
    for (let x = 0; x < hit.length; x++) {
      for (let y = x + 1; y < hit.length; y++) {
        const key = hit[x] * size + hit[y];
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return [...counts].map(([key, c]) => [Math.floor(key / size), key % size, c]);
}

/**
 * Citation and co-citation counts per scope after cleaning. The works of all scopes are numbered together
 * (`ids`, sorted), so every scope refers to the same positions.
 * @returns {{ids: string[], counts: {cites: number[], yearSum: number}[], union: number[][], missing: string[],
 *   scopes: {name: string, phase: string, from: number, to: number, threshold: number, citing: number, refsAvg: number, nodes: number[], cocit: number[][]}[]}}
 */
export function countScopes(papers, meta, settings, clean) {
  const scopes = scopesOf(settings);
  const refs = papers.map(p => {
    const set = new Set();
    for (const r of p.refs) if (!clean.drop.has(r)) set.add(clean.canon.get(r) ?? r);
    return set;
  });
  const counts = citationCounts(papers, scopes.length - 1, (p, k) => refs[k]);
  const inScope = (p, s) => s === 0 || p.phase === s - 1;
  const chosen = scopes.map((sc, s) => [...counts].filter(([, c]) => c.cites[s] >= sc.threshold).map(([id]) => id));
  const missing = [...new Set(chosen.flat().filter(id => !meta.has(id)))].sort(compareCodePoints);
  const ids = [...new Set(chosen.flat().filter(id => meta.has(id)))].sort(compareCodePoints);
  const index = new Map(ids.map((id, i) => [id, i]));
  return {
    ids, missing,
    counts: ids.map(id => counts.get(id)),
    union: coCitations(refs, index, ids.length),
    scopes: scopes.map((sc, s) => {
      const nodes = chosen[s].filter(id => meta.has(id)).map(id => index.get(id)).sort((a, b) => a - b);
      const own = new Map(nodes.map(i => [ids[i], i]));
      const members = papers.map((p, k) => k).filter(k => inScope(papers[k], s));
      return {
        ...sc, citing: members.length,
        refsAvg: members.length ? members.reduce((a, k) => a + papers[k].refs.length, 0) / members.length : 0,
        nodes, cocit: coCitations(members.map(k => refs[k]), own, ids.length),
      };
    }),
  };
}

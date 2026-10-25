// Help texts shown next to the settings of the cluster discovery; "note N" refers to a note in the library.
export const HELP = {
  wText: "Text similarity: notes with similar wording are linked (TF-IDF, cosine). Higher weight = content dominates.",
  k: "A text link is kept only if both notes are among each other's k most similar notes. Small k = sparse graph, only very close pairs.",
  wTag: "Notes sharing a tag are linked; rare tags count more.",
  wLink: "An explicit [[link]] between two publication notes adds a link.",
  algorithm: "Leiden (Traag et al. 2019, note 122) guarantees connected clusters. Louvain (Blondel et al. 2008, note 119) is the classic method.",
  quality: "Modularity (Newman & Girvan 2004, note 114) compares links inside groups with a random network — good overview, can merge small groups. CPM: a group is a cluster if its density exceeds γ — good for small tight modules.",
  resolution: "Modularity γ: 1 is standard; higher = more, smaller clusters. For CPM, γ is the minimum density; leave empty for 4 × the graph density.",
  runs: "The algorithm is repeated with different seeds; notes that land together in most runs form the final clusters (consensus clustering, Lancichinetti & Fortunato 2012, note 121). More = stabler, slower.",
  threshold: "Share of runs two notes must be grouped together to stay linked. 0.5 = majority vote.",
  bridgeP: "Participation coefficient P (Guimerà & Amaral 2005, note 115): 0 = all links inside its own cluster, near 1 = spread over many. Papers above this value are bridge papers.",
  seed: "Random seed: the same seed gives the same result. Change it to see how stable the clusters are.",
  dryRun: "Only rewrite the report. Leave the cluster hub notes and the '[auto]' graph presets untouched. Untick to update them: close Obsidian first, so the Graph Presets plugin does not overwrite the new presets.",
};

// Help texts of the co-citation phases (web/pages/co-citation.js).
export const CO_HELP = {
  query: "Searched in title, abstract and keywords without word stemming (OpenAlex's title_abstract_keywords.search.exact), so write each word form: modular OR modularity OR modularization. Use AND, OR, NOT, brackets and \"exact phrases\"; no commas.",
  years: "Publication years of the citing papers. Changing them later needs a new download; the phases must lie inside them.",
  types: "OpenAlex document types, separated by commas, e.g. article, review, book-chapter. Leave empty for all types.",
  language: "OpenAlex language code of the citing papers, e.g. en. Leave empty for every language.",
  fields: "Only papers whose main topic is in these OpenAlex fields. None ticked = every field. Narrowing here saves credits; the subfields below narrow further without a new download.",
  coreOnly: "Keep only papers in OpenAlex's core sources (journals and series that pass a quality bar), which comes close to the selective databases (Web of Science, Scopus) that bibliometric studies use.",
  subfields: "Keep only papers whose main topic is in the ticked subfields. All ticked = every subfield. Changes need no new download.",
  phases: "Time slices by the publication year of the citing papers. Each phase gets its own map; a work keeps its place in every map.",
  overallThreshold: "A work enters the all-years map when at least this many citing papers cite it. Mertens et al. 2023: 45.",
  phaseThreshold: "A work enters a phase's map when at least this many citing papers of that phase cite it. Mertens et al. 2023: 17.",
  linkThreshold: "A line is drawn between two works co-cited at least this many times. Clustering uses every co-citation, not only the lines. Mertens et al. 2023: 10.",
  resolution: "Resolution of VOSviewer's clustering (CPM on association strength). 1 is VOSviewer's default; higher gives more, smaller clusters.",
  runs: "The clustering is run with seeds 1 … n and the best result is kept. More runs: stabler, slower.",
  layoutStarts: "The VOS layout starts from this many random positions and keeps the best map.",
  corrections: "One instruction per line; # starts a comment. merge W1 W2: two records of one work. drop W1: not a work (a journal's name as title, a catch-all record). label W1 Pahl & Beitz 1984: the label shown (a year at the end is its year). Find the ids under Data.",
  outputDir: "Where the VOSviewer files (one map and one network file per map) and the figure are written. Earlier map and network files there are replaced.",
  notePath: "The evidence-synthesis note. It is rewritten on every run, so keep your own reading in another note. A note this tool did not write is never overwritten.",
};

export const SETTINGS_HELP = {
  libraryDir: "The folder of the publication notes inside the vault. When it has no notes, the app looks in 00 - Library/Publication Summary, 00 - Library and 98 - Publications.",
  hubDir: "Where the cluster discovery writes one hub note per cluster (old generated notes are deleted first).",
  reportDir: "Where the cluster discovery report is written.",
  presetsFile: "The data file of the Graph Presets plugin; the '[auto]' presets are replaced there (a .bak copy is kept).",
  exportDir: "Where Library.xlsx and Library graph.html are written.",
  coCitationDir: "Where the co-citation phases keep each analysis: its settings and the data downloaded from OpenAlex, so a rerun costs no credits. A scratch folder that is not in git (tmp/ in this vault).",
  vaultName: "The vault's name in Obsidian, for the 'Open in Obsidian' links. Leave empty to use the folder name.",
  mailto: "Your email for OpenAlex's polite pool (faster, more reliable answers). Optional.",
  apiKey: "A free key from openalex.org raises OpenAlex's daily budget (without one: about 1000 credits a day; a lookup of 50 DOIs costs 1, a title search 10). Kept in this browser only.",
};

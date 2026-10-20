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

export const SETTINGS_HELP = {
  libraryDir: "The folder of the publication notes inside the vault. When it has no notes, the app looks in 00 - Library/Publication Summary, 00 - Library and 98 - Publications.",
  hubDir: "Where the cluster discovery writes one hub note per cluster (old generated notes are deleted first).",
  reportDir: "Where the cluster discovery report is written.",
  presetsFile: "The data file of the Graph Presets plugin; the '[auto]' presets are replaced there (a .bak copy is kept).",
  exportDir: "Where Library.xlsx and Library graph.html are written.",
  vaultName: "The vault's name in Obsidian, for the 'Open in Obsidian' links. Leave empty to use the folder name.",
  mailto: "Your email for OpenAlex's polite pool (faster, more reliable answers). Optional.",
  apiKey: "A free key from openalex.org raises OpenAlex's daily budget (without one: about 1000 credits a day; a lookup of 50 DOIs costs 1, a title search 10). Kept in this browser only.",
};

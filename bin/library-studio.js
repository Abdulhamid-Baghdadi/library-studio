#!/usr/bin/env node
// Library Studio from the command line (the same engine as the browser app), on a vault folder on disk.
//
//   node bin/library-studio.js <command> [--vault <folder>] [options]
//
//   cluster      cluster discovery; writes the report. --write also replaces the hub notes and the "[auto]"
//                graph presets (close Obsidian first). Options: --runs N --k N --algorithm leiden|louvain
//                --quality modularity|cpm --resolution x --gamma x --w-text x --w-tag x --w-link x
//                --threshold x --bridge-p x --seed N --hub-dir <path> --report-dir <path> --presets <path>
//   citations    counts of citations between library papers from OpenAlex; --apply writes the properties
//                references / cited_by. --mailto <email> joins OpenAlex's polite pool.
//   enrich       fills empty properties (authors, journal, year, url, abstract) from OpenAlex, proposes suggested_doi /
//                suggested_category, writes Gaps.md, Candidates.md and References.json in the library folder.
//                Without --apply: a dry run that only prints what would change. --mailto <email> for the polite pool.
//   check-links  reports links between publication notes; --fix replaces them by plain-text references
//   export       writes "96 - Library export/Library.xlsx", "Library graph.html" and "98 - Publications/Library.bib";
//                adds a citekey property to notes without one (--no-citekeys: leave the notes untouched)
//
//   --vault defaults to the current folder (it must contain "98 - Publications").
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { nodeFolder } from "../src/adapters/node-folder.js";
import { fetchHttp } from "../src/adapters/fetch-http.js";
import { checkLinks, CLUSTER_STEPS, enrichLibrary, exportLibrary, openLibrary, runClusterDiscovery, updateCitations, withApiKey } from "../src/index.js";

const args = process.argv.slice(2);
const command = args.find(a => !a.startsWith("--"));
const opt = (name, fallback = undefined) => { const i = args.indexOf(`--${name}`); return i >= 0 && !args[i + 1]?.startsWith("--") ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
// OpenAlex API key: --api-key or the OPENALEX_API_KEY environment variable (raises the free daily budget)
const http = () => withApiKey(fetchHttp(), opt("api-key", process.env.OPENALEX_API_KEY ?? ""));

const clock = {
  today: () => new Date().toLocaleDateString("sv"),
  now: () => new Date().toLocaleString("sv").slice(0, 16),
  iso: () => new Date().toISOString(),
};

async function main() {
  if (!command || flag("help")) { console.log((await readFile(new URL(import.meta.url), "utf8")).split("\n").slice(1, 21).map(l => l.replace(/^\/\/ ?/, "")).join("\n")); return 0; }
  const vault = resolve(opt("vault", process.cwd()));
  const folder = nodeFolder(vault);
  const library = await openLibrary(folder, { libraryDir: opt("library", "98 - Publications") });
  console.log(`${library.papers.length} publication notes in ${vault}\\${library.dir}`);

  if (command === "cluster") {
    const settings = {
      runs: opt("runs"), k: opt("k"), algorithm: opt("algorithm"), quality: opt("quality"), resolution: opt("resolution"), gamma: opt("gamma"),
      wText: opt("w-text"), wTag: opt("w-tag"), wLink: opt("w-link"), threshold: opt("threshold"), bridgeP: opt("bridge-p"), seed: opt("seed"),
      dryRun: !flag("write"),
    };
    const paths = { hubDir: opt("hub-dir"), reportDir: opt("report-dir"), presetsFile: opt("presets") };
    for (const k of Object.keys(paths)) if (paths[k] === undefined) delete paths[k];
    const r = await runClusterDiscovery(folder, library, settings, {
      clock, paths, onStep: (n, text, detail) => console.log(`[${n}/${CLUSTER_STEPS.length}] ${text}${detail ? " | " + detail : ""}`),
    });
    console.log(`${r.algorithm}/${r.quality} γ = ${r.gamma}; disconnected clusters: ${r.disconnected}`);
    console.log(`${r.notes} notes, ${r.edges} edges, ${r.clusters.length} clusters, Q = ${r.Q}, NMI = ${r.nmi}, ARI = ${r.ari}, ${r.clusters.reduce((a, c) => a + c.bridges.length, 0)} bridge papers`);
    for (const c of r.clusters) console.log(`  ${c.id} (${String(c.size).padStart(3)}): ${c.terms.slice(0, 4).join(", ")}`);
    console.log(`Ignored ${r.boilerplate} boilerplate lines repeated verbatim in 3+ notes`);
    console.log(`Report: ${r.report}`);
    if (r.hubs) console.log(`Hub notes: replaced ${r.hubs.removed} old with ${r.hubs.written} new in ${r.hubs.dir}`);
    if (r.presets) console.log(`Presets: replaced ${r.presets.removed} old '[auto]' presets with ${r.presets.added} new in ${r.presets.file} (backup: ${r.presets.backup})\nReload Obsidian now (command palette -> 'Reload app without saving') so the plugin reads them.`);
    if (flag("json")) console.log("@@RESULT " + JSON.stringify(r));
    return 0;
  }
  if (command === "citations") {
    const r = await updateCitations(folder, library, http(), { apply: flag("apply"), mailto: opt("mailto", ""), onProgress: m => console.log(m) });
    console.log(`${r.publications} publications, ${r.found} found in OpenAlex, ${r.links} citations between library papers`);
    console.log(`Not in OpenAlex (no DOI or not indexed): ${r.missing}`);
    console.log("Most cited within the library:");
    for (const m of r.mostCited) console.log(`  ${String(m.count).padStart(3)}  ${m.stem.slice(0, 80)}`);
    console.log(r.apply ? `written (${r.written} notes changed)` : "(dry run: add --apply to write)");
    return 0;
  }
  if (command === "enrich") {
    const r = await enrichLibrary(folder, library, http(), { apply: flag("apply"), mailto: opt("mailto", ""), clock, onProgress: m => console.log(m) });
    console.log(`${r.matched} of ${r.papers} papers found in OpenAlex by DOI`);
    console.log(`Fills: authors ${r.fills.authors}, journal ${r.fills.journal}, year ${r.fills.year}, url ${r.fills.url}, abstract ${r.fills.abstract}`);
    console.log(`Proposals: suggested_doi ${r.suggestions.doi}, suggested_category ${r.suggestions.category} · disagreements ${r.disagreements} · papers with gaps ${r.gaps} · candidate papers ${r.candidates}`);
    for (const p of r.plans.filter(p => p.disagreements.length)) for (const d of p.disagreements) console.log(`  disagree ${p.no}: ${d.key}: note "${String(d.note).slice(0, 50)}" vs OpenAlex "${String(d.openalex).slice(0, 50)}"`);
    if (r.incomplete) console.log(`WARNING: ${r.incomplete}`);
    console.log(r.apply ? `written: ${r.written} notes changed; ${r.files.join(", ")}` : "(dry run: add --apply to write)");
    return 0;
  }
  if (command === "check-links") {
    const r = await checkLinks(folder, library, { fix: flag("fix") });
    for (const f of r.findings) console.log(`${f.stem}.md: ${f.count} link(s) to other publications`);
    console.log(`${r.fixed ? "Fixed" : "Found"} ${r.total} publication-to-publication link(s).`);
    return r.total && !r.fixed ? 1 : 0;
  }
  if (command === "export") {
    const template = await readFile(new URL("../web/graph-template.html", import.meta.url), "utf8");
    const r = await exportLibrary(folder, library, { template, exportDir: opt("export-dir", undefined), clock, citekeys: !flag("no-citekeys") });
    console.log(`${r.papers} papers -> ${vault}\\${r.files[0]}`);
    console.log(`graph: ${r.nodes} nodes, ${r.edges} links -> ${vault}\\${r.files[1]}`);
    console.log(`BibTeX: ${r.bibtex.entries} entries -> ${vault}\\${r.files[2]}` + (r.bibtex.citekeysWritten ? ` (citekey property added to ${r.bibtex.citekeysWritten} notes)` : ""));
    return 0;
  }
  console.error(`Unknown command "${command}". Commands: cluster, citations, enrich, check-links, export.`);
  return 2;
}

main().then(code => process.exit(code), e => { console.error(e.message || e); process.exit(1); });

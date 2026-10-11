/**
 * Cluster discovery as a use case: runs the analysis on the open library and writes its results into the
 * vault: the report (always), and — unless it is a dry run — one hub note per cluster and the "[auto]"
 * graph presets of the Graph Presets plugin.
 *
 *   runClusterDiscovery(folder, library, settings, { clock, onStep, paths, ids })  → result for the page
 *   PATHS  default places in the vault (hub notes, report, presets file); override through `paths`
 * @module services/cluster-discovery
 */
import { analyze, STEPS } from "../domain/cluster-analysis.js";
import { GENERATED_MARKS, hubNames, hubNotes, REPORT_NAME, reportMarkdown, resultJson, updatePresets } from "../domain/cluster-notes.js";

export const PATHS = {
  hubDir: "01 - Project 1 - PhD Overview/06 - Discovered clusters",
  reportDir: "01 - Project 1 - PhD Overview/03 - Evidence synthesis",
  presetsFile: ".obsidian/plugins/graph-presets/data.json",
};

/**
 * @param {import("../ports/folder.js").Folder} folder the vault
 * @param {import("./library.js").Library} library
 * @param {object} settings see domain/cluster-analysis DEFAULTS (dryRun: report only)
 * @param {{clock: {today: () => string, now: () => string, iso: () => string}, onStep?: Function, paths?: Partial<typeof PATHS>, ids?: () => string}} p
 */
export async function runClusterDiscovery(folder, library, settings, { clock, onStep = () => {}, paths = {}, ids = () => crypto.randomUUID() }) {
  const { hubDir, reportDir, presetsFile } = { ...PATHS, ...paths };
  const a = analyze(library.papers, settings, { onStep, libraryDir: library.dir });
  const dry = a.options.dryRun;
  onStep(7, STEPS[6], dry ? "dry run: report only" : "");

  let names = null, removed = 0, presets = null;
  if (!dry) {
    names = hubNames(a);
    await folder.makeDir(hubDir);
    for (const f of await folder.list(hubDir)) {
      if (!f.endsWith(".md")) continue;
      const text = await folder.readText(`${hubDir}/${f}`);
      if (GENERATED_MARKS.some(m => text.includes(m))) { await folder.remove(`${hubDir}/${f}`); removed++; }
    }
    for (const { name, text } of hubNotes(a, { today: clock.today(), hubNames: names })) await folder.writeText(`${hubDir}/${name}.md`, text);
  }
  const report = `${reportDir}/${REPORT_NAME}.md`;
  await folder.makeDir(reportDir);
  await folder.writeText(report, reportMarkdown(a, { today: clock.today(), hubNames: names }));

  if (!dry) {
    onStep(8, STEPS[7], "cluster layout + colour groups");
    const raw = (await folder.exists(presetsFile)) ? await folder.readText(presetsFile) : '{\n  "presets": [],\n  "activePresetId": null\n}';
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error(`${presetsFile} is not valid JSON; fix or remove it and run again.`); }
    const backup = presetsFile.replace(/\.json$/, "") + ".json.bak";
    await folder.writeText(backup, raw);
    const out = updatePresets(data, a, { hubNames: names, hubDir, libraryDir: library.dir, now: clock.iso(), uuid: ids });
    await folder.writeText(presetsFile, JSON.stringify(out.data, null, 2));
    presets = { added: out.added, removed: out.removed, backup, file: presetsFile };
  } else {
    onStep(8, "Skipped graph presets", "dry run");
  }
  return {
    ...resultJson(a, { report }),
    hubs: names ? { written: names.length, removed, dir: hubDir } : null,
    presets, settings: a.options, finished: clock.now(),
  };
}

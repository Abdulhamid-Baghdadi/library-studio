/**
 * VOSviewer map and network files (VOSviewer manual 1.6, sections "Map file" and "Network file"): tab-separated
 * text that VOSviewer opens with Create → Create a map based on network data → choose a map file and its network
 * file. One pair of files per scope (all years, then each phase), with the works numbered as in the analysis, so
 * every file of a run keeps the same ids and positions.
 *
 *   vosviewerFiles(result)   [{ name, text }]: "map - 0 - all years 1990-2020.txt", "network - 0 - …", …
 *   mapFile(result, s)       columns id, label, description, url, x, y, cluster, weight<Citations>,
 *                            score<Avg. citing year>; y is flipped (VOSviewer's y axis points up)
 *   networkFile(result, s)   one line per co-cited pair of the scope: id, id, co-citations
 *   fileStem(scope, s)       "0 - all years 1990-2020"
 * @module domain/vosviewer
 */
import { fixed } from "./text-rules.js";

const clean = s => String(s ?? "").replace(/[\t\r\n]+/g, " ");

export const fileStem = (scope, s) => `${s} - ${scope.phase.toLowerCase()} ${scope.name.replace(/–/g, "-")}`;

export function mapFile(result, s) {
  const scope = result.scopes[s];
  const lines = ["id\tlabel\tdescription\turl\tx\ty\tcluster\tweight<Citations>\tscore<Avg. citing year>"];
  scope.nodes.forEach((i, j) => {
    const n = result.nodes[i];
    const description = `${n.title} (${n.year})` + (n.lib ? `. Library No. ${String(n.lib.no).padStart(3, "0")}` : "");
    const url = n.doi ? `https://doi.org/${n.doi}` : `https://openalex.org/${n.id}`;
    lines.push([i + 1, clean(n.label), clean(description), url, fixed(n.x, 4), fixed(-n.y, 4), scope.clusterOf[j] + 1, n.cites[s], fixed(n.avgYear, 1).replace(/\.0$/, "")].join("\t"));
  });
  return lines.join("\n") + "\n";
}

export function networkFile(result, s) {
  const pairs = [...result.scopes[s].cocit].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  return pairs.map(([a, b, c]) => `${a + 1}\t${b + 1}\t${c}\n`).join("");
}

export function vosviewerFiles(result) {
  return result.scopes.flatMap((scope, s) => [
    { name: `map - ${fileStem(scope, s)}.txt`, text: mapFile(result, s) },
    { name: `network - ${fileStem(scope, s)}.txt`, text: networkFile(result, s) },
  ]);
}

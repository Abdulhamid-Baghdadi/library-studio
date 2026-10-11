/**
 * Writes the library export into the vault: "96 - Library export/Library.xlsx" and "Library graph.html".
 *
 *   exportLibrary(folder, library, { template, exportDir })  → { papers, nodes, edges, files }
 *   `template` is the text of the graph page template (web/graph-template.html).
 * @module services/export
 */
import { EXPORT_DIR, GRAPH_PAGE, graphData, graphPage, WORKBOOK, workbook } from "../domain/export.js";
import { xlsx } from "../domain/xlsx.js";

export async function exportLibrary(folder, library, { template, exportDir = EXPORT_DIR }) {
  const pdfs = new Set(await folder.list(`${library.dir}/PDFs`));
  const papers = [...library.papers].sort((a, b) => a.no - b.no);
  const pdfHref = p => (p.pdf && pdfs.has(p.pdf) ? `../${library.dir}/PDFs/${p.pdf}` : "");
  await folder.makeDir(exportDir);
  await folder.writeBytes(`${exportDir}/${WORKBOOK}`, await xlsx(workbook(papers, { pdfHref })));
  const data = graphData(papers, { pdfHref });
  await folder.writeText(`${exportDir}/${GRAPH_PAGE}`, graphPage(template, data));
  return { papers: papers.length, nodes: data.nodes.length, edges: data.edges.length, files: [`${exportDir}/${WORKBOOK}`, `${exportDir}/${GRAPH_PAGE}`] };
}

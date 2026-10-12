/**
 * Writes the library export into the vault: "96 - Library export/Library.xlsx" and "Library graph.html", and
 * the BibTeX file "98 - Publications/Library.bib" (one entry per note, cite keys = the notes' `citekey`
 * property, which is added to notes that do not have one yet).
 *
 *   exportLibrary(folder, library, { template, exportDir, clock, citekeys })
 *     → { papers, nodes, edges, files, bibtex: { entries, citekeysWritten } }
 *   citekeysMissing(library)  how many notes would get a citekey
 * @module services/export
 */
import { assignCitekeys, libraryBibtex } from "../domain/bibtex.js";
import { EXPORT_DIR, GRAPH_PAGE, graphData, graphPage, WORKBOOK, workbook } from "../domain/export.js";
import { insertProp } from "../domain/frontmatter.js";
import { xlsx } from "../domain/xlsx.js";

export const BIBTEX = "Library.bib";

export const citekeysMissing = library => library.papers.filter(p => !p.citekey).length;

export async function exportLibrary(folder, library, { template, exportDir = EXPORT_DIR, clock = null, citekeys = true }) {
  const pdfs = new Set(await folder.list(`${library.dir}/PDFs`));
  const papers = [...library.papers].sort((a, b) => a.no - b.no);
  const pdfHref = p => (p.pdf && pdfs.has(p.pdf) ? `../${library.dir}/PDFs/${p.pdf}` : "");
  await folder.makeDir(exportDir);
  await folder.writeBytes(`${exportDir}/${WORKBOOK}`, await xlsx(workbook(papers, { pdfHref })));
  const data = graphData(papers, { pdfHref });
  await folder.writeText(`${exportDir}/${GRAPH_PAGE}`, graphPage(template, data));

  const keys = assignCitekeys(papers);
  let citekeysWritten = 0;
  if (citekeys) {
    for (const p of papers) {
      if (p.citekey) continue;
      const path = `${library.dir}/${p.stem}.md`;
      const text = await folder.readText(path);
      const next = insertProp(text, "citekey", keys.get(p.stem), "doi");
      if (next !== text) { await folder.writeText(path, next); citekeysWritten++; }
      p.citekey = keys.get(p.stem);
    }
  }
  const bib = `${library.dir}/${BIBTEX}`;
  await folder.writeText(bib, libraryBibtex(papers, keys, { pdfOf: p => (p.pdf && pdfs.has(p.pdf) ? `PDFs/${p.pdf}` : ""), generated: clock?.today() ?? "" }));
  return {
    papers: papers.length, nodes: data.nodes.length, edges: data.edges.length,
    files: [`${exportDir}/${WORKBOOK}`, `${exportDir}/${GRAPH_PAGE}`, bib],
    bibtex: { entries: papers.length, citekeysWritten },
  };
}

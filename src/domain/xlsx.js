/**
 * A small .xlsx writer: several sheets with a styled header row, hyperlinks, column widths, a frozen
 * header, an auto-filter and wrapped text columns. Enough for the library export; no dependencies.
 *
 *   await xlsx(sheets) → Uint8Array
 *   sheets: [{
 *     name,                       sheet name (≤ 31 characters)
 *     headers,                    string[]; styled bold on blue, frozen, with an auto-filter (omit for a plain sheet)
 *     rows,                       cell[][]; a cell is a string, a number, or { v, link } (link: URL or relative path)
 *     widths,                     number[] column widths in characters
 *     wrap,                       column letters whose body cells wrap ("D")
 *   }]
 * @module domain/xlsx
 */
import { zip } from "./zip.js";

const esc = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function columnLetter(i) {
  let s = "";
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// cellXfs: 0 default · 1 header · 2 body · 3 body wrapped · 4 link · 5 link wrapped
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5597"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(ref, cell, style) {
  const v = cell && typeof cell === "object" ? cell.v : cell;
  if (v == null || v === "") return "";
  if (typeof v === "number") return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml({ headers, rows, widths = [], wrap = [] }) {
  const styled = Boolean(headers);
  const all = styled ? [headers, ...rows] : rows;
  const lines = [], links = [];
  all.forEach((row, r) => {
    const cells = row.map((cell, c) => {
      const letter = columnLetter(c + 1), ref = `${letter}${r + 1}`;
      const link = cell && typeof cell === "object" ? cell.link : null;
      if (link) links.push({ ref, link });
      const style = !styled ? 0 : r === 0 ? 1 : (link ? 4 : 2) + (wrap.includes(letter) ? 1 : 0);
      return cellXml(ref, cell, style);
    }).join("");
    lines.push(`<row r="${r + 1}">${cells}</row>`);
  });
  const lastCol = columnLetter(Math.max(1, ...all.map(r => r.length)));
  const dimension = `A1:${lastCol}${Math.max(1, all.length)}`;
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const views = styled
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const filter = styled ? `<autoFilter ref="${dimension}"/>` : "";
  const hyperlinks = links.length ? `<hyperlinks>${links.map((l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`).join("")}</hyperlinks>` : "";
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="${dimension}"/>${views}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${lines.join("")}</sheetData>${filter}${hyperlinks}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const rels = links.length ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links.map((l, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(l.link)}" TargetMode="External"/>`).join("")}</Relationships>` : null;
  return { xml, rels, dimension };
}

export async function xlsx(sheets) {
  const entries = [];
  const parts = sheets.map(sheetXml);
  const names = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const filters = sheets.map((s, i) => s.headers ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name).replace(/'/g, "''")}'!$A$1:$${parts[i].dimension.split(":")[1].replace(/\d+/, "")}$${parts[i].dimension.split(":")[1].replace(/\D+/, "")}</definedName>` : "").join("");
  entries.push({ name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` });
  entries.push({ name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  entries.push({ name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews><sheets>${names}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ""}<calcPr calcId="0"/></workbook>` });
  entries.push({ name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  entries.push({ name: "xl/styles.xml", data: STYLES });
  parts.forEach((p, i) => {
    entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: p.xml });
    if (p.rels) entries.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: p.rels });
  });
  return zip(entries);
}

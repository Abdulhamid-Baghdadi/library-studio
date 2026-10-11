import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { columnLetter, xlsx } from "../../src/domain/xlsx.js";
import { crc32, zip } from "../../src/domain/zip.js";

/** Reads a ZIP written by zip.js back into { name: text } (local headers only). */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true), crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true), rawSize = view.getUint32(at + 22, true), nameLen = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    const raw = method === 8 ? new Uint8Array(inflateRawSync(data)) : data;
    assert.equal(raw.length, rawSize);
    assert.equal(crc32(raw), crc);
    out[name] = new TextDecoder().decode(raw);
    at += 30 + nameLen + size;
  }
  assert.equal(view.getUint32(at, true), 0x02014b50);     // central directory follows
  return out;
}

test("columnLetter", () => {
  assert.deepEqual([1, 2, 26, 27, 52, 53, 702, 703].map(columnLetter), ["A", "B", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
});

test("zip round-trips entries with correct sizes and checksums", async () => {
  const bytes = await zip([{ name: "a.txt", data: "hello" }, { name: "dir/b.bin", data: new Uint8Array([1, 2, 3]) }]);
  const files = unzip(bytes);
  assert.deepEqual(Object.keys(files), ["a.txt", "dir/b.bin"]);
  assert.equal(files["a.txt"], "hello");
});

test("xlsx: sheets, header style, hyperlinks, filter, frozen pane, wrapped columns", async () => {
  const bytes = await xlsx([
    { name: "Library", headers: ["No.", "Title", "DOI"], rows: [["001", "A & B <c>", { v: "10.1/x", link: "https://doi.org/10.1/x" }], ["002", "", 3]], widths: [6, 50, 24], wrap: ["B"] },
    { name: "Read me", rows: [["note"]], widths: [120] },
  ]);
  const f = unzip(bytes);
  assert.ok(f["[Content_Types].xml"].includes("/xl/worksheets/sheet2.xml"));
  assert.ok(f["xl/workbook.xml"].includes('<sheet name="Library" sheetId="1" r:id="rId1"/>'));
  assert.ok(f["xl/workbook.xml"].includes(`<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Library'!$A$1:$C$3</definedName>`));
  const s1 = f["xl/worksheets/sheet1.xml"];
  assert.ok(s1.includes('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">No.</t></is></c>'));        // header style
  assert.ok(s1.includes('<c r="B2" t="inlineStr" s="3"><is><t xml:space="preserve">A &amp; B &lt;c&gt;</t></is></c>'));   // wrapped, escaped
  assert.ok(s1.includes('<c r="C2" t="inlineStr" s="4">'));                                                      // link style
  assert.ok(s1.includes('<c r="C3" s="2"><v>3</v></c>'));                                                         // number
  assert.ok(!s1.includes('r="B3"'));                                                                              // empty cell omitted
  assert.ok(s1.includes('<autoFilter ref="A1:C3"/>'));
  assert.ok(s1.includes('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'));
  assert.ok(s1.includes('<hyperlink ref="C2" r:id="rId1"/>'));
  assert.ok(f["xl/worksheets/_rels/sheet1.xml.rels"].includes('Target="https://doi.org/10.1/x" TargetMode="External"'));
  const s2 = f["xl/worksheets/sheet2.xml"];
  assert.ok(s2.includes('<c r="A1" t="inlineStr" s="0">'));          // plain sheet: no header style
  assert.ok(!s2.includes("autoFilter"));
  assert.equal(f["xl/worksheets/_rels/sheet2.xml.rels"], undefined);
});

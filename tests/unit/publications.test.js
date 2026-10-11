import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyLinks, paperLabel, readPublication, section } from "../../src/domain/publications.js";

const NOTE = [
  "---", "type: publication", "index: 5", "authors: Ulrich", "year: 1995",
  'title: "The Role of Product Architecture"', "doi: 10.1016/0048-7333(94)00775-3",
  'pdf: "[[005 - 1995 - Ulrich - The Role.pdf]]"', "category:", '  - "[[01- Foundations]]"', "tags:", "  - Product-Architecture",
  "references:", '  - "[[003 - 1990 - Henderson & Clark - Architectural Innovation]]"', "cited_by: []", "---", "",
  "# The Role of Product Architecture", "", "## Abstract", "", "Architecture is the scheme", "by which function maps to components.", "",
  "## Why is this paper important?", "", "It defines the field. See [[Modularity (Ulrich 1995)|the definition]] and ![[figure.png]].", "",
].join("\r\n");

test("readPublication: properties, derived fields and sections (CRLF note)", () => {
  const p = readPublication("005 - 1995 - Ulrich - The Role", NOTE);
  assert.equal(p.no, 5);
  assert.equal(p.index, "5");
  assert.equal(p.cite, "Ulrich");
  assert.equal(p.title, "The Role of Product Architecture");
  assert.equal(p.pdf, "005 - 1995 - Ulrich - The Role.pdf");
  assert.deepEqual(p.categories, ["01- Foundations"]);
  assert.deepEqual(p.tags, ["product-architecture"]);
  assert.deepEqual(p.refs, ["003 - 1990 - Henderson & Clark - Architectural Innovation"]);
  assert.deepEqual(p.citedBy, []);
  assert.equal(p.abstract, "Architecture is the scheme by which function maps to components.");
  assert.match(p.why, /^It defines the field/);
  assert.deepEqual([...p.links].sort(), ["Modularity (Ulrich 1995)", "figure.png"]);
  assert.equal(paperLabel(p), "Ulrich 1995 (No. 005)");
});

test("readPublication: index falls back to the file name; non-publications are null", () => {
  const p = readPublication("012 - 2000 - Someone - Title", "---\ntype: publication\ntitle: T\n---\nbody\n");
  assert.equal(p.no, 12);
  assert.equal(p.index, "012 - 2000 - Someone - Title");
  assert.equal(readPublication("tags", "---\ntype: index\n---\n"), null);
  assert.equal(readPublication("plain", "no front matter"), null);
});

test("section and bodyLinks", () => {
  assert.equal(section("## A\n\nx\ny\n## B\nz", "A"), "x y");
  assert.equal(section("## A\nlast", "A"), "last");
  assert.equal(section("## B\n", "A"), "");
  assert.deepEqual([...bodyLinks("[[X|alias]] [[Y#head]] ![[Z.png]]")], ["X", "Y", "Z.png"]);
});

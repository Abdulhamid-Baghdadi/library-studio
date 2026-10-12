import { test } from "node:test";
import assert from "node:assert/strict";
import { assignCitekeys, bibtexEntry, citekeyFor, libraryBibtex, parseAuthors } from "../../src/domain/bibtex.js";
import { insertProp } from "../../src/domain/frontmatter.js";

const names = (a, surnamesOnly = false) => parseAuthors(a, { surnamesOnly }).map(n => (n.first ? `${n.last}, ${n.first}` : n.last));

test("parseAuthors: full names", () => {
  assert.deepEqual(names("Piers Forster; Trude Storelvmo; Nees Jan van Eck"), ["Forster, Piers", "Storelvmo, Trude", "van Eck, Nees Jan"]);
  assert.deepEqual(names("Cordella, Alfieri, Clemm & Berwald"), ["Cordella", "Alfieri", "Clemm", "Berwald"]);
  assert.deepEqual(names("Karl Ulrich & Steven Eppinger"), ["Ulrich, Karl", "Eppinger, Steven"]);
  assert.deepEqual(names("Ulrike von Luxburg"), ["von Luxburg, Ulrike"]);
  assert.deepEqual(names("Ronnie E. Thebeau"), ["Thebeau, Ronnie E."]);
  assert.deepEqual(names("Ulrich, K. T."), ["Ulrich, K. T."]);
  assert.deepEqual(names("Simpson, TW; Bobuk, A; Slingerland, LA"), ["Simpson, TW", "Bobuk, A", "Slingerland, LA"]);
  assert.deepEqual(names("Mikkola, J.H.; Gassmann, O."), ["Mikkola, J.H.", "Gassmann, O."]);
  assert.deepEqual(names("Jeong, M.-G.; Morrison, J.R."), ["Jeong, M.-G.", "Morrison, J.R."]);
  assert.deepEqual(names("Tian-Li Yu; Ali A. Yassine"), ["Yu, Tian-Li", "Yassine, Ali A."]);
  assert.deepEqual(names("Hirtz et al."), ["Hirtz", "others"]);
  assert.deepEqual(names(""), []);
  const corp = parseAuthors("International Organization for Standardization");
  assert.deepEqual(corp, [{ last: "International Organization for Standardization", first: "", corporate: true }]);
  assert.equal(parseAuthors("World Steel Association")[0].corporate, true);
  assert.equal(parseAuthors("Plastics Europe")[0].corporate, true);
  assert.equal(parseAuthors("Ulrike von Luxburg")[0].corporate, undefined);
});

test("parseAuthors: the as-cited form of the file name (surnames only)", () => {
  assert.deepEqual(names("Baldwin & Clark", true), ["Baldwin", "Clark"]);
  assert.deepEqual(names("Stone Wood & Crawford", true), ["Stone", "Wood", "Crawford"]);
  assert.deepEqual(names("Traag Waltman & van Eck", true), ["Traag", "Waltman", "van Eck"]);
  assert.deepEqual(names("Talens Peiró et al.", true), ["Talens Peiró", "others"]);
  assert.deepEqual(names("Ulrich", true), ["Ulrich"]);
});

test("citekeyFor and assignCitekeys: stable, ASCII, disambiguated", () => {
  const paper = (no, authors, year, citekey = "", cite = authors) => ({ stem: `${no}`, no, authors, year, cite, citekey });
  assert.equal(citekeyFor(paper(1, "Talens Peiró et al.", "2017")), "talenspeiro2017");
  assert.equal(citekeyFor(paper(2, "Ulrike von Luxburg", "2007", "", "von Luxburg")), "vonluxburg2007");
  assert.equal(citekeyFor(paper(4, "Talens Peiró et al.", "2017", "", "Talens Peiro et al.")), "talenspeiro2017");   // the file name has no accent
  assert.equal(citekeyFor(paper(6, "World Steel Association", "2022", "", "World Steel Association")), "wsa2022");
  assert.equal(citekeyFor(paper(8, "Simpson, TW; Bobuk, A", "2012", "", "Simpson et al.")), "simpson2012");
  assert.ok(bibtexEntry(paper(6, "World Steel Association", "2022", "", "World Steel Association"), "k").includes("author = {{World Steel Association}}"));
  assert.equal(citekeyFor(paper(3, "Anon", "")), "anonnd");
  const keys = assignCitekeys([paper(5, "Ulrich", "1995"), paper(7, "Ulrich", "1995"), paper(2, "Ulrich", "1995", "ulrich1995"), paper(9, "Ulrich", "1995")]);
  assert.deepEqual([...keys], [["2", "ulrich1995"], ["5", "ulrich1995a"], ["7", "ulrich1995b"], ["9", "ulrich1995c"]]);
});

const paper = {
  stem: "005 - 1995 - Ulrich - The Role", no: 5, authors: "Karl T. Ulrich", year: "1995", title: "The role of DSM & product architecture in the firm",
  journal: "Research Policy", type: "journal-article", doi: "https://doi.org/10.1016/0048-7333(94)00775-3", tags: ["product-architecture"],
  abstract: "An abstract with 100% certainty.", pdf: "005.pdf", cite: "Ulrich", citekey: "", props: { url: "https://doi.org/10.1016/0048-7333(94)00775-3" },
};

test("bibtexEntry: type mapping, escaping, protected case, file link", () => {
  const e = bibtexEntry(paper, "ulrich1995", { pdf: "PDFs/005.pdf" });
  assert.ok(e.startsWith("@article{ulrich1995,\n"));
  assert.ok(e.includes("author   = {Ulrich, Karl T.}"));
  assert.ok(e.includes("title    = {The role of {DSM} \\& product architecture in the firm}"));
  assert.ok(e.includes("journal  = {Research Policy}"));
  assert.ok(e.includes("doi      = {10.1016/0048-7333(94)00775-3}"));
  assert.ok(e.includes("abstract = {An abstract with 100\\% certainty.}"));
  assert.ok(e.includes("file     = {:PDFs/005.pdf:PDF}"));
  assert.ok(e.includes("note     = {Library No. 005}"));
  const conf = bibtexEntry({ ...paper, type: "conference-paper", journal: "Proc. ICED" }, "k");
  assert.ok(conf.startsWith("@inproceedings{k,") && conf.includes("booktitle = {Proc. ICED}"));
  assert.ok(bibtexEntry({ ...paper, type: "thesis" }, "k").includes("school"));
  assert.ok(bibtexEntry({ ...paper, type: "weird" }, "k").startsWith("@misc{k,"));
});

test("libraryBibtex: sorted by number, header", () => {
  const b = libraryBibtex([{ ...paper, no: 9, stem: "b" }, { ...paper, no: 1, stem: "a" }], new Map([["a", "x"], ["b", "y"]]), { generated: "2026-10-12" });
  assert.ok(b.startsWith("% BibTeX export of the publication library (2 entries), generated 2026-10-12 by Library Studio."));
  assert.ok(b.indexOf("@article{x,") < b.indexOf("@article{y,"));
});

test("insertProp adds a scalar property after another one and keeps CRLF", () => {
  const note = "---\r\nindex: 5\r\ndoi: 10.1/x\r\ncategory:\r\n  - \"[[M]]\"\r\ntags: []\r\n---\r\nbody\r\n";
  assert.equal(insertProp(note, "citekey", "ulrich1995", "doi"), "---\r\nindex: 5\r\ndoi: 10.1/x\r\ncitekey: ulrich1995\r\ncategory:\r\n  - \"[[M]]\"\r\ntags: []\r\n---\r\nbody\r\n");
  assert.equal(insertProp(note, "citekey", "k", "category").split("\r\n")[5], "citekey: k");          // after the list items
  assert.equal(insertProp(note, "citekey", "k", "missing").split("\r\n")[6], "citekey: k");           // at the end
  const once = insertProp(note, "citekey", "k", "doi");
  assert.equal(insertProp(once, "citekey", "other", "doi"), once);                                     // kept when present
  assert.equal(insertProp("no front matter", "citekey", "k", "doi"), "no front matter");
});

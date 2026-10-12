// A small synthetic library: two topics (DSM clustering, product families) plus a repair paper that links both.
import { readPublication } from "../../../src/domain/publications.js";

const note = (index, year, cite, title, { cat, tags = [], abstract, doi = "", links = [] }) => {
  const stem = `${String(index).padStart(3, "0")} - ${year} - ${cite} - ${title}`;
  const text = [
    "---", "type: publication", "publication_type: journal-article", `index: ${index}`, `authors: ${cite}`, `year: ${year}`, `title: ${title}`, `journal: J${index % 3}`,
    "publication_class: A1", `doi: ${doi}`, `pdf: "[[${stem}.pdf]]"`, "status: read", "category:", ...cat.map(c => `  - "[[${c}]]"`),
    "tags:", ...tags.map(t => `  - ${t}`), "references: []", "cited_by: []", "---", "",
    `# ${title}`, "", "## Abstract", "", abstract, "", "## Why is this paper important?", "", `Because ${title.toLowerCase()} matters. ${links.map(l => `[[${l}]]`).join(" ")}`, "",
    "## Open gaps", "", "This recurring sentence is the same in every note of the template.", "",
  ].join("\n");
  return { stem, text };
};

const DSM = "04- Module Identification Methods", FAM = "03- Product Variety", LIFE = "02- Lifecycle";

export const NOTES = [
  note(1, 1981, "Steward", "The design structure system", { cat: [DSM], tags: ["dsm"], doi: "10.1/a", abstract: "The design structure matrix orders tasks; the matrix shows coupling between tasks and partitioning of the matrix gives clustering of coupled elements." }),
  note(2, 1994, "Pimmler & Eppinger", "Integration analysis of product decompositions", { cat: [DSM], tags: ["dsm", "clustering"], doi: "10.1/b", abstract: "A design structure matrix of interactions between elements; clustering the matrix identifies integrative elements and coupled chunks of the decomposition." }),
  note(3, 2001, "Browning", "Applying the design structure matrix", { cat: [DSM], tags: ["dsm"], doi: "10.1/c", abstract: "The design structure matrix supports decomposition and integration; clustering and partitioning of the matrix elements reveal coupled interactions." }),
  note(4, 1997, "Meyer & Lehnerd", "The power of product platforms", { cat: [FAM], tags: ["platform"], doi: "10.1/d", abstract: "A product platform shared by a product family lowers cost; the family of derivative variants reuses the platform and common components across the family." }),
  note(5, 2002, "Simpson", "Product platform design and customization", { cat: [FAM], tags: ["platform", "variety"], doi: "10.1/e", abstract: "Product family and platform design methods trade commonality against variety; the platform carries the family while variants add distinct components." }),
  note(6, 2005, "Jiao et al.", "Product family design and platform-based development", { cat: [FAM], tags: ["platform"], doi: "10.1/f", abstract: "A review of product family and platform-based development: commonality, variety and the platform architecture of the family and its variants." }),
  note(7, 2020, "Repair", "Repairable products through modular platforms and coupled matrices", { cat: [LIFE], tags: ["repair"], doi: "10.1/g", abstract: "Repair of products relies on a platform with family variants and on a design structure matrix of coupled elements; clustering helps repair and the family alike.", links: ["002 - 1994 - Pimmler & Eppinger - Integration analysis of product decompositions", "005 - 2002 - Simpson - Product platform design and customization"] }),
  note(8, 2019, "Lone", "A note without a concept map", { cat: [], tags: [], abstract: "Fretting corrosion in connector terminals: contact resistance rises with micro-motion of the terminals and the connector interface oxidises over cycles." }),
];

export const library = () => NOTES.map(n => readPublication(n.stem, n.text));

/** The same notes as files of a vault folder (for memoryFolder). */
export const files = (dir = "98 - Publications") => Object.fromEntries(NOTES.map(n => [`${dir}/${n.stem}.md`, n.text]));

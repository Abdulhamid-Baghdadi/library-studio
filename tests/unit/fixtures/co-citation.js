// A small citing set for the co-citation tests: two groups of cited works that are cited together, a weak bridge
// between them, and records that are editions of one work. OpenAlex's shapes, ids with the URL as OpenAlex gives them.
const OA = "https://openalex.org/";

let next = 0;
function citing(year, refs, { core = true, subfield = "Mechanical Engineering" } = {}) {
  return {
    id: `${OA}W9${String(++next).padStart(4, "0")}`, publication_year: year, display_name: `Citing paper ${next}`,
    primary_location: { source: { display_name: "Journal of Tests", is_core: core } },
    primary_topic: { subfield: { display_name: subfield } },
    referenced_works: refs.map(r => OA + r),
  };
}

/** 50 citing papers, 2000–2009: group A (W1–W4), group B (W5–W8), five that cite W1 and W5, and noise. */
export function citingWorks() {
  next = 0;
  const out = [];
  for (let i = 0; i < 20; i++) out.push(citing(2000 + (i % 10), ["W1", "W2", "W3", "W4"]));
  for (let i = 0; i < 20; i++) out.push(citing(2000 + (i % 10), ["W5", "W6", "W7", "W8"]));
  for (let i = 0; i < 5; i++) out.push(citing(2005 + i, ["W1", "W5", "W99"]));
  out.push(citing(2003, ["W1", "W2"], { core: false }));                       // not a core source
  out.push(citing(2003, ["W1", "W2"], { subfield: "Nursing" }));               // a subfield left out
  out.push(citing(2004, []));                                                  // no reference list
  out.push(citing(1985, ["W1", "W2"]));                                        // before the years
  out.push(citing(2006, ["W10", "W11"]));                                      // two editions of one book
  return out;
}

export const SETTINGS = {
  query: "modular AND product", from: 2000, to: 2009, types: ["article"], language: "en", fields: [22],
  coreOnly: true, subfields: ["Mechanical Engineering"],
  phases: [{ name: "Early", from: 2000, to: 2004 }, { name: "Late", from: 2005, to: 2009 }],
  overallThreshold: 10, phaseThreshold: 5, linkThreshold: 3, runs: 5, layoutStarts: 2, layoutIterations: 200,
};

const META = {
  W1: ["Modularity in design", 1995, ["Karl T. Ulrich"]],
  W2: ["Product architecture", 1996, ["Ron Sanchez", "Joseph T. Mahoney"]],
  W3: ["Design rules", 2000, ["Carliss Y. Baldwin", "Kim B. Clark"]],
  W4: ["Platform thinking in practice", 2001, ["A. One", "B. Two", "C. Three"]],
  W5: ["Product families and platforms", 1997, ["Marc H. Meyer"]],
  W6: ["Commonality decisions", 1998, ["Somebody Else"]],
  W7: ["Mass customization strategies", 1993, ["B. Joseph Pine"]],
  W8: ["Variety and inventory", 1999, []],
  W10: ["The power of product platforms", 1997, ["Marc H. Meyer", "Alvin P. Lehnerd"]],
  W11: ["The power of product platforms: building value and cost leadership", 1997, ["Marc H. Meyer", "Alvin P. Lehnerd"]],
};

/** OpenAlex works for these ids (W99 is a record OpenAlex no longer has: not returned). */
export const citedWorks = ids => ids.map(id => String(id).split("/").pop()).filter(id => META[id]).map(id => ({
  id: OA + id, display_name: META[id][0], publication_year: META[id][1], type: "article", doi: null,
  authorships: META[id][2].map(n => ({ author: { display_name: n } })), primary_location: { source: { display_name: "Journal of Tests" } },
}));

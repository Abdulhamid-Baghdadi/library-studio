/**
 * Enrichment as a use case: looks every publication note up in OpenAlex, fills what is empty, proposes what
 * is uncertain, and writes the three report files. A dry run changes nothing and returns the plan.
 *
 *   enrichLibrary(folder, library, http, { apply, mailto, clock, onProgress })
 *     → { papers, matched, fills: {authors, journal, year, url, abstract}, suggestions: {doi, category},
 *         disagreements, gaps, candidates, written, files, plans, incomplete }
 *
 * Budget: the DOI lookups cost about 1 OpenAlex credit per 50 papers, each title search 10 credits. When the
 * daily budget runs out during the title searches or the candidate lookups, the run keeps what it has and
 * says so in `incomplete`; without the DOI lookups nothing can be done and the error is raised.
 * @module services/enrich
 */
import { boilerplate, noteText, tfidf } from "../domain/cluster-text.js";
import { clusterNotes } from "../domain/cluster-analysis.js";
import { applyPlan, candidateList, candidatesMarkdown, categoryProposals, FILES, gapsMarkdown, planPaper, referencesJson, titleKey } from "../domain/enrich.js";
import { normalizeDoi, titleSearchUrl, WORK_FIELDS, worksByIdUrls, worksList } from "../domain/openalex.js";
import { fetchWorksByDoi, getJson, OpenAlexBudgetError } from "./openalex-works.js";

export async function enrichLibrary(folder, library, http, { apply = false, mailto = "", clock, onProgress = () => {} }) {
  const papers = library.papers;
  const today = clock.today();

  // 1. metadata and reference lists by DOI
  const dois = [...new Set(papers.map(p => normalizeDoi(p.doi)).filter(Boolean))];
  const works = await fetchWorksByDoi(http, dois, { mailto, fields: WORK_FIELDS, onProgress });

  // 2. papers without a match: one title search each
  const unmatched = papers.filter(p => !works.has(normalizeDoi(p.doi)));
  const titleMatches = new Map();
  let incomplete = "";
  const toSearch = unmatched.filter(p => p.title && !(p.suggestedDoi && !p.doi));
  try {
    for (const [i, p] of toSearch.entries()) {
      onProgress(`Looking up titles of papers without a DOI match (${i + 1} of ${toSearch.length})…`);
      const found = worksList(await getJson(http, titleSearchUrl(p.title, p.year.slice(0, 4), { mailto })))
        .find(w => titleKey(w.title) === titleKey(p.title) && (!p.year || !w.year || w.year === p.year.slice(0, 4)));
      if (found) titleMatches.set(p.stem, found);
    }
  } catch (e) {
    if (!(e instanceof OpenAlexBudgetError)) throw e;
    incomplete = `Title searches stopped early (${titleMatches.size} match(es) so far). ${e.message}`;
  }

  // 3. concept-map proposals by content
  onProgress("Comparing the notes without a concept map with the others…");
  const notes = clusterNotes(papers, library.dir);
  const boiler = boilerplate(notes);
  const X = tfidf(notes.map(n => noteText(n, boiler)));
  const proposals = categoryProposals(papers, X);

  // 4. candidates: papers cited by several library papers
  const candidates = candidateList(papers, works).slice(0, 300);
  const idUrls = worksByIdUrls(candidates.map(c => c.id), { mailto });
  try {
    for (const [i, url] of idUrls.entries()) {
      if (incomplete) break;                                   // budget already used up: keep the ids
      onProgress(`Looking up the candidate papers (${i + 1} of ${idUrls.length})…`);
      for (const w of worksList(await getJson(http, url))) {
        const c = candidates.find(x => x.id === w.id);
        if (c) Object.assign(c, { doi: w.doi, title: w.title, year: w.year, authors: w.authors });
      }
    }
  } catch (e) {
    if (!(e instanceof OpenAlexBudgetError)) throw e;
    incomplete = `Candidate titles incomplete. ${e.message}`;
  }

  // 5. the plan, and (apply) the writes
  const plans = papers.map(p => planPaper(p, works.get(normalizeDoi(p.doi)) ?? null, titleMatches.get(p.stem) ?? null, proposals.get(p.stem) ?? null));
  const sum = key => plans.filter(p => key in p.fills).length;
  const summary = {
    papers: papers.length, matched: plans.filter(p => p.source).length,
    fills: { authors: sum("authors"), journal: sum("journal"), year: sum("year"), url: sum("url"), abstract: plans.filter(p => p.abstract).length },
    suggestions: { doi: plans.filter(p => p.suggestions.suggested_doi).length, category: plans.filter(p => p.suggestions.suggested_category).length },
    disagreements: plans.reduce((a, p) => a + p.disagreements.length, 0), gaps: plans.filter(p => p.gaps.length).length,
    candidates: candidates.length, written: 0, files: [], plans, apply, incomplete,
  };
  if (!apply) return summary;
  for (const [i, p] of plans.entries()) {
    const path = `${library.dir}/${p.stem}.md`;
    const text = await folder.readText(path);
    const next = applyPlan(text, p, { today });
    if (next !== text) { await folder.writeText(path, next); summary.written++; }
    if (i % 25 === 24) onProgress(`Writing the notes (${i + 1} of ${plans.length})…`);
  }
  await folder.writeText(`${library.dir}/${FILES.gaps}`, gapsMarkdown(plans, { today }));
  await folder.writeText(`${library.dir}/${FILES.candidates}`, candidatesMarkdown(candidates, { today }));
  await folder.writeText(`${library.dir}/${FILES.references}`, JSON.stringify(referencesJson(papers, works, candidates, { today }), null, 1));
  summary.files = [FILES.gaps, FILES.candidates, FILES.references].map(f => `${library.dir}/${f}`);
  return summary;
}

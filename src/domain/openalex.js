/**
 * OpenAlex requests and answers.
 *
 *   worksByDoiUrls(dois, { mailto, batch = 50, fields })  request URLs for these DOIs (reference lists and metadata)
 *   worksByIdUrls(ids, { mailto, batch = 50 })             request URLs for OpenAlex work ids (W…)
 *   titleSearchUrl(title, year, { mailto })                one request: works whose title has these words, in that year
 *   worksFromResponse(json)                                Map normalised DOI → Work
 *   worksList(json)                                        Work[] in the order of the answer
 *   workDetails(w)                                         Work: { id, doi, title, year, type, authors, journal, url, abstract, referenced, volume, pages }
 *   abstractFromIndex(inverted)                            the abstract text from OpenAlex's inverted index
 * @module domain/openalex
 */
import { normalizeDoi } from "./citations.js";
import { compareCodePoints } from "./text-rules.js";

export const API = "https://api.openalex.org";
export const WORK_FIELDS = "id,doi,title,publication_year,type,authorships,primary_location,abstract_inverted_index,referenced_works,biblio";

const withMailto = (params, mailto) => { if (mailto) params.set("mailto", mailto); return params; };

export function worksByDoiUrls(dois, { mailto = "", batch = 50, fields = "id,doi,referenced_works" } = {}) {
  const urls = [];
  for (let i = 0; i < dois.length; i += batch) {
    const params = new URLSearchParams({ filter: "doi:" + dois.slice(i, i + batch).join("|"), "per-page": String(batch), select: fields });
    urls.push(`${API}/works?${withMailto(params, mailto)}`);
  }
  return urls;
}

export function worksByIdUrls(ids, { mailto = "", batch = 50, fields = WORK_FIELDS } = {}) {
  const urls = [];
  const short = ids.map(id => String(id).split("/").pop());
  for (let i = 0; i < short.length; i += batch) {
    const params = new URLSearchParams({ filter: "ids.openalex:" + short.slice(i, i + batch).join("|"), "per-page": String(batch), select: fields });
    urls.push(`${API}/works?${withMailto(params, mailto)}`);
  }
  return urls;
}

export function titleSearchUrl(title, year, { mailto = "" } = {}) {
  const words = String(title).replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  const filter = `title.search:${words}` + (/^\d{4}$/.test(String(year)) ? `,publication_year:${year}` : "");
  return `${API}/works?${withMailto(new URLSearchParams({ filter, "per-page": "5", select: WORK_FIELDS }), mailto)}`;
}

export function abstractFromIndex(inverted) {
  if (!inverted || !Object.keys(inverted).length) return "";
  const at = [];
  for (const [word, positions] of Object.entries(inverted)) for (const i of positions) at.push([i, word]);
  at.sort((a, b) => a[0] - b[0] || compareCodePoints(a[1], b[1]));
  return at.map(([, w]) => w).join(" ");
}

export function workDetails(w) {
  const source = w.primary_location?.source ?? {};
  const b = w.biblio ?? {};
  return {
    id: w.id, doi: normalizeDoi(w.doi), title: w.title || w.display_name || "", year: w.publication_year ? String(w.publication_year) : "",
    type: w.type || "", authors: (w.authorships ?? []).filter(a => a.author?.display_name).map(a => a.author.display_name).join("; "),
    journal: source.display_name || "", url: w.doi || w.primary_location?.landing_page_url || w.id || "",
    abstract: abstractFromIndex(w.abstract_inverted_index), referenced: w.referenced_works ?? [],
    volume: b.volume || "", pages: b.first_page ? (b.last_page ? `${b.first_page}–${b.last_page}` : b.first_page) : "",
  };
}

export const worksList = json => (json?.results ?? []).map(workDetails);

export function worksFromResponse(json) {
  const out = new Map();
  for (const w of worksList(json)) out.set(w.doi, w);
  return out;
}

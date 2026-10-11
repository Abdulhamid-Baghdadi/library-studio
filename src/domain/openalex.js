/**
 * OpenAlex requests for the citation properties.
 *
 *   worksByDoiUrls(dois, { mailto, batch = 50 })  the request URLs for the reference lists of these DOIs
 *   worksFromResponse(json)                      Map normalised DOI → { id, referenced }
 * @module domain/openalex
 */
import { normalizeDoi } from "./citations.js";

export const API = "https://api.openalex.org";

export function worksByDoiUrls(dois, { mailto = "", batch = 50 } = {}) {
  const urls = [];
  for (let i = 0; i < dois.length; i += batch) {
    const params = new URLSearchParams({ filter: "doi:" + dois.slice(i, i + batch).join("|"), "per-page": String(batch), select: "id,doi,referenced_works" });
    if (mailto) params.set("mailto", mailto);
    urls.push(`${API}/works?${params}`);
  }
  return urls;
}

export function worksFromResponse(json) {
  const out = new Map();
  for (const w of json?.results ?? []) out.set(normalizeDoi(w.doi), { id: w.id, referenced: w.referenced_works ?? [] });
  return out;
}

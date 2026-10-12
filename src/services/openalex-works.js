/**
 * Fetching OpenAlex works for a list of DOIs: batches of 50 through the `doi:` filter, except DOIs with
 * characters the filter syntax cannot carry (":", ",", "|"), which are looked up by title instead (callers do).
 *
 *   fetchWorksByDoi(http, dois, { mailto, fields, onProgress })  → Map normalised DOI → Work
 *   getJson(http, url)                                             a GET with OpenAlex's errors explained
 *   withApiKey(http, key)                                          an Http that adds `api_key` to every OpenAlex request
 *   OpenAlexBudgetError                                            thrown when the daily budget is used up
 *
 * OpenAlex gives every user a free daily budget (about 1000 credits: a filter request costs 1, a search 10).
 * When it is used up OpenAlex answers 429 with a Retry-After of many hours; that is reported at once instead
 * of waiting. A free API key from openalex.org raises the budget.
 * @module services/openalex-works
 */
import { worksByDoiUrls, worksFromResponse } from "../domain/openalex.js";

export class OpenAlexBudgetError extends Error {}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastCall = 0;

function budgetMessage(res) {
  const seconds = Number(res.header?.("Retry-After")) || Number(res.header?.("X-RateLimit-Reset")) || 0;
  const hours = seconds ? Math.max(1, Math.round(seconds / 3600)) : 0;
  return `OpenAlex's free daily budget is used up${hours ? ` (it resets in about ${hours} h)` : ""}. Try again later, or add a free OpenAlex API key in Settings (openalex.org) for a larger budget.`;
}

/** A GET with requests spaced out (≥ 150 ms), short retries on brief rate limits and server errors. */
export async function getJson(http, url) {
  for (let attempt = 0; ; attempt++) {
    const pause = 150 - (Date.now() - lastCall);
    if (pause > 0) await wait(pause);
    lastCall = Date.now();
    const res = await http.get(url, {});
    if (res.status === 404) return null;
    if (res.status >= 200 && res.status < 300) return res.json();
    const retryAfter = Number(res.header?.("Retry-After")) || 0;
    if (res.status === 429 && (retryAfter > 60 || res.header?.("X-RateLimit-Remaining") === "0")) throw new OpenAlexBudgetError(budgetMessage(res));
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt >= 4) {
      throw new Error(res.status === 429 ? "OpenAlex is rate-limiting requests; wait a minute and try again." : `OpenAlex answered ${res.status}.`);
    }
    await wait((retryAfter || 2 ** (attempt + 1)) * 1000);
  }
}

/** Adds the user's OpenAlex API key to every request to api.openalex.org (other hosts unchanged). */
export function withApiKey(http, key) {
  if (!key) return http;
  return { get: (url, headers) => http.get(url.startsWith("https://api.openalex.org/") ? `${url}${url.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(key)}` : url, headers) };
}

export async function fetchWorksByDoi(http, dois, { mailto = "", fields = "id,doi,referenced_works", onProgress = () => {} } = {}) {
  const works = new Map();
  const urls = worksByDoiUrls(dois.filter(d => !/[:,|]/.test(d)), { mailto, fields });
  for (const [i, url] of urls.entries()) {
    onProgress(`Asking OpenAlex (${i + 1} of ${urls.length})…`);
    for (const [doi, w] of worksFromResponse(await getJson(http, url) ?? {})) works.set(doi, w);
  }
  return works;
}

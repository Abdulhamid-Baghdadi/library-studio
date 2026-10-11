/**
 * Http adapter over the standard fetch API (browsers, Node 18+).
 * @module adapters/fetch-http
 */

/** @returns {import("../ports/http.js").Http} */
export function fetchHttp({ timeoutMs = 40_000 } = {}) {
  return {
    async get(url, headers = {}) {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      return { status: response.status, header: name => response.headers.get(name), json: () => response.json() };
    },
  };
}

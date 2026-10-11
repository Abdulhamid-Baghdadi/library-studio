/**
 * Port: HTTP GET for web APIs (OpenAlex). Injected so that tests can answer from recorded or fake data.
 * Implementation: adapters/fetch-http.js (works in browsers and Node 18+).
 * @module ports/http
 */

/**
 * @typedef {object} HttpResponse
 * @property {number} status
 * @property {(name: string) => string|null} header
 * @property {() => Promise<any>} json
 */

/**
 * @typedef {object} Http
 * @property {(url: string, headers?: Record<string, string>) => Promise<HttpResponse>} get
 */

export {};

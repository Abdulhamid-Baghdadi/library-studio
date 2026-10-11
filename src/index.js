/**
 * Public API of Library Studio's engine. The page, the command line and tests import from here only; the
 * folders below are internal and may be reorganised.
 * @module library-studio
 */

// domain: rules and formats
export * as frontmatter from "./domain/frontmatter.js";
export { LIBRARY_DIR, PDF_DIR, paperLabel, readPublication } from "./domain/publications.js";
export { analyze, clusterNotes, DEFAULTS as CLUSTER_DEFAULTS, normalizeSettings, STEPS as CLUSTER_STEPS } from "./domain/cluster-analysis.js";
export { AUTO_PREFIX, GENERATED_MARK, hubNames, hubNotes, REPORT_NAME, reportMarkdown, resultJson, updatePresets } from "./domain/cluster-notes.js";
export { citationGraph, normalizeDoi, withCitations } from "./domain/citations.js";
export { fixLinks, forbiddenLinks, publicationIndex } from "./domain/link-check.js";
export { CLASS_NAMES, EXPORT_DIR, GRAPH_PAGE, graphData, graphPage, WORKBOOK, workbook } from "./domain/export.js";
export { xlsx } from "./domain/xlsx.js";
export { normalizeNewlines } from "./domain/text-rules.js";

// services: use cases
export { isVault, openLibrary } from "./services/library.js";
export { PATHS as CLUSTER_PATHS, runClusterDiscovery } from "./services/cluster-discovery.js";
export { updateCitations } from "./services/citations.js";
export { checkLinks } from "./services/link-check.js";
export { exportLibrary } from "./services/export.js";

// adapters
export { memoryFolder } from "./adapters/memory-folder.js";
export { fetchHttp } from "./adapters/fetch-http.js";

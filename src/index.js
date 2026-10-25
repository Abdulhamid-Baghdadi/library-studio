/**
 * Public API of Library Studio's engine. The page, the command line and tests import from here only; the
 * folders below are internal and may be reorganised.
 * @module library-studio
 */

// domain: rules and formats
export * as frontmatter from "./domain/frontmatter.js";
export { citedByOf, LIBRARY_DIR, libraryRoot, PDF_DIR, paperLabel, readPublication } from "./domain/publications.js";
export { analyze, clusterNotes, DEFAULTS as CLUSTER_DEFAULTS, normalizeSettings, STEPS as CLUSTER_STEPS } from "./domain/cluster-analysis.js";
export { AUTO_PREFIX, GENERATED_MARK, hubNames, hubNotes, REPORT_NAME, reportMarkdown, resultJson, updatePresets } from "./domain/cluster-notes.js";
export { normalizeDoi } from "./domain/openalex.js";
export { fixLinks, forbiddenLinks, publicationIndex } from "./domain/link-check.js";
export { CLASS_NAMES, EXPORT_DIR, GRAPH_PAGE, graphData, graphPage, WORKBOOK, workbook } from "./domain/export.js";
export { xlsx } from "./domain/xlsx.js";
export { assignCitekeys, bibtexEntry, citekeyFor, libraryBibtex, parseAuthors } from "./domain/bibtex.js";
export { applyPlan, categoryProposals, FILES as ENRICH_FILES, gapsMarkdown, planPaper } from "./domain/enrich.js";
export { normalizeNewlines } from "./domain/text-rules.js";
export { DEFAULTS as CO_CITATION_DEFAULTS, MERTENS_2023, normalizeSettings as normalizeCoCitationSettings, parseCorrections, scopesOf } from "./domain/co-citation.js";
export { STEPS as CO_CITATION_STEPS } from "./domain/co-citation-analysis.js";
export { OTHER as PERSPECTIVE_OTHER, perspectiveName, perspectiveOrder } from "./domain/co-citation-notes.js";
export { FIELDS as OPENALEX_FIELDS, citingFilter, searchProblem } from "./domain/openalex.js";

// services: use cases
export { isVault, openLibrary } from "./services/library.js";
export { PATHS as CLUSTER_PATHS, runClusterDiscovery } from "./services/cluster-discovery.js";
export { checkLinks } from "./services/link-check.js";
export { BIBTEX, citekeysMissing, exportLibrary } from "./services/export.js";
export { enrichLibrary } from "./services/enrich.js";
export { OpenAlexBudgetError, withApiKey } from "./services/openalex-works.js";
export { DATA_DIR as CO_CITATION_DIR, downloadCitingSet, listAnalyses, outputsFor, readAnalysis, runCoCitation, saveAnalysisSettings, subfieldsOf } from "./services/co-citation.js";

// adapters
export { memoryFolder } from "./adapters/memory-folder.js";
export { fetchHttp } from "./adapters/fetch-http.js";

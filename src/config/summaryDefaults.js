/**
 * Defaults for chunked-summary configuration.
 * Single source of truth: used by config.js (env defaults), HistorySummarizer
 * (constructor defaults) and tests (so they don't drift from the real default).
 */
const SUMMARY_CHUNK_SIZE = 4;
const SUMMARY_CHUNK_OVERLAP = 1;

module.exports = { SUMMARY_CHUNK_SIZE, SUMMARY_CHUNK_OVERLAP };

/**
 * Process start timestamp — module-load time of the scheduler package.
 * Bun bundles to a single bin entry, so load time ≈ server start time.
 * Used for stale-process detection (schema-fail hints) and graph_init reporting.
 */
export const SERVER_STARTED_AT = Date.now();

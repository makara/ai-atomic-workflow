/**
 * Per-run in-memory cache — loaded graph definition.
 *
 * Constraints are NOT cached in-process: they snapshot into the run record
 * at graph_start (graph_runs.constraints — DB, durable across server
 * restarts). Entries are created at graphStart (crud.ts) / lazy graph load
 * (graph-loader.ts) and MUST be dropped when a run is deleted
 * (cleanCompleted/cleanAll) or force-ended (graphForceEnd) — otherwise a
 * long-lived MCP server accumulates one entry per run forever.
 *
 * @module
 */

import type { Taskflow } from '../graph-definition.js';

/** Per-run graph definition cache — avoids repeated disk reads within a run. */
export const graphLoadCache = new Map<string, Taskflow>();

/** Drop caches for one run — terminal transitions and run deletion. */
export function dropRunCaches(runId: string): void {
  graphLoadCache.delete(runId);
}

/** Drop all run caches — clean-all deletes every run, caches must follow. */
export function clearRunCaches(): void {
  graphLoadCache.clear();
}

/**
 * Per-run in-memory caches — constraints snapshot + loaded graph definition.
 *
 * Central lifecycle home for both Maps. Entries are created at graphStart
 * (crud.ts) / lazy graph load (graph-loader.ts) and MUST be dropped when a
 * run is deleted (cleanCompleted/cleanAll) or force-ended (graphForceEnd) —
 * otherwise a long-lived MCP server accumulates one entry per run forever.
 *
 * @module
 */

import type { Taskflow } from '../graph-definition.js';

/** Per-run project constraints snapshot — stable for run lifetime. */
export const runConstraints = new Map<string, readonly string[]>();

/** Per-run graph definition cache — avoids repeated disk reads within a run. */
export const graphLoadCache = new Map<string, Taskflow>();

/** Drop caches for one run — terminal transitions and run deletion. */
export function dropRunCaches(runId: string): void {
  runConstraints.delete(runId);
  graphLoadCache.delete(runId);
}

/** Drop all run caches — clean-all deletes every run, caches must follow. */
export function clearRunCaches(): void {
  runConstraints.clear();
  graphLoadCache.clear();
}

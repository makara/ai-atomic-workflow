/**
 * Per-run in-memory cache — loaded graph definition.
 *
 * Constraints are NOT cached and NOT snapshotted: they load once per
 * activation via the pilot (compiled-artifact protocol — round-level freeze,
 * agent-side). Entries are created at graphStart (crud.ts) / lazy
 * graph load (graph-loader.ts) and MUST be dropped when a run is deleted
 * (cleanCompleted/cleanAll) or force-ended (graphForceEnd) — otherwise a
 * long-lived MCP server accumulates one entry per run forever.
 *
 * @module
 */

import type { Taskflow } from '../graph-definition.js';
import { dropSnapshotCursor, snapshotCursorCacheClear } from './snapshot.js';

/** Per-run graph definition cache — avoids repeated disk reads within a run. */
export const graphLoadCache = new Map<string, Taskflow>();

/** Drop caches for one run — terminal transitions and run deletion. */
export function dropRunCaches(runId: string): void {
  graphLoadCache.delete(runId);
  dropSnapshotCursor(runId);
}

/** Drop all run caches — clean-all deletes every run, caches must follow. */
export function clearRunCaches(): void {
  graphLoadCache.clear();
  snapshotCursorCacheClear();
}

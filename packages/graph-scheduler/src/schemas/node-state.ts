import { z } from 'zod/v4';

/**
 * Zod schema for per-node execution state snapshot.
 *
 * Tracks only topology state: status, retry count, timestamps.
 * Output and error are NOT persisted — they live in agent session or on-disk files.
 * See docs/reports/atom-phase-handler-task-dispatch-analysis.md §11.0.
 */
export const NodeStateSchema = z.object({
  /** parent run identifier */
  runId: z.string(),
  /** node execution status */
  status: z.enum(['pending', 'active', 'done', 'blocked', 'skipped']),
  /** retry counter — incremented on agent-retry */
  retryCount: z.number(),
  /** execution start time (ISO 8601) */
  startedAt: z.string().optional(),
  /** execution end time (ISO 8601) */
  completedAt: z.string().optional(),
  /** execution duration in milliseconds */
  durationMs: z.number().optional(),
});

/** Inferred TypeScript type for a per-node execution state snapshot. */
export type NodeState = z.infer<typeof NodeStateSchema>;

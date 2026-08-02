import { z } from 'zod/v4';

/**
 * Zod schema for per-node execution state snapshot.
 *
 * Tracks only topology state: status, retry count, timestamps.
 * Output and error are NOT persisted — they live in agent session or on-disk files.
 *
 * Status enum matches runtime FSM production points (fsm/transition.ts):
 * pending (START), active (activate), done/skipped (COMPLETE, join dead-branch,
 * force-end). No failed/blocked node status exists — failures are session-local.
 */
export const NodeStateSchema = z.object({
  /** parent run identifier */
  runId: z.string(),
  /** node execution status — runtime FSM produced values only */
  status: z.enum(['pending', 'active', 'done', 'skipped']),
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

import { z } from 'zod/v4';

/**
 * Zod schema for per-node execution state snapshot.
 *
 * Tracks only topology state: status, retry count, timestamps.
 * Output and error are NOT persisted — they live in agent session or on-disk files.
/**
 * Status enum matches the v2 status vocabulary (compile.ts NodeStatus):
 * pending (START), active (activate), done (COMPLETE).
 * No failed/blocked node status exists — failures are session-local.
 * No skip state exists — a pending node either activates or stays pending.
 * No aborted value exists — force-end termination writes no per-node status.
 */
export const NodeStateSchema = z.object({
  /** parent run identifier */
  runId: z.string(),
  /** node execution status — runtime FSM produced values only */
  status: z.enum(['pending', 'active', 'done']),
  /** retry counter — incremented on agent-retry; non-negative integer (rework resets never zero it) */
  retryCount: z.number().int().nonnegative(),
  /** execution start time (ISO 8601); null clears a prior value (jump reset) */
  startedAt: z.string().nullable().optional(),
  /** execution end time (ISO 8601); null clears a prior value (jump reset) */
  completedAt: z.string().nullable().optional(),
});

/** Inferred TypeScript type for a per-node execution state snapshot. */
export type NodeState = z.infer<typeof NodeStateSchema>;

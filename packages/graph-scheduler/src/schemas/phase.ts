import { z } from 'zod/v4';

/**
 * Zod schema for a single phase/node definition within a taskflow graph.
 *
 * Core fields match types.ts Phase + graph-definition.ts TaskflowPhase.
 * Extra fields (eval, when, onBlock) are silently stripped by default z.object().
 */
export const PhaseSchema = z.object({
  /** phase identifier — unique within a graph */
  id: z.string(),
  /** phase type — any string. Validation deferred to PhaseHandlerRegistry. */
  type: z.string(),
  /** upstream phase ids this phase depends on */
  dependsOn: z.array(z.string()).readonly().optional(),
  /** agent name — valid for agent/approval types */
  agent: z.string().optional(),
  /** per-node skill override — Layer 3 of agentRegistry three-layer system */
  skill: z.string().optional(),
  /** file glob array — handler resolves globs and injects content into sub-agent prompt (agent type only) */
  context: z.array(z.string()).optional(),
  /** task instruction text */
  task: z.string().optional(),
  /** retry policy — max retry attempts */
  retry: z
    .object({
      max: z.number(),
      backoffMs: z.number().optional(),
      factor: z.number().optional(),
    })
    .optional(),
  /** approval routing config — only meaningful for approval type phases */
  routing: z
    .object({
      actions: z.array(
        z.object({
          action: z.enum(['continue', 'retry', 'jump']),
          target: z.string().optional(),
          label: z.string(),
          description: z.string(),
        }),
      ),
      context: z.array(z.string()).optional(),
    })
    .optional(),
});

/** Inferred TypeScript type for a single phase definition. */
export type Phase = z.infer<typeof PhaseSchema>;

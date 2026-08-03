import { z } from 'zod/v4';

/**
 * Zod schema for a single phase/node definition within a taskflow graph.
 *
 * Core fields match types.ts Phase + graph-definition.ts TaskflowPhase.
 * join and when added for conditional branching.
 * Removed fields: topic (approval title = task), retry (write-only),
 * with (flow params, zero consumers), def (inline sub-graph, zero consumers),
 * maxDepth (constant 5), legacy context/routing.context (no backward compat).
 */
export const PhaseSchema = z
  .object({
    /** phase identifier — unique within a graph */
    id: z.string(),
    /** phase type — closed enum: main/approval/gate dispatch types + flow composition type */
    type: z.enum(['main', 'approval', 'gate', 'flow']),
    /** upstream phase ids this phase depends on */
    dependsOn: z.array(z.string()).readonly().optional(),
    /** agent hints — priority-ordered sub-agent type preferences (main type, advisory) */
    agent: z.array(z.string()).optional(),
    /** per-node execution skill — the skill that runs this phase's work */
    skill: z.string().optional(),
    /** main-type channel patterns — skill names, file globs, or node:<id> refs. Resolved against the execution skill's Context Requirements contract. */
    channels: z.array(z.string()).optional(),
    /** approval-type decision-card pre-call text — displayed before question(), never channel-resolved. */
    preText: z.string().optional(),
    /** task instruction text (main) / decision-card topic (approval) */
    task: z.string().optional(),
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
        /** Removed field — loud rejection, never silent strip. */
        context: z.unknown().optional(),
      })
      .superRefine((data, ctx) => {
        if (data.context !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['context'],
            message: `'routing.context' is removed — decision-card text declares via 'preText'; delete this field`,
          });
        }
      })
      .optional(),
    /** join mode — dependency resolution strategy. 'all' = every dep must complete; 'any' = one dep sufficient. */
    join: z.enum(['all', 'any']).optional().default('all'),
    /** when guard — natural-language skip condition, LLM-evaluated before execution. */
    when: z.string().optional(),
    /** eval conditions — auto-decision rules for gate phases. Agent evaluates; match → auto retry/jump decision. */
    eval: z
      .array(
        z.object({
          when: z.string().min(1),
          action: z.enum(['retry', 'jump']),
          target: z.string().optional(),
          note: z.string().optional(),
        }),
      )
      .readonly()
      .optional(),
    /** flow phase type — referenced graph name. */
    use: z.string().optional(),
    /**
     * Removed fields (no backward compat) — declared so legacy graphs fail
     * loudly with a rename hint instead of silent strip. Never consumed.
     */
    topic: z.unknown().optional(),
    retry: z.unknown().optional(),
    with: z.unknown().optional(),
    def: z.unknown().optional(),
    maxDepth: z.unknown().optional(),
    context: z.unknown().optional(),
  })
  .refine(
    (data) => {
      if (data.type !== 'flow') return true;
      return typeof data.use === 'string' && data.use.length > 0;
    },
    { message: 'flow type requires use' },
  )
  .superRefine((data, ctx) => {
    // Field semantics split by phase type — one field, one meaning.
    if (data.type === 'main' && data.preText !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['preText'],
        message: `main phase must not declare 'preText' — 'preText' is approval-type decision-card text; main phases declare context needs via 'channels'`,
      });
    }
    if (data.type === 'approval' && data.channels !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['channels'],
        message: `approval phase must not declare 'channels' — approval phases consume upstream via dependsOn and declare decision-card text via 'preText'`,
      });
    }
    if (data.type === 'approval' && data.agent !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['agent'],
        message: `approval phase must not declare 'agent' — agent hints are a main-type priority hint array for sub-agent dispatch`,
      });
    }
    if (data.type === 'approval' && data.eval !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['eval'],
        message: `approval phase must not declare 'eval' — machine auto-decisions live on gate phases; approval is the pure human decision card (dual-authority residue is rejected)`,
      });
    }
    if (data.type === 'gate' && data.eval === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['eval'],
        message: `gate phase requires 'eval' — machine judgment without a condition set would be a silent pass-through`,
      });
    }
    if (data.type === 'gate') {
      for (const key of ['task', 'preText', 'routing', 'channels', 'agent', 'skill', 'use'] as const) {
        if (data[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `gate phase must not declare '${key}' — gate is a machine-judgment node with a closed field surface (id/type/dependsOn/eval/when/join)`,
          });
        }
      }
    }
    if (data.type !== 'gate' && data.type !== 'approval' && data.eval !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['eval'],
        message: `'eval' is gate-type auto-decision rules — main/flow phases must not declare it (silent drop otherwise)`,
      });
    }
    // Removed fields — loud rejection, never silent strip (no backward compat).
    for (const key of ['topic', 'retry', 'with', 'def', 'maxDepth', 'context'] as const) {
      if (data[key] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `'${key}' is removed — see graph schema spec; delete this field`,
        });
      }
    }
  });

/** Inferred TypeScript type for a single phase definition. */
export type Phase = z.infer<typeof PhaseSchema>;

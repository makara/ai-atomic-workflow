import { z } from 'zod/v4';
import { PhaseSchema } from './phase.js';

/**
 * Zod schema for a complete .taskflow.yaml graph definition.
 *
 * Top-level structure:
 * - name (optional): graph name for display and reference
 * - phases: array of phase/node definitions
 *
 * .passthrough() allows future extension fields without breaking validation.
 */
export const TaskflowSchema = z
  .object({
    /** graph name — display and reference identifier */
    name: z.string().optional(),
    /**
     * Purpose-focused free text describing what the graph does/produces.
     * Identity metadata for display (surfaced in graph_start + pilot banner) —
     * no enum, no behavior branching.
     */
    description: z.string().optional(),
    /**
     * Graph-level ambient context — the global channel. Merged once at load
     * with the config default layer (config first, dedup) and injected into
     * every flattened phase. Entries follow graph-level rules: explicit
     * `skill:`/`node:` prefix or file-glob shape; bare names are load-time
     * errors (no execution-skill contract exists at this scope). `node:`
     * entries promote the named node's output stream into the global channel
     * (the owning node skips its own promoted stream).
     */
    context: z.array(z.string()).optional(),
    /**
     * Removed field — renamed to `context` (two-scope context model). Declared
     * so legacy graphs fail loudly with a rename hint instead of silent
     * strip. Never consumed.
     */
    channels: z.unknown().optional(),
    /** phase/node definitions — at least one required */
    phases: z.array(PhaseSchema),
  })
  .superRefine((data, ctx) => {
    if (data.channels !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['channels'],
        message: `top-level 'channels' is renamed to 'context' (two-scope context model) — rename the key in this graph definition`,
      });
    }
    if ((data as Record<string, unknown>).version !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['version'],
        message: `'version' is removed (schema has no versions — dead field); delete it from this graph definition`,
      });
    }
  })
  .passthrough();

/** Inferred TypeScript type for a complete taskflow graph definition. */
export type Taskflow = z.infer<typeof TaskflowSchema>;

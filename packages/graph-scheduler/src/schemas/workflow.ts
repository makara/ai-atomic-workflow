import { toJSONSchema, z } from 'zod/v4';
import { PhaseSchema } from './phase.js';

/**
 * Semver format regex — major.minor.patch with optional pre-release/build
 * suffixes. The graph format version is a semver string.
 */
export const WORKFLOW_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Zod schema for a complete workflow YAML graph definition.
 *
 * Top-level structure:
 * - name (required): graph identity — the schema is the identity gate
 * - description (optional): purpose-focused display metadata
 * - $schema (optional): URI reference to the derived JSON Schema document
 * - version (optional): semver format version — major mismatch is a
 *   load-time loud rejection (never silent degradation)
 * - context (optional): graph-level ambient channel entries
 * - phases: array of phase/node definitions
 *
 * .passthrough() allows future extension fields without breaking validation.
 */
export const WorkflowSchema = z
  .object({
    /** graph name — identity field, required (schema-determined identity). Non-empty: a document without a valid name does not load. */
    name: z
      .string()
      .min(1, { message: "'name' is required and must be non-empty — the declared name is the graph identity" }),
    /**
     * Purpose-focused free text describing what the graph does/produces.
     * Identity metadata for display (surfaced in graph_start + pilot banner) —
     * no enum, no behavior branching.
     */
    description: z.string().optional(),
    /**
     * URI reference to the derived JSON Schema document (workflow.schema.json).
     * Optional — absent documents validate against the default WorkflowSchema
     * (backward compatible). Empty or whitespace-only values are rejected.
     */
    $schema: z
      .string()
      .min(1)
      .refine((v) => v.trim().length > 0, { message: `'$schema' must be a non-empty URI reference` })
      .optional(),
    /**
     * Format version — semver syntax. The engine rejects documents whose
     * major version it does not support (loud rejection at load).
     */
    version: z
      .string()
      .regex(WORKFLOW_VERSION_PATTERN, {
        message: `'version' must be a semver string (e.g. '1.0.0') — got a non-semver value`,
      })
      .optional(),
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
    /**
     * Graph inventory — the node overview table (dedicated schema key; the
     * term "atom" does not name the key). Each entry describes one atom
     * (graph node) as `{ id, type, goal, constraints? }`: `id` must exist
     * in `phases` and `type` must match the referenced phase declaration —
     * mismatches are load-time warnings (never blocking, never silent). No
     * `skill` field — the phase-level `skill` field is the single source;
     * the execution mechanism lives in the goal (skill-bound main nodes
     * name it in verb form; flow entries state "expands <use> subgraph").
     * A legacy `skill` key is ignored (stripped at parse). `goal` is a
     * bounded compound sentence stating the atom's intent (what the atom
     * accomplishes) per the format reference (structural keywords
     * AND/THEN/IF-ELSE/OR ALL-CAPS, prose and/or lowercase; ordinary nodes
     * ≤ 5 steps; gates ≤ 3 AND/OR operands — retryCount bound not counted;
     * conditional paths ≤ 3). `constraints` (optional) is an array of
     * one-sentence prose rules — general boundaries plus explicit non-goals
     * ("what the atom does NOT do / which approaches are NOT adopted");
     * ≤ 5 entries per atom (convention bound, user-calibratable), prose
     * only (no structural keywords, no new word-list members); content is
     * never machine-validated (zero validation axis — discipline lives at
     * generation time and review). The former `description` key is NOT
     * accepted (no backward compatibility — stale entries fail validation).
     * Ownership: AI MAY generate the inventory when absent; once present,
     * user-only maintenance; any graph maintenance follows the inventory.
     */
    inventory: z
      .array(
        z.object({
          /** phase id the entry describes — must exist in `phases` */
          id: z.string(),
          /** phase type — must match the referenced phase's declared type */
          type: z.enum(['main', 'approval', 'gate', 'flow']),
          /** bounded compound intent statement — what the atom accomplishes, incl. its execution mechanism when one exists */
          goal: z.string(),
          /** optional one-sentence prose rules — boundaries and explicit non-goals (≤ 5 per atom, convention; never machine-validated) */
          constraints: z.array(z.string()).optional(),
          /** former field name — NOT accepted (no backward compatibility): any provided value fails loudly; the legacy `skill` key keeps stripping */
          description: z.never().optional(),
        }),
      )
      .optional(),
    /**
     * Graph-level constraints — graph content behavior rules, the same
     * self-containment family as `inventory` (both travel with the graph
     * file). Optional array of one-sentence prose rules — general
     * boundaries plus explicit non-goals ("does not X" / "avoids Y");
     * ≤ 10 entries per graph (convention bound, user-calibratable —
     * localized from the OMP constraint guidance like the entry-level ≤5
     * bound), prose only (no structural keywords, no new word-list
     * members); content is never machine-validated (zero validation axis
     * — discipline lives at generation time and review). Injected into
     * every dispatched node as `[graph]`-prefixed entries (scheduler
     * dispatch fact — unbypassable), merged with project-level rules
     * (`[project]` prefix, pilot-loaded activation session copy) by the
     * dispatch handler. Project-level `.graph-scheduler/constraints.md`
     * pipeline is separate and retained.
     */
    constraints: z.array(z.string()).optional(),
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
  })
  .passthrough();

/** Inferred TypeScript type for a complete workflow graph definition. */
export type Workflow = z.infer<typeof WorkflowSchema>;

/**
 * Derive the JSON Schema document (draft 2020-12) for the workflow format.
 *
 * The zod definition is the single source of truth; this derived artifact is
 * the external tooling entry point (editors/CI/cross-language validation) —
 * never hand-maintained, never dual-written. Published at
 * `schemas/workflow.schema.json`; the snapshot test guards against drift.
 */
export function workflowJsonSchema(): ReturnType<typeof toJSONSchema<typeof WorkflowSchema>> {
  // zod v4 toJSONSchema accepts no `name` param — the derived document's
  // identity is its file path (schemas/workflow.schema.json), not a $id.
  return toJSONSchema(WorkflowSchema);
}

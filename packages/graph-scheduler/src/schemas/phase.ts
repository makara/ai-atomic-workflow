import { z } from 'zod/v4';

/**
 * Zod schema for a single phase/node definition within a taskflow graph.
 *
 * Core fields match types.ts Phase + graph-definition.ts TaskflowPhase.
 * join added for dependency resolution.
 *
 * Route-first redesign: judgment is decision confirmation (approval),
 * rework is a backward jump (gate), ending is an action or natural drain —
 * no end node type, no forward gate routing, no parallel branches.
 * Schema field convergence: preText/reads removed (approval card text lives
 * in task; judgment context = direct dependsOn + channels node:).
 * Removed fields (no backward compat) — declared so legacy graphs fail loudly
 * with a rename hint instead of silent strip: branches/default/mode/when/
 * eval/preText/reads/constraints/runMode all keep loud rejection below.
 * Older removed fields (topic/retry/with/def/maxDepth/context) are not
 * declared — zod strips them silently.
 */
export const PhaseSchema = z
  .object({
    /** phase identifier — unique within a graph */
    id: z.string(),
    /** phase type — closed enum: main/approval/gate dispatch types + flow composition */
    type: z.enum(['main', 'approval', 'gate', 'flow']),
    /** upstream phase ids this phase depends on */
    dependsOn: z.array(z.string()).readonly().optional(),
    /** route membership — optional; flows propagate their id to children; absent = implicit default route (always active) */
    route: z.string().optional(),
    /** agent hints — priority-ordered sub-agent type preferences (main type, advisory) */
    agent: z.array(z.string()).optional(),
    /** per-node execution skill — the skill that runs this phase's work */
    skill: z.string().optional(),
    /** main-type channel patterns — skill names, file globs, or node:<id> refs. Resolved against the execution skill's Context Requirements contract. */
    channels: z.array(z.string()).optional(),
    /** task instruction text (main) / decision-card prompt (approval — first line = header, rest = card body) */
    task: z.string().optional(),
    /** approval routing config — optional; only branch-route scenarios declare actions (default = Accept + free input + AI options) */
    routing: z
      .object({
        actions: z.array(
          z.object({
            /** routing semantics — continue: proceed; end: complete the run; retry/jump: re-execute target */
            action: z.enum(['continue', 'retry', 'jump', 'end']),
            /** branch-route option target (continue) or re-run target (retry/jump) — node or route id */
            target: z.string().optional(),
            /** stable machine identifier — decision output carries it; AI recommendations reference it */
            value: z.string().optional(),
            label: z.string(),
            description: z.string(),
          }),
        ),
      })
      .optional(),
    /** join mode — presence means any: 'any' = one dep sufficient; absent = all deps must complete (topology default). Explicit 'all' is rejected (redundant default). */
    join: z.literal('any').optional(),
    /** gate rework jumps — agent evaluates when against judgment context (direct dependsOn outputs + node: channels + snapshot + run mode); hit → backward jump to target (target + downstream reset, upstream kept) */
    jumps: z
      .array(
        z.object({
          /** natural-language condition — agent evaluates against judgment context + snapshot + run mode */
          when: z.string().min(1),
          /** backward jump target — MUST be an upstream terminal node (validator-enforced) */
          to: z.string(),
        }),
      )
      .readonly()
      .optional(),
    /** flow phase type — referenced graph name. */
    use: z.string().optional(),
    /**
     * Removed fields (route-first redesign) — gate branch routing is gone:
     * forward routing is an approval decision (branch-route options),
     * rework is a backward jump (gate jumps). Declared so legacy graphs fail
     * loudly instead of silent strip.
     */
    branches: z.unknown().optional(),
    default: z.unknown().optional(),
    mode: z.unknown().optional(),
    /**
     * Removed fields (branch-routing redesign) — when-guard and gate eval are
     * replaced by gate jumps; declared so legacy graphs fail loudly.
     */
    when: z.unknown().optional(),
    eval: z.unknown().optional(),
    /**
     * Removed fields (schema field convergence) — approval card static text
     * merges into 'task' (first line = header); judgment context = direct
     * dependsOn outputs (auto-injected) + 'channels' node: entries. Declared
     * so legacy graphs fail loudly with a migration hint.
     */
    preText: z.unknown().optional(),
    reads: z.unknown().optional(),
    /**
     * Removed fields (route-first redesign + project constraints channel) —
     * project constraints inject via .graph-scheduler/constraints.md; run mode
     * is a run attribute set at graph_start. Declared so legacy graphs fail
     * loudly instead of silent strip.
     */
    constraints: z.unknown().optional(),
    runMode: z.unknown().optional(),
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
    // Gate/approval channels — judgment context, node:-only entries (no
    // skill contract to resolve skills/globs against; judgment reads outputs).
    if ((data.type === 'gate' || data.type === 'approval') && data.channels !== undefined) {
      for (const entry of data.channels) {
        if (!entry.startsWith('node:')) {
          ctx.addIssue({
            code: 'custom',
            path: ['channels'],
            message: `'${data.type}' phase channels entries must be 'node:<id>' references (judgment context = node outputs); '${entry}' is not a node: entry`,
          });
        }
      }
    }
    if (data.type === 'approval' && data.agent !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['agent'],
        message: `approval phase must not declare 'agent' — agent hints are a main-type priority hint array for sub-agent dispatch`,
      });
    }
    if (data.type === 'approval' && data.jumps !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['jumps'],
        message: `approval phase must not declare 'jumps' — rework jumps are gate-type; approval is the decision card (Accept + free input + AI options)`,
      });
    }
    // Skill names — plain names only, never URI-form (platform decoupling
    // convention). Resolution: <name> → <skillsDir>/<name>/SKILL.md.
    if (typeof data.skill === 'string' && data.skill.includes('://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['skill'],
        message: `'skill' must be a plain skill name, not a URI — '${data.skill}' contains a URI scheme; skill references resolve by name per the skill-resolution convention`,
      });
    }
    if (data.type === 'gate' && (data.jumps === undefined || data.jumps.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['jumps'],
        message: `gate phase requires 'jumps' — a gate without rework jumps would be a silent pass-through; delete the gate or declare when/to pairs`,
      });
    }
    if (data.type === 'gate') {
      for (const key of ['task', 'routing', 'agent', 'skill', 'use'] as const) {
        if (data[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `gate phase must not declare '${key}' — gate is a backward-jump node with a closed field surface (id/type/dependsOn/route/jumps/channels/join)`,
          });
        }
      }
    }
    if (data.type !== 'gate' && data.jumps !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['jumps'],
        message: `'jumps' is gate-type rework routing — main/approval/flow phases must not declare it`,
      });
    }
    // Removed fields — loud rejection with migration hint (no backward compat).
    if (data.branches !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['branches'],
        message: `'branches' is removed (route-first redesign) — forward branch routing is an approval branch-route decision; rework is a gate 'jumps' backward jump; delete this field`,
      });
    }
    if (data.default !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['default'],
        message: `'default' is removed (route-first redesign) — gates no longer route forward; delete this field`,
      });
    }
    if (data.mode !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['mode'],
        message: `'mode' is removed (route-first redesign) — no parallel branches exist; delete this field`,
      });
    }
    if (data.when !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['when'],
        message: `'when' is removed (route-first redesign) — gate rework conditions express via 'jumps' (when/to pairs); approval recommendations are agent-judged; delete this field`,
      });
    }
    if (data.eval !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['eval'],
        message: `'eval' is removed (route-first redesign) — gate auto-decisions express via 'jumps'; delete this field`,
      });
    }
    if (data.preText !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['preText'],
        message: `'preText' is removed (schema field convergence) — approval card static text merges into 'task' (first line = header, rest = card body); delete this field`,
      });
    }
    if (data.reads !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['reads'],
        message: `'reads' is removed (schema field convergence) — judgment context = direct dependsOn outputs (auto-injected) + 'channels' node: entries; use channels: [node:<id>] for cross-level references; delete this field`,
      });
    }
    if (data.constraints !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['constraints'],
        message: `'constraints' is removed (route-first redesign) — project constraints inject from .graph-scheduler/constraints.md; delete this field`,
      });
    }
    if (data.runMode !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['runMode'],
        message: `'runMode' is removed (route-first redesign) — run mode is a run attribute set at graph_start; delete this field`,
      });
    }
  });

/** Inferred TypeScript type for a single phase definition. */
export type Phase = z.infer<typeof PhaseSchema>;

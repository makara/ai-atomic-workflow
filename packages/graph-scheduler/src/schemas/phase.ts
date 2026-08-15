import { z } from 'zod/v4';

import { HLT_OPERATION_CLASSES } from '../hlt-classes.js';

/**
 * Zod schema for a single phase/node definition within a workflow graph.
 *
 * Core fields match types.ts Phase + graph-definition.ts WorkflowPhase.
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
    /** operation classes — closed-set members of the High-Level Tool Registry (atom-kernel §High-Level Tool Registry); phase declaration overrides/complements the skill's Operation classes default (main type; declarative only — scheduler passes through, handler injects + verifies) */
    operations: z.array(z.string()).optional(),
    /** per-node execution skill — the skill that runs this phase's work */
    skill: z.string().optional(),
    /** per-phase context additions — all entry kinds (skill:<name>, file globs, node:<id> read edges), uniform across main/approval/gate. Resolved against the execution skill's Context Requirements contract when one exists; node: entries read the named node's output stream. */
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
    // Phase channels — uniform across main/approval/gate (two-scope context
    // model): all entry kinds (skill:/glob/node:) legal for every type.
    // Flow phases declare none — ambient context lives at graph level
    // (`context:`), reads on the consuming phase.
    if (data.type === 'flow' && data.channels !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['channels'],
        message: `flow phase must not declare 'channels' (two-scope context model) — move ambient entries to the graph's top-level 'context:' and cross-level data reads to the consuming phase's 'channels: [node:<id>]'`,
      });
    }
    if (data.type !== 'main' && data.agent !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['agent'],
        message: `'agent' is main-type only — agent hints are a priority hint array for sub-agent dispatch; ${data.type} phases must not declare it (flow phases flatten at load — the field would be silently stripped)`,
      });
    }
    // HLT operations — closed-set members only, main type only: phase
    // declaration overrides/complements the skill's Operation classes
    // default; the scheduler passes through, handler injects + verifies.
    // Mandatory on main phases (phase-aware enforcement needs the
    // allowed-set): undeclared -> loud load error; use [] for
    // conversation-only phases (implicit always-allow: conversation +
    // graph lifecycle + convention reads + compress).
    if (data.type === 'main' && data.operations === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['operations'],
        message: `main phase must declare 'operations' — operation classes declare the phase's High-Level Tool Registry classes (closed set: ${HLT_OPERATION_CLASSES.join(', ')}); use [] for conversation-only phases`,
      });
    }
    if (data.operations !== undefined) {
      if (data.type !== 'main') {
        ctx.addIssue({
          code: 'custom',
          path: ['operations'],
          message: `'operations' is main-type only — operation classes declare the phase's High-Level Tool Registry classes (closed set: ${HLT_OPERATION_CLASSES.join(', ')})`,
        });
      }
      for (const op of data.operations) {
        if (!(HLT_OPERATION_CLASSES as readonly string[]).includes(op)) {
          ctx.addIssue({
            code: 'custom',
            path: ['operations'],
            message: `'${op}' is not a registered High-Level Tool operation class — closed set: ${HLT_OPERATION_CLASSES.join(', ')}`,
          });
        }
      }
    }
    if (data.type === 'approval' && data.jumps !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['jumps'],
        message: `approval phase must not declare 'jumps' — rework jumps are gate-type; approval is the decision card (Accept + free input + AI options)`,
      });
    }
    // Skill names — plain names only, never URI-form (platform decoupling
    // convention). Resolution: <name> → <skillsDir>/<name>/SKILL.md (agent-side).
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
        message: `'constraints' is removed at phase level (activation redesign) — graph-level rules go to the top-level 'constraints' field (graph content, injected per dispatch); project discipline loads at activation from .graph-scheduler/constraints.md (pilot, compiled-artifact protocol); delete this field`,
      });
    }
    if (data.runMode !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['runMode'],
        message: `'runMode' is removed (activation redesign) — run mode is passed to graph_start as args.mode (manual | auto); delete this field`,
      });
    }
    // '$' prefix is reserved — the activation prologue was removed (activation
    // facts live at graph_start / pilot startup); any '$' id is rejected.
    if (data.id.startsWith('$')) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `'${data.id}' — '$' prefix is reserved (activation prologue removed); rename this phase`,
      });
    }
  });

/** Inferred TypeScript type for a single phase definition. */
export type Phase = z.infer<typeof PhaseSchema>;

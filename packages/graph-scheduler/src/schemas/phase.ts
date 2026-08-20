import { z } from 'zod/v4';

/**
 * Zod schema for a single phase/node definition within a workflow graph (v2).
 *
 * Syntax v2 = LangGraph StateGraph transliteration: the phase type
 * set is {main} only — the flow type is deleted; subgraph composition
 * (`use`, compile-time assembly) is DELETED — nested execution is the
 * `template: router` sibling run, launched by the frontend. Route
 * membership (`route`), branch routing (`routing.actions`), and join
 * modes (`join`) are deleted, and `branchTo` is removed — branch
 * semantics = subgraph selection (`template: router`); loop/rework
 * semantics = flow self-edges (top-level `flow` field — transition
 * table interpretation, graph-flow capability); the `loop` template is
 * removed; AND convergence is the only join mode.
 *
 * Unknown keys — strict rejection (no backward compatibility): ANY key
 * outside the declared surface (removed fields like route/routing/join/
 * mode/runMode/jumps/reads/constraints, or legacy fields like topic/retry/
 * with/def/maxDepth/context) fails validation with a uniform error naming
 * the key. No per-field migration hints, no silent stripping.
 */
export const PhaseSchema = z
  .object({
    /** phase identifier — unique within a graph */
    id: z.string(),
    /** phase type — closed enum: main (inline execution + decision) */
    type: z.enum(['main']),
    /** upstream phase ids this phase depends on */
    dependsOn: z.array(z.string()).readonly().optional(),
    /** agent hints — priority-ordered sub-agent type preferences (advisory) */
    agent: z.array(z.string()).optional(),
    /** operation classes — declared execution classes (declarative only — scheduler passes through, Tool usage check verifies evidence-only) */
    operations: z.array(z.string()).optional(),
    /** per-node execution skill — the skill that runs this phase's work */
    skill: z.string().optional(),
    /** per-phase context additions — all entry kinds (skill:<name>, file globs, node:<id> read edges), uniform across phases. Resolved against the execution skill's Context Requirements contract when one exists; node: entries read the named node's output stream. */
    channels: z.array(z.string()).optional(),
    /** task instruction text — decision/confirmation text included when the phase carries inline interview semantics */
    task: z.string().optional(),
    /** builtin task-template reference — closed enum (`startup` | `router`
     *  | `scope-entry` | `adopting`).
     *  The node's task text is injected from the template registry at load
     *  time (same mechanism as the handoff template family). Template types:
     *  `startup` nodes are graph entries (mutually exclusive with `task` and
     *  required to declare empty `dependsOn` — the startup template loads
     *  the constraints session copy every downstream node's context is
     *  assembled from, so it must run first); `router` nodes select among
     *  candidate graphs (paths) and MAY sit mid-graph (`dependsOn` allowed
     *  — the router needs upstream context to decide); the per-node
     *  templates (`scope-entry` / `adopting`) carry the
     *  framework-graph shared-chain task texts (arch-review-loop /
     *  first-principles-dev dedup — one template one file;
     *  `scope-entry` consumes the `terminal` data parameter; `adopting`
     *  declares the nothing-to-adopt direct end and absorbs the
     *  adoption-goal topics into its grilling first-round frontier). The
     *  `review-accept` / `adopt-accept` templates are deleted
     *  (accept-node consolidation — the adopting grilling consensus IS
     *  the adoption confirmation; the requirement confirmation moves into
     *  the requirement router node as a caller-declared accept loop via
     *  the `questions` data parameter); the `adopt-scope` template is
     *  deleted (adopt-scope-and-handler-blocks — the adoption goal is
     *  already confirmed by scope-entry + the requirement accept loop +
     *  the adopting grilling; the second atom-scope-interview node is
     *  pure redundancy). The `framework-chain` factory template is
     *  deleted — the `node` discriminator shape does not exist. The
     *  `loop` template is removed — loop/rework semantics are flow
     *  self-edges (top-level `flow` field), interpreted by the transition
     *  table, never a task template (graph-flow capability). Subgraph
     *  composition (`use`) is deleted; nesting is the frontend-launched
     *  router sibling run. */
    template: z.enum(['startup', 'router', 'scope-entry', 'adopting']).optional(),
    /** template parameters — machine-declared arguments applied to the
     *  template task text at load time. `paths` = the router template's
     *  candidate graphs (subgraphs) the router may start — the ONLY path
     *  form (paths are graphs; non-graph path forms are rejected);
     *  `terminal` = the scope-entry template's per-graph terminal name
     *  (round-report | fp-doc-update — interpolated data, never a
     *  variant-selection discriminator); `questions` = the
     *  router template's caller-declared extra judgment entries
     *  `[{ prompt, condition }]` — the node has additional judgment and
     *  corresponding flow edges; prompt content and condition vocabulary
     *  come from the calling graph, never template semantics (accept-node
     *  consolidation). Required with `template: router`
     *  (`paths`) / `template: scope-entry` (`terminal`); rejected without
     *  the matching template. The loop template_args shape (`graph` +
     *  `until`) and the framework-chain `node` discriminator do not
     *  exist. */
    template_args: z
      .object({
        paths: z.array(z.string()).min(1).optional(),
        terminal: z.string().optional(),
        questions: z
          .array(
            z
              .object({
                prompt: z.string(),
                condition: z.string(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Template — builtin task-template reference: mutually exclusive with
    // `task` (the template is the single source of the node's work — the
    // `use` composition field no longer exists). Entry constraint applies
    // to the `startup` template only — `router` template nodes sit
    // mid-graph (they need upstream context to select among candidate
    // graphs).
    if (data.template !== undefined && data.task !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['template'],
        message: `template phase must not declare 'task' — '${data.id}' declares both 'template' and 'task'; the template injects the task text at load time`,
      });
    }
    if (data.template === 'startup' && data.dependsOn !== undefined && data.dependsOn.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['dependsOn'],
        message: `startup template phase must be a graph entry — '${data.id}' declares 'template: startup' with non-empty 'dependsOn'; template nodes run before any other node's context assembly`,
      });
    }
    // Template args — machine-declared parameters consumed by the router
    // template (`paths` — candidate graphs, required with `template:
    // router`) or the scope-entry template (`terminal` — the per-graph
    // terminal name, required with `template: scope-entry`); rejected
    // without the matching template. The framework-chain `node`
    // discriminator does not exist (one template one file); the
    // loop template_args shape does not exist (loops are flow self-edges).
    if (data.template === 'router' && (data.template_args === undefined || data.template_args.paths === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['template_args'],
        message: `router template phase must declare 'template_args.paths' — '${data.id}' declares 'template: router' without candidate graphs`,
      });
    }
    if (
      data.template === 'scope-entry' &&
      (data.template_args === undefined || data.template_args.terminal === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['template_args'],
        message: `scope-entry template phase must declare 'template_args.terminal' — '${data.id}' declares 'template: scope-entry' without the per-graph terminal name`,
      });
    }
    if (data.template !== 'router' && data.template !== 'scope-entry' && data.template_args !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['template_args'],
        message: `'template_args' requires 'template: router' or 'template: scope-entry' — '${data.id}' declares template_args without a parameterized template`,
      });
    }
    if (data.template === 'router' && data.template_args !== undefined && data.template_args.terminal !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['template_args'],
        message: `router template phase must not declare 'template_args.terminal' — '${data.id}' mixes router args with scope-entry args`,
      });
    }
    if (data.template === 'scope-entry' && data.template_args !== undefined && data.template_args.paths !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['template_args'],
        message: `scope-entry template phase must not declare 'template_args.paths' — '${data.id}' mixes scope-entry args with router args`,
      });
    }
    if (data.template !== 'router' && data.template_args !== undefined && data.template_args.questions !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['template_args'],
        message: `'template_args.questions' requires 'template: router' — '${data.id}' declares questions on a non-router template (caller-declared extra judgment is router-only, accept-node consolidation)`,
      });
    }
    // Operations — declared operation classes; the scheduler passes through,
    // Tool usage check verifies evidence-only. Mandatory on plain main phases
    // (use [] for conversation-only); template nodes (task injected from the
    // template registry) are exempt — they carry no authored execution of
    // their own.
    if (data.template === undefined && data.operations === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['operations'],
        message: `main phase must declare 'operations' — declared operation classes (evidence-only Tool usage check); use [] for conversation-only phases`,
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

/**
 * Known phase-level field set — the strict schema surface. Single source for
 * unknown-key detection (tolerant file audit in graph-maintain / maintenance
 * health check); derived from the schema itself, never hand-maintained.
 */
export const PHASE_FIELD_KEYS: readonly string[] = Object.keys(PhaseSchema.shape);

/** Inferred TypeScript type for a single phase definition. */
export type Phase = z.infer<typeof PhaseSchema>;

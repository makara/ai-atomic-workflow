/**
 * Activation prologue — graph-external built-in node synthesis.
 *
 * The activation prefix (P) is a graph-level abstract-node concept: every run
 * begins with built-in prologue nodes that re-run on round restarts (a
 * backward reset to an entry node). Run mode and project constraints — both
 * user-layer facts — live here as agent-executed nodes instead of backend
 * run-record fields ("your agent still does everything").
 *
 * Reserved `$` ids — authors override a built-in by declaring the same id in
 * YAML (their own task/skill replaces the default protocol); any other `$` id
 * is rejected by PhaseSchema. P is NOT part of the author DAG: it never
 * appears in topology, contract checks, or jump-closure math — the FSM gates
 * author activation behind it and resets it on entry-target resets.
 *
 * Pure module — zero I/O, zero Effect.
 *
 * @module
 */

import type { Phase } from './schemas/index.js';

/** Reserved id — run-mode confirmation node (mode decided per activation). */
export const PROLOGUE_CONFIRM_ID = '$run-mode-confirm';

/** Reserved id — project constraints loading node (compiled-artifact cache, existence = validity). */
export const PROLOGUE_LOAD_ID = '$load-constraints';

/** All legal reserved ids — PhaseSchema rejects any other `$` id. */
export const PROLOGUE_IDS: Readonly<Record<string, true>> = { [PROLOGUE_CONFIRM_ID]: true, [PROLOGUE_LOAD_ID]: true };

/**
 * Default `$run-mode-confirm` task — the built-in mode protocol.
 *
 * The `{args.mode}` placeholder is interpolated at dispatch (resolveArgs);
 * an UNMATCHED key stays literal — the executing agent treats the literal
 * placeholder as "caller passed no mode". Every activation (run start and
 * round restart) re-confirms — no echo, no run-local memory (stateless
 * dispatches).
 */
export const DEFAULT_CONFIRM_TASK = `Run mode confirmation (built-in activation prologue node).

Caller mode argument: {args.mode} — the literal placeholder '{args.mode}' means the caller passed no mode; any other value IS the run's mode for this activation.

Protocol:
1. If the caller mode argument is set (placeholder resolved) — emit it.
2. Otherwise present the approval() card — no mode block exists yet, so approval() takes its manual branch (Manual (recommended, default) vs Auto). Absence NEVER auto.
Every activation re-confirms — never echo a previous activation's value.

Report the mode in the session (JSON, platform-persisted): {"mode": "manual"|"auto"}`;

/**
 * Default `$load-constraints` task — the built-in constraints protocol.
 *
 * Compiled-artifact protocol: the rule set is compiled once (caveman
 * full-level organization) and cached at `.graph-scheduler/constraints.json`
 * — file EXISTENCE is the validity signal; deleting the file resets
 * compilation. `compiled_at` is audit-only, never an invalidation key.
 * Missing source + missing artifact → empty array (constraints optional).
 * Output format unchanged — consumers read `{"constraints": [...]}`.
 */
export const DEFAULT_LOAD_TASK = `Load project constraints (built-in activation prologue node).

Compiled-artifact protocol — the compiled rule set is cached at
.graph-scheduler/constraints.json (project root, CWD-relative); the file's
existence is the cache validity signal (deleting it forces recompilation).

1. If .graph-scheduler/constraints.json exists — parse it. Invalid JSON →
   treat as missing (step 2). Valid → emit its "constraints" array verbatim.
   Done — zero markdown reads, zero recompilation.
2. Otherwise compile: read .graph-scheduler/constraints.md (project root,
   CWD-relative). Locate the exact heading line '## Rules' (case-sensitive).
   Collect every line after it, stopping at the next markdown heading (any
   line starting with #). Skip HTML comment lines (starting with <!--).
   One rule per line: trim whitespace, strip the leading bullet marker
   ('- ', '* ', '+ ') if present, drop empty lines.
3. Caveman-compile the rules (full level): condense, dedupe, fix wording,
   order them; keep technical substance verbatim (commands, paths,
   parameters, references).
4. Write .graph-scheduler/constraints.json — JSON object:
   {"constraints": ["<rule 1>", ...], "compiled_at": "<ISO8601 now>"}.
   compiled_at is audit metadata only — never used for validity.
5. Emit the compiled array. Both files missing → empty array.

Report the constraints in the session (JSON, platform-persisted): {"constraints": ["<rule 1>", ...]}`;

/**
 * Synthesize the activation prologue phase set for a flattened graph.
 *
 * Rules:
 * - `$run-mode-confirm` is synthesized only when the flattened graph contains
 *   an approval node (mode exists only where it is consumed); author
 *   declarations replace built-ins (declared node wins, not duplicated).
 * - `$load-constraints` is always synthesized (constraints are consumed by
 *   every node type).
 * - Author-declared reserved ids are used as-is — they run as the prologue
 *   prefix via FSM gating (their own task/skill replaces the default
 *   protocol; schema enforces they are entry phases).
 *
 * @param phases flattened author phases (reserved-id declarations included)
 * @returns prologue phases in activation order (load first, confirm second)
 */
export function synthesizePrologue(phases: readonly Phase[]): readonly Phase[] {
  const declared = new Map(phases.filter((p) => p.id.startsWith('$')).map((p) => [p.id, p]));
  const prologue: Phase[] = [];

  // Constraints load first — consumed by every node type AND the confirm
  // dispatch itself (its decision card carries the ## Constraints block:
  // mode is decided with the project norms visible). Always synthesized.
  prologue.push(
    declared.get(PROLOGUE_LOAD_ID) ?? {
      id: PROLOGUE_LOAD_ID,
      type: 'main',
      dependsOn: [],
      task: DEFAULT_LOAD_TASK,
    },
  );

  // Mode exists only where consumed — an approval-less graph gets no mode
  // question (spec §Activation Prologue; gates judge from context, never mode).
  const hasApproval = phases.some((p) => p.type === 'approval');
  if (hasApproval) {
    prologue.push(
      declared.get(PROLOGUE_CONFIRM_ID) ?? {
        id: PROLOGUE_CONFIRM_ID,
        type: 'main',
        dependsOn: [],
        task: DEFAULT_CONFIRM_TASK,
      },
    );
  }

  return prologue;
}

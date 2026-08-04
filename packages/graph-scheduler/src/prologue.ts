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

/** Reserved id — project constraints loading node (per-activation reload = round-level freeze). */
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
2. Otherwise question() the user — Manual (recommended, default) vs Auto. Absence NEVER auto.
Every activation re-confirms — never echo a previous activation's value.

Output JSON to the output file: {"mode": "manual"|"auto"}`;

/**
 * Default `$load-constraints` task — the built-in constraints protocol.
 *
 * Deterministic copy protocol: read the file, copy the ## Rules section
 * verbatim (one rule per bullet line, markers stripped) — no rewriting, no
 * interpretation. Missing/empty section → empty array (constraints optional).
 * Per-activation reload — the round's dispatches consume this round's
 * snapshot (round-level freeze).
 */
export const DEFAULT_LOAD_TASK = `Load project constraints (built-in activation prologue node).

Read .graph-scheduler/constraints.md (project root, CWD-relative).

Copy protocol (deterministic — no rewriting, no interpretation):
1. Locate the exact heading line '## Rules' (case-sensitive).
2. Copy every line after it, stopping at the next markdown heading (any line starting with #).
3. Skip HTML comment lines (starting with <!--).
4. One rule per line: trim whitespace, strip the leading bullet marker ('- ', '* ', '+ ') if present, keep the rest verbatim. Drop empty lines.
5. File missing or no ## Rules section → empty array.

Output JSON to the output file: {"constraints": ["<rule 1>", ...]}`;

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
 * @returns prologue phases in activation order (confirm first, load second)
 */
export function synthesizePrologue(phases: readonly Phase[]): readonly Phase[] {
  const declared = new Map(phases.filter((p) => p.id.startsWith('$')).map((p) => [p.id, p]));
  const prologue: Phase[] = [];

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

  prologue.push(
    declared.get(PROLOGUE_LOAD_ID) ?? {
      id: PROLOGUE_LOAD_ID,
      type: 'main',
      dependsOn: [],
      task: DEFAULT_LOAD_TASK,
    },
  );

  return prologue;
}

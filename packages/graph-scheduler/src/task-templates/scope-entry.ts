import type { TemplateArgs } from './index.js';

/**
 * Scope-entry node task template — the framework-graph entry interview
 * (arch-review-loop / first-principles-dev shared chain, single source).
 * One template per file. The per-graph terminal divergence
 * (round-report vs fp-doc-update) arrives via the `terminal` data
 * parameter — interpolated data, never a variant-selection discriminator.
 */
export interface ScopeEntryArgs {
  /** the graph's terminal node id (round-report | fp-doc-update) — referenced by the round-input clause */
  terminal?: string;
}

/** Scope-entry template function — the entry scope-interview task text. */
export const scopeEntryTaskTemplate = (args?: ScopeEntryArgs & TemplateArgs): string => {
  const terminal = args?.terminal ?? 'round-report';
  return `Execute scope interview per atom-scope-interview.

Topics: scope (domain/feature/problem + focus dimensions), report
input (fresh | existing — report_path carries the confirmed path),
requirement input (fresh idea | diff on existing documents —
requirement_input carries the reference/statement).

Behavior: confirm=mandatory; output path=user_owned (recommend a dated
report file under the repo reports directory);
direct end: end the round.

Round input: the prior round's scope + report path + requirement
input arrive via the flow self-edge re-entry (the prior ${terminal} node output / session) or the activation args (first round) — never
re-detected, never re-interviewed beyond the confirmed round scope.

Scope proposal: a report exists (report_input: existing, or the
previous round's report output (requirement/present-candidates) shows
round >= 1) AND the user gives no explicit new scope → MUST propose
scope = verify the implementation results against the report
(evidence-backed) and surface new problems; never re-propose the prior
round's scope verbatim.

Open Recommendations carry-over: read the report tail's Open
Recommendations block (fresh report → empty block). Pending entries
(un-adopted Top Recommendations from prior rounds) MUST be folded
into the new round's verification scope — each pending entry is
verified evidence-backed this round; never silently dropped.

Output contract: scope, focus, output, report_input
(fresh|existing), report_path, requirement_input, scope_complete,
direct_end (true | false).`;
};

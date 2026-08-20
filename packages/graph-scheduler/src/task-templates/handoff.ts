/**
 * Handoff task template — the synthesized result-report node's task text.
 * Compiled-in template family (never authored per graph): the node reads its
 * graph members' outputs (node: channels — same-run session content),
 * assembles the unified two-element result report, and returns it to the
 * session. Self-decide — zero user questions (no Interview/confirm token;
 * interaction: none compatible).
 *
 * SINGLE SOURCE of the result-report contract wording (`tasks_done` /
 * `outputs` + typed-pointer contract) — skills (atom-kernel, atom-pilot)
 * reference this module, never re-encode the wording (debt Card 15/23).
 * Composition is deleted (graph-subgraph-route-unify): exactly ONE root
 * `__handoff` is synthesized per graph — no per-level `<composing>/__handoff`
 * exists.
 *
 * Session contract (graph-langgraph-subgraph-align): zero parameters — no
 * report path, no file write, no deterministic-path mechanism. Results live
 * in the session (R9 content/accounting separation — the scheduler persists
 * progress only). The optional args argument is accepted for call-site
 * uniformity and ignored (the handoff stays zero-parameter).
 */
import type { TemplateArgs } from './index.js';

export const handoffTaskTemplate = (
  _args?: TemplateArgs,
): string => `Execute the handoff result-report step for this graph boundary.

Assemble the unified two-element result report from the executed member
outputs (read via the node: channels — same-run session content; never
scheduler state, never a file read):
- tasks_done: prose summary of what this graph/subgraph run accomplished
  (one line per executed member, derived from the member outputs)
- outputs: typed pointer(s) to the run's durable outputs — file path
  (cross-run primary carrier) | agent://<id> (same-session sub-agent
  output) | artifact://<id> (overflow tool output) | history://<id>
  (transcript reference). Never inline the pointed-to content.

Return the two elements to the session (the node report) — no report file is written, no path is derived; content
stays in the session (content/accounting separation holds, the scheduler
persists progress only).

Result shape, fixed order:
- tasks_done: <prose summary>
- outputs: <typed pointer | file path>

Decision records are NOT part of the report (single-source rule — they
live in the session and adoption records).

Output contract: tasks_done, outputs, summary.
`;

import type { TemplateArgs } from './index.js';

/**
 * Router task template — the parameterized path-selection node's task text.
 * Compiled-in template family (never authored per graph): a graph declares
 * `template: router` + `template_args.paths` (candidate graphs) and the
 * compiler injects this task text with the paths applied at load time.
 *
 * Router semantics (graph-router-template, extended by
 * graph-subgraph-route-unify): the paths ARE the graphs — the router is the
 * SOLE nested-execution declaration (subgraph composition via `use` is
 * deleted). The node's work is agent-side selection + launch: evaluate the
 * candidate graphs' metadata (graph_assets — description/run_conditions)
 * and the node context, select automatically (single candidate or satisfied
 * hard criterion) or present a recommendation card, start the chosen graph
 * as a sibling run (graph_start — passing the launch args required by the
 * chosen graph from the node's context), drive it to completion, and report
 * the result. No `branchTo` — the path activation is the sibling run itself.
 * Self-decide — zero generic confirmation tokens (the selection card is the
 * only card surface, and only when the criterion is ambiguous).
 */
export const routerTaskTemplate = (args?: TemplateArgs): string => {
  const paths = args?.paths ?? [];
  const questions = args?.questions ?? [];
  const candidates = paths.length > 0 ? paths.join(', ') : '<none — graph authoring error>';
  const questionsClause =
    questions.length > 0
      ? `
Extra judgment (caller-declared — the node has additional judgment and
corresponding flow edges; content comes from the calling graph, never
template semantics):
After collecting the sibling-run result, present each caller-declared
prompt to the user:
${questions.map((q) => `- ${q.prompt} → report condition '${q.condition}'`).join('\n')}
The user's choice SHALL be reported as the declared flow condition
value on advance (transition-table routed — the edge vocabulary lives
in the calling graph's flow block; a revise-style choice re-enters via
the flow self-edge, bounded by the graph constraints prose + retryCount).
`
      : '';
  return `Execute the router step for this graph run — select and start one of the candidate subgraphs (paths = graphs, the only path form).

Candidate paths: ${candidates}

Selection — decide the path; ask only when truly ambiguous:
1. Exactly one candidate -> select it automatically (zero questions).
2. A hard criterion stated in your context (e.g. an echoed adoption
   judgment like adr_created) is satisfied against the candidate graphs'
   metadata or the node context -> select the matching graph
   automatically (zero questions).
3. Otherwise -> present an approval card listing the candidate graphs
   with your recommended graph marked (options come from this node's
   machine-declared paths — never parse task text for options).

Launch — after selection:
1. Query graph_assets for the candidate graphs' metadata (description +
   run_conditions) on demand — the selection input, never the full graph
   definitions.
2. Start the chosen graph as a sibling run: graph_start { graphName:
   <chosen graph>, args: <the launch args required by the chosen graph —
   e.g. a report path, change name, or adoption echo surfaced by this
   node's channels / session context; pass them verbatim> }.
3. Drive the sibling run to completion (graph_advance until node: null),
   then collect its result (the run's handoff result report).
4. Report the router node: chosen_graph, run_id, result_summary, outputs
   (typed pointer — file path | agent:// | artifact:// | history://),
   selection_mode (auto | candidate_card).${questionsClause}
No composing phases, no branchTo — the path activation is the sibling
run itself. Never start more than one candidate. If no candidate can
run (unresolvable graph / launch failure) -> report blocked with the
reason and the candidates; never fabricate a completion.

Output contract: chosen_graph, run_id, result_summary, outputs,
selection_mode, blocked?, candidates.
`;
};

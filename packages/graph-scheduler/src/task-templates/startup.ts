import type { TemplateArgs } from './index.js';

/**
 * Startup task template — the opt-in heavy graph-startup node's task text.
 * Compiled-in template family (never authored per graph): a graph declares
 * `template: startup` on its entry phase and the compiler injects this task
 * text at load time (same injection point as the handoff template).
 *
 * The template runs the heavy startup steps once, in order, before any other
 * node's context is assembled: (1) load the project constraints compiled
 * artifact into the session — every downstream node's `## Constraints` block
 * is assembled from this session copy by the handler (no per-node file
 * reads); (2) run serena activation; (3) run jcodemunch indexing. Self-decide
 * — zero user questions (no Interview/confirm token; interaction-compatible).
 * Zero-parameter contract: the optional args argument is accepted for call-
 * site uniformity and ignored (the startup text carries no graph-specific
 * parameters).
 */
export const startupTaskTemplate = (_args?: TemplateArgs): string => `Execute the startup step for this graph run.

Run the heavy startup steps once, in order, before any domain node executes:
1. Load the project constraints compiled artifact (.graph-scheduler/constraints.json)
   into the session — every downstream node's ## Constraints block is
   assembled from this session copy by the handler (no per-node file reads,
   no constraints node in the run).
2. Run serena activate_project (LSP code navigation ready) for the project
   root.
3. Run jcodemunch index_folder (code index ready) for the project root.

The graph declared this template node explicitly — full startup is required
for this graph's work. Do not skip or defer any step; report each step's
result. No user questions.

Output contract: constraints_loaded (true | false), serena_activated
(true | false), jcodemunch_indexed (true | false).
`;

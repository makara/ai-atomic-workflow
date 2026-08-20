/**
 * Task template registry — the builtin task-template directory surface
 * (graph-task-templates-externalize). One module per template; the index
 * re-exports the template functions and enumerates them in `TASK_TEMPLATES`
 * (the registration list — adding a future builtin template = a new module
 * + this list entry, zero compiler edits).
 *
 * Templates are compile-time content assets (imported statically by the
 * compiler — never load-time discovery assets, never user-overridable;
 * the graphs/ registry machinery does not apply).
 *
 * One template one file: every template module exports exactly
 * one template function; the factory pattern is banned (no single-file
 * multi-template switch, no variant-selection discriminators). Data
 * parameters (`paths` / `terminal`) interpolate into a single template
 * text — never a dispatch.
 */
import { adoptingTaskTemplate } from './adopting.js';
import { CHANGE_NAME_RESOLUTION_RULE, GRILLING_ENCAPSULATION_CONTRACT } from './contracts.js';
import { handoffTaskTemplate } from './handoff.js';
import { routerTaskTemplate } from './router.js';
import { scopeEntryTaskTemplate, type ScopeEntryArgs } from './scope-entry.js';
import { startupTaskTemplate } from './startup.js';

export {
  adoptingTaskTemplate,
  CHANGE_NAME_RESOLUTION_RULE,
  GRILLING_ENCAPSULATION_CONTRACT,
  handoffTaskTemplate,
  routerTaskTemplate,
  scopeEntryTaskTemplate,
  startupTaskTemplate,
};

/** Template parameters — machine-declared `template_args` applied to the
 *  template task text at load time (compile.ts call site). `paths` = the
 *  router template's candidate graphs (the ONLY path form — paths are
 *  graphs/subgraphs); `terminal` = the scope-entry template's per-graph
 *  terminal node name (round-report | fp-doc-update); `questions` = the
 *  router template's caller-declared extra judgment entries (the node has
 *  additional judgment + corresponding flow edges — prompt content and
 *  condition vocabulary come from the calling graph, never template
 *  semantics; accept-node consolidation). The framework-chain
 *  `node` discriminator shape does not exist — variant dispatch is banned
 *  (one template one file); the loop template_args shape does
 *  not exist — loop/rework semantics are flow self-edges (transition
 *  table), never a task template (graph-flow capability). Startup/handoff
 *  templates ignore args (zero-param call compatibility — the same
 *  signature accepts them optionally). */
export interface TemplateArgs {
  paths?: string[];
  terminal?: string;
  questions?: { prompt: string; condition: string }[];
}

/** Builtin task-template registration list — every entry resolves to an
 *  index export; template contract tests assert completeness both ways
 *  and one-template-per-file. */
export const TASK_TEMPLATES = {
  handoff: handoffTaskTemplate,
  router: routerTaskTemplate,
  startup: startupTaskTemplate,
  'scope-entry': scopeEntryTaskTemplate,
  adopting: adoptingTaskTemplate,
} as const;

export type { ScopeEntryArgs };

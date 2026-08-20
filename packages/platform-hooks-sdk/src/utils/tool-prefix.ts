/**
 * Tool-name prefix class derivation — single source of truth for the
 * graph-fidelity / graph-fidelity-context landing classification
 * (parity pair migrated to the SDK, round 18, change
 * graph-fidelity-context-r18-fixes).
 *
 * Platform naming conventions: `mcp__<server>_<tool>` → mcp (MCP
 * bridge); `__<name>__` → control (platform control-plane names);
 * anything else → builtin (bare names incl. custom tools).
 * Deterministic; unknown conventions degrade to builtin.
 *
 * Control-plane classification (the landing transform's C1 signal) is
 * SDK-owned here too: `isControlPlaneTool` — the prefix class's
 * `__name__` control convention OR a control-plane tool family
 * (prefix-matched MCP server families + the decision/approval names).
 * Consumers derive from the SDK classifier instead of maintaining a
 * local parallel list (fidelity single-source).
 *
 * @module
 */

/** Tool-name prefix class — the landing transform's additive signal. */
export type ToolNamePrefixClass = 'builtin' | 'mcp' | 'control';

/**
 * Derive the tool-name prefix class from platform naming conventions.
 * Pure; runtime semantics pinned by the SDK utils test suite.
 */
export function prefixClassOf(toolName: string): ToolNamePrefixClass {
  if (toolName.startsWith('mcp__')) return 'mcp';
  if (/^__.+__$/.test(toolName)) return 'control';
  return 'builtin';
}

/**
 * Control-plane tool families — prefix-matched MCP server families
 * (`mcp__graph_scheduler_*` = graph run control signals — runId, node
 * routing, run state) plus the decision/approval tool family (task /
 * ask / approval-like names — subagent dispatch, decision UI, approval
 * gates). Single home; consumers never hold a local parallel list.
 */
const CONTROL_PLANE_PREFIXES: readonly string[] = ['mcp__graph_scheduler_'];
const CONTROL_PLANE_TOOLS: Record<string, true> = { task: true, ask: true, approval: true };

/**
 * Control-plane classifier — the SDK single home for the landing
 * transform's C1 signal: the platform `__name__` control convention
 * (derived through `prefixClassOf`) OR a control-plane tool family.
 * Pure; runtime semantics pinned by the SDK utils test suite.
 */
export function isControlPlaneTool(toolName: string): boolean {
  if (CONTROL_PLANE_TOOLS[toolName] === true) return true;
  if (CONTROL_PLANE_PREFIXES.some((prefix) => toolName.startsWith(prefix))) return true;
  return prefixClassOf(toolName) === 'control';
}

/**
 * Scenario classification (scenario-classify-clean + hint-tool-context):
 * a tool invocation maps to exactly one SCENARIO key
 * (find/read/write/verify/run) or none (`n/a: no scenario coverage`),
 * plus a compliance verdict. The scenario key is the ONLY
 * classification standard, derived from the tool name plus
 * platform-native rules — never from target-path content, file-type
 * lists, or command content beyond the declared CLI-locate tokens.
 *
 * Rules (platform-native):
 * - native tool-name sets: write/edit/ast_edit → write; read → read
 *   (unconditional); glob/grep → find; bash → run;
 * - CLI-locate command tokens: a bash command whose leading token
 *   (after the rtk/proxy wrapper strip) is a locate token classifies
 *   as the find scenario;
 * - internal-URI scheme routes: write/content-read over `<scheme>://`
 *   (skill/rule/agent/history/artifact/local/memory/mcp/issue/pr/omp/xd)
 *   attach nothing — exemption class (no service surface);
 * - consumer extension map: tools absent from the native rules classify
 *   via the consumer-supplied tool→scenario table (data only); native
 *   rules take priority; omission = no coverage (fail-open).
 *
 * Third-party tool-name vocabulary is consumer data, never SDK core
 * content — the SDK carries zero such strings (source, comments,
 * tests).
 *
 * The classify face is consumed through the scenarioHints middleware
 * (scenarios.ts); consumers never classify per tool event and never
 * carry classification logic. Interface naming follows the classify
 * verb family.
 *
 * Semantics are bound by project specs:
 * - every-match, no thresholds, no cooldowns;
 * - zero deny — classification outputs scenario keys + a compliance
 *   verdict only, never a block or deny;
 * - compliant suppression — a tool already in the scenario's promoted
 *   set (consumer map reverse lookup) is compliant; compliant
 *   invocations attach nothing (the middleware silences them);
 * - fail-open — a tool with no coverage returns no key; unknown args
 *   never silence a possible classification.
 *
 * Pure — no platform imports, no state, no side effects.
 *
 * @module
 */

import type { ScenarioId } from './scenarios.js';

/** A tool invocation being classified. */
export interface DisciplineInput {
  readonly toolName: string;
  /** Tool arguments (the bash `command` for CLI-locate detection, `path`/`filePath` for the internal-URI exemption); optional — classification degrades to tool-name rules. */
  readonly args?: Readonly<Record<string, unknown>>;
}

/** Consumer-supplied tool→scenario extension table (data only; native rules take priority). */
export type ToolMap = Readonly<Record<string, ScenarioId>>;

/** Platform-native structured write tools. */
const NATIVE_WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit', 'ast_edit']);

/** Platform-native content-read tool — classifies as read unconditionally (no file-type judgment). */
const NATIVE_READ_TOOLS: ReadonlySet<string> = new Set(['read']);

/** Platform-native locate/search tools. */
const LOCATE_TOOLS: ReadonlySet<string> = new Set(['glob', 'grep']);

/** Shell locate command first tokens (CLI locate — the find scenario trigger). */
const LOCATE_CLI_TOKENS: ReadonlySet<string> = new Set(['find', 'ls', 'fd', 'rg', 'ag', 'tree']);

/**
 * Platform-internal URI schemes — the exemption class: write/content-
 * read invocations over these routes are structurally never project
 * files (no service surface), so no hint attaches. Closed, enumerated
 * lookup: `<scheme>://` prefix on `args.path` or `args.filePath`
 * (path-key union). URL/ssh/file paths are NOT members.
 */
const INTERNAL_URI_SCHEMES: Readonly<Record<string, true>> = {
  skill: true,
  rule: true,
  agent: true,
  history: true,
  artifact: true,
  local: true,
  memory: true,
  mcp: true,
  issue: true,
  pr: true,
  omp: true,
  xd: true,
};

/**
 * Classification result — the scenario key (undefined when no scenario
 * covers it — `n/a: no scenario coverage`) plus the compliance verdict.
 * `compliant` = the invocation already used a promoted tool for the
 * scenario (tool name in the scenario's promoted set, derived from the
 * consumer map reverse lookup) — or, for the run scenario, a bash
 * invocation already carrying the `rtk` wrapper prefix. A compliant
 * invocation attaches nothing (silent). Error-shaped results are never
 * compliant by construction — the middleware skips them before
 * classification.
 */
export interface ClassificationResult {
  readonly scenario?: ScenarioId;
  readonly compliant: boolean;
}

/**
 * Scenario → promoted tool-name set — reverse lookup over the consumer
 * extension map (data only; native tools are never members, so native
 * invocations are non-compliant by construction). Declaration order
 * preserved for representative-name selection.
 */
export function promotedSetOf(toolMap?: ToolMap): Readonly<Record<ScenarioId, ReadonlySet<string>>> {
  const out: Record<ScenarioId, Set<string>> = {
    find: new Set(),
    read: new Set(),
    write: new Set(),
    verify: new Set(),
    run: new Set(),
  };
  if (toolMap !== undefined) {
    for (const [tool, scenario] of Object.entries(toolMap)) {
      const set = out[scenario as ScenarioId];
      if (set !== undefined) set.add(tool);
    }
  }
  return out;
}

/**
 * Effective tool name for DO-NOT rendering — the tool the caller
 * actually used: `bash` resolves to its first effective command token
 * (after the rtk/proxy wrapper strip) so the find hint names the locate
 * command, not the shell; non-bash tools resolve to themselves.
 */
export function usedToolOf(input: DisciplineInput): string {
  const { toolName, args } = input;
  if (toolName !== 'bash') return toolName;
  // Chained commands classify as find via the SEGMENT scan
  // (locateTokensOf) — the DO-NOT name must match the classifier's
  // trigger: the first locate token across segments (e.g. `find` in
  // `rtk git log && find .`), not the head token.
  for (const token of locateTokensOf(args)) {
    if (LOCATE_CLI_TOKENS.has(token)) return token;
  }
  return 'bash';
}

/**
 * Classify a tool invocation into its scenario key + compliance
 * verdict. Deterministic, stateless, every-match. Rule order:
 * internal-URI exemption (write/content-read only) → native tool-name
 * sets → CLI-locate token scan → consumer extension map → fail-open.
 * Compliance: promoted-set membership for find/read/write/verify;
 * rtk-prefix presence for the run scenario.
 */
export function classifyScenario(input: DisciplineInput, toolMap?: ToolMap): ClassificationResult {
  const { toolName, args } = input;
  if ((NATIVE_WRITE_TOOLS.has(toolName) || NATIVE_READ_TOOLS.has(toolName)) && isInternalUriRoute(args)) {
    return { compliant: false };
  }
  let scenario: ScenarioId | undefined;
  if (NATIVE_WRITE_TOOLS.has(toolName)) scenario = 'write';
  else if (NATIVE_READ_TOOLS.has(toolName)) scenario = 'read';
  else if (LOCATE_TOOLS.has(toolName)) scenario = 'find';
  else if (toolName === 'bash') {
    const first = locateTokensOf(args);
    if (first.some((token) => LOCATE_CLI_TOKENS.has(token))) scenario = 'find';
    else scenario = 'run';
  } else if (toolMap !== undefined) {
    scenario = toolMap[toolName];
  }
  if (scenario === undefined) return { compliant: false };
  return { scenario, compliant: isCompliant(toolName, args, scenario, toolMap) };
}

/** Compliance verdict — promoted-set membership, or rtk prefix for run. */
function isCompliant(
  toolName: string,
  args: Readonly<Record<string, unknown>> | undefined,
  scenario: ScenarioId,
  toolMap: ToolMap | undefined,
): boolean {
  if (scenario === 'run') return hasRtkPrefix(args);
  return (promotedSetOf(toolMap)[scenario] as ReadonlySet<string>).has(toolName);
}

/** rtk wrapper-prefix check — the run-scenario compliance test. Segment-aware like locateTokensOf: any command segment whose first token is `rtk` (or `rtk proxy`) makes the invocation compliant — `cd /tmp && rtk yarn build` is prefixed and must not be nagged. */
function hasRtkPrefix(args: Readonly<Record<string, unknown>> | undefined): boolean {
  if (args === undefined) return false;
  const command = args['command'];
  if (typeof command !== 'string') return false;
  for (const segment of command.split(/[&|;]+/)) {
    if (segment.trim().split(/\s+/)[0]?.toLowerCase() === 'rtk') return true;
  }
  return false;
}

/**
 * Locate-token scan — every command segment's leading token, lowercased
 * (empty when absent/non-string). Segments are split on `&&` / `||` /
 * `;` / `|` so a locate command later in a chain (e.g.
 * `rtk git log && find . -name "*.ts"`) still fires (round 13 F11-G:
 * first-token-only matching missed chained commands). The project shell
 * wrapper `rtk` (and its `rtk proxy` form) is a pure passthrough — the
 * effective command follows it.
 */
function locateTokensOf(args: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  if (args === undefined) return [];
  const command = args['command'];
  if (typeof command !== 'string') return [];
  const tokens: string[] = [];
  for (const segment of command.split(/[&|;]+/)) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) continue;
    const parts = trimmed.split(/\s+/);
    let index = 0;
    if (parts[index]?.toLowerCase() === 'rtk') index += 1;
    if (index > 0 && parts[index]?.toLowerCase() === 'proxy') index += 1;
    const token = parts[index];
    if (token === undefined) continue;
    tokens.push(token.toLowerCase());
  }
  return tokens;
}

/**
 * Internal-URI route detection — write/content-read invocations over
 * platform-internal URI schemes attach no hint (exemption class).
 * Matched on the `<scheme>://` form only.
 */
function isInternalUriRoute(args: Readonly<Record<string, unknown>> | undefined): boolean {
  if (args === undefined) return false;
  if (typeof args.path === 'string' && isInternalUri(args.path)) return true;
  if (typeof args.filePath === 'string' && isInternalUri(args.filePath)) return true;
  return false;
}

/** Internal-URI scheme check — `<scheme>://` prefix on the given path value. */
function isInternalUri(path: string): boolean {
  const colon = path.indexOf('://');
  if (colon <= 0) return false;
  return INTERNAL_URI_SCHEMES[path.slice(0, colon)] === true;
}

/**
 * Built-in ToolHints implementation — pure classification for the hints
 * contract (R-EXT, hints capability): attach user-level routing guidance
 * to tool-call results before they reach the LLM.
 *
 * Data-driven three-class vocabulary (core/resident-data.ts precedent —
 * the vocabulary stays data):
 *
 * - write {write, edit} + content-read {read} → serena hint (the single
 *   registered engine for in-project reads/writes)
 * - locate {glob, grep} + bash CLI first-token {find, ls, fd, rg, ag,
 *   tree} → jcodemunch hint (the indexed locate/search engine)
 *
 * Platform-evidenced: the tool names mirror the platform tool surface
 * (.refs platform evidence, ADR 0178); pinned by
 * tests — no speculative entries. CLI detection reads ONLY the first
 * token of the shell command string — never executes anything. Write/
 * content-read invocations over platform-internal URI schemes
 * (INTERNAL_URI_SCHEMES, `<scheme>://` form) never attach — the
 * registered engines are project-root bound and cannot serve internal
 * resources; the xd:// MCP-proxy surface is one member of that set.
 * URLs/ssh/file paths keep the hint (the "in-project" qualifier stays
 * the LLM-side domain judgment); rtk wrapper tokens are stripped
 * before CLI first-token matching; error-shaped results attach
 * nothing.
 *
 * Pure: no platform imports, no I/O — every input is the invocation.
 * Hint frequency is not constrained by the contract (implementation
 * attaches on every match).
 *
 * @module
 */

import type { HintInput, HintKind, HintResult, ToolHints } from '../interfaces/hints.js';

/** OMP native structured write tools — serena hint class (platform-evidenced). */
export const WRITE_HINT_TOOLS: ReadonlySet<string> = new Set(['write', 'edit']);

/** Platform content-read tool — serena hint class (platform-evidenced). */
export const READ_HINT_TOOLS: ReadonlySet<string> = new Set(['read']);

/** Platform locate/search tools — jcodemunch hint class (platform-evidenced). */
export const LOCATE_HINT_TOOLS: ReadonlySet<string> = new Set(['glob', 'grep']);

/** Shell locate command first tokens — jcodemunch hint class (CLI locate). */
export const LOCATE_CLI_TOKENS: ReadonlySet<string> = new Set(['find', 'ls', 'fd', 'rg', 'ag', 'tree']);

/** Serena routing guidance — user-level information, LLM consumer. */
export const SERENA_HINT_TEXT =
  'Hint: next time use serena for in-project reads/writes — the single registered engine (HLT discipline).';

/** jcodemunch routing guidance — user-level information, LLM consumer. */
export const JCODEMUNCH_HINT_TEXT =
  'Hint: next time use jcodemunch for file locates/searches — the indexed code-intelligence engine (HLT discipline).';

/**
 * Pure classification — the tool invocation (name + args) maps to a
 * hint decision. Write/content-read tools → serena; locate tools and
 * bash commands whose first token is a locate command → jcodemunch;
 * everything else → `undefined` (no hint). Never throws.
 */
export function classifyToolCall(toolName: string, args?: Readonly<Record<string, unknown>>): HintResult | undefined {
  if ((WRITE_HINT_TOOLS.has(toolName) || READ_HINT_TOOLS.has(toolName)) && !isInternalUriRoute(args)) {
    return { kind: 'serena', text: SERENA_HINT_TEXT };
  }
  if (LOCATE_HINT_TOOLS.has(toolName)) {
    return { kind: 'jcodemunch', text: JCODEMUNCH_HINT_TEXT };
  }
  const token = firstTokenOf(args);
  if (toolName === 'bash' && token !== undefined && LOCATE_CLI_TOKENS.has(token)) {
    return { kind: 'jcodemunch', text: JCODEMUNCH_HINT_TEXT };
  }
  return undefined;
}

/** The built-in hints — implements the ToolHints contract. */
export function createToolHints(): ToolHints {
  return {
    hints: (input: HintInput): HintResult | undefined => classifyToolCall(input.toolName, input.args),
  };
}

/** First whitespace-delimited token of the shell command (lowercased); undefined when absent/non-string. */
function firstTokenOf(args: Readonly<Record<string, unknown>> | undefined): string | undefined {
  if (args === undefined) return undefined;
  const command = args['command'];
  if (typeof command !== 'string') return undefined;
  const trimmed = command.trim();
  if (trimmed.length === 0) return undefined;
  const tokens = trimmed.split(/\s+/);
  let index = 0;
  // The project shell wrapper `rtk` (and its `rtk proxy` form) is a pure
  // passthrough — the effective command follows it. Without the strip the
  // CLI locate class never fires on compliant (rtk-prefixed) commands
  // (live-measured: `rtk ls` attached nothing, bare `ls` attached).
  if (tokens[index]?.toLowerCase() === 'rtk') index += 1;
  if (index > 0 && tokens[index]?.toLowerCase() === 'proxy') index += 1;
  const token = tokens[index];
  return token === undefined ? undefined : token.toLowerCase();
}

/** Start-anchored error markers — serena validation/oversize errors begin the result text (live-measured). */
export const START_MARKERS: ReadonlySet<string> = new Set(['Invalid args', 'The answer is too long']);

/**
 * Line-anchored exit-code matcher — the platform bash exit line is a
 * full line of the form "Command exited with code N" following stdout
 * (live-measured: `rtk ls /definitely-not-exist-zzz-12345` exit 1). A
 * bare-phrase match false-skips successful results that merely MENTION
 * the phrase (documentation quoting the marker) — the matcher requires
 * a complete line with a trailing code number (round-6 live measured:
 * grepping the marker string and reading docs that quote it attached
 * nothing before this fix).
 */
export const EXIT_LINE_MATCHER: RegExp = /^Command exited with code \d+$/m;

/**
 * Error-shape detection — content-embedded error results skip hint
 * attachment (scenario: Error-shaped results attach nothing). The
 * platform error flag alone misses validation errors, oversized-answer
 * truncations, and non-zero shell exits (all three live-measured).
 * Markers are anchored per class: start-anchored serena markers vs the
 * line-anchored platform exit line (stdout-first shape); prose mentions
 * of the exit phrase attach as usual (scenario: Prose mentions of error
 * markers attach as usual). Non-string input fails open (returns false,
 * never throws) — the opencode face may hand over odd shapes. Pure,
 * never throws.
 */
export function isErrorShaped(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trimStart();
  for (const marker of START_MARKERS) {
    if (t.startsWith(marker)) return true;
  }
  return EXIT_LINE_MATCHER.test(t);
}

/**
 * Platform-internal URI schemes — structurally never project files
 * (serena is project-root bound and cannot serve them). Closed,
 * enumerated lookup: `<scheme>://` prefix on `args.path` or
 * `args.filePath` (path-key union). URL/ssh/file paths are NOT members —
 * the hint text's "in-project" qualifier stays the LLM-side domain
 * judgment (round-2 ruling).
 */
export const INTERNAL_URI_SCHEMES: Readonly<Record<string, true>> = {
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
 * Internal-URI route detection — write/content-read invocations over
 * platform-internal URI schemes attach no hint (operation class known,
 * service surface empty: the registered engines cannot read internal
 * resources). Matched on the `<scheme>://` form only — a bare `skill:`
 * prefix (or a file literally named `skill:…`) does not skip.
 */
function isInternalUriRoute(args: Readonly<Record<string, unknown>> | undefined): boolean {
  if (args === undefined) return false;
  // Path-key union — OMP write/edit carry the target under `path`; the
  // opencode edit tool carries it under `filePath`. Either key hitting an
  // internal URI scheme skips, keeping the skip face-uniform.
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

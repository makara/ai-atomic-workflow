/**
 * ToolHints — the fourth interface-layer contract (R-EXT, hints
 * capability): attach additional USER-LEVEL information to tool-call
 * results before they reach the LLM.
 *
 * The contract declares ONE decision: given a tool invocation, what
 * hint text — if any — to attach. The attached text is user-level
 * information: the LLM is the sole consumer, and the hint carries the
 * same status as user-provided guidance (advisory, never enforcement).
 * The built-in hints implementation (core/hints.ts) implements the
 * contract; alternative hint implementations dock against the same
 * contract without modifying the core module or the existing
 * signal/feedback contracts (R-EXT seam).
 *
 * NOT to be confused with the agent-type advisory vocabulary
 * (`## Agent hints:` — a dispatch-level hint selecting sub-agent types,
 * atom-kernel): ToolHints attach to TOOL-CALL RESULTS, target the LLM,
 * and carry routing guidance (registered engines). The distinction is
 * load-bearing — the two vocabularies never mix.
 *
 * Hint frequency is NOT constrained by this contract; the
 * implementation decides attachment policy.
 *
 * @module
 */

/** Hint class — the guidance target. */
export type HintKind = 'serena' | 'jcodemunch';

/** A tool invocation being evaluated for a hint. */
export interface HintInput {
  readonly toolName: string;
  /** Tool arguments (e.g. the bash `command` for CLI locate detection); optional — classification degrades to tool-name only. */
  readonly args?: Readonly<Record<string, unknown>>;
}

/** Hint decision — the user-level guidance text attached to the result. */
export interface HintResult {
  readonly kind: HintKind;
  readonly text: string;
}

/** The normative hints contract — one decision per tool invocation. */
export interface ToolHints {
  /** Hint text for the invocation, or `undefined` (no hint). */
  hints(input: HintInput): HintResult | undefined;
}

/**
 * ToolDeny — the third interface-layer contract (ADR 0177): gate REDUNDANT
 * platform write tools behind the single registered write engine (serena).
 *
 * The contract declares (a) a WRITABILITY DETERMINATION — given a target
 * path and the project environment snapshot, can the registered write
 * engine cover the write? — and (b) an INTERCEPTION DECISION — given a
 * platform write-tool invocation, deny or allow. The built-in deny
 * implementation is REMOVED; providers dock against the contract through
 * the opencode adapter's `options.deny` embedding seam without modifying
 * the core module or the existing signal/feedback contracts (R-EXT
 * seam). The OMP adapter carries no deny wiring.
 *
 * Denial targets redundant platform write paths only — a registered write
 * engine (serena) is never denied (HLT: registered capability never
 * restricted). Engagement and fail-open semantics are the provider's
 * responsibility; an absent provider means no denial.
 *
 * @module
 */

/** Project environment snapshot — assembled by the deny provider (built-in assembly removed). */
export interface DenySnapshot {
  readonly projectRoot: string;
  readonly readOnly: boolean;
  /** serena `ignore_all_files_in_gitignore` — when true, `gitignorePatterns` gate writes. */
  readonly ignoreGitignore: boolean;
  /** serena `ignored_paths` — gitignore-style globs (same minimal subset as `gitignorePatterns`). */
  readonly ignoredPaths: readonly string[];
  /** serena `excluded_tools` — tools the registered engine does NOT serve; their writes stay uncovered. */
  readonly excludedTools: ReadonlySet<string>;
  /** gitignore rules (minimal glob subset); consulted only when `ignoreGitignore` is true. */
  readonly gitignorePatterns: readonly string[];
  /** serena configured + available at startup. */
  readonly engaged: boolean;
}

/** A platform write-tool invocation being evaluated. */
export interface WriteInvocation {
  readonly toolName: string;
  readonly path?: string;
  /**
   * The target's REAL path (symlinks resolved). The built-in adapter
   * resolution is removed: the embedding seam passes the lexical path
   * only, so realPath is ABSENT by default — providers own their own
   * resolution; absent stays fail-open (not coverable → no denial).
   */
  readonly realPath?: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/** Interception decision — `reason` is returned to the LLM when denied (HLT reminder). */
export interface InterceptResult {
  readonly deny: boolean;
  readonly reason?: string;
}

/** The normative deny contract — determination + interception. */
export interface ToolDeny {
  readonly engaged: boolean;
  /** Can the registered write engine (serena) cover this write? */
  determine(input: WriteInvocation): boolean;
  /** deny only when engaged && write tool && determine() === true */
  intercept(input: WriteInvocation): InterceptResult;
}

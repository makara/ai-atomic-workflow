/**
 * Scoped-context channel shape validation — shared pure-function module.
 *
 * Engine-side machine validation only. The engine validates what it owns:
 * channel shape (explicit prefixes, glob namespaces, convention guard,
 * run-scope protection). Skill `## Context Requirements` contracts are
 * agent-side knowledge — the handler reads the skill it dispatches and
 * assembles context per its contract; the engine never parses skill prose.
 *
 * Channel entry grammar (shape-level, prefix-driven, no contract lookup):
 * - `skill:<name>` prefix  → reference skill (passes through to the agent)
 * - `node:<id>` prefix     → upstream node output (cross-level legal)
 * - convention-layer file (DEFAULT_CONVENTIONS member) → skipped (implicit coverage, warn)
 * - glob-shape entry      → file glob (workflow-artifact namespaces only)
 * - entry duplicating a dependsOn node → redundant declaration (warning)
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Prefix classification — explicit prefixes, no fallback
// ---------------------------------------------------------------------------

/** Strip explicit prefix from a channel entry — returns the bare target. */
export function stripPrefix(entry: string): { type: 'skill' | 'node'; target: string } | null {
  if (entry.startsWith('skill:')) return { type: 'skill', target: entry.slice('skill:'.length) };
  if (entry.startsWith('node:')) return { type: 'node', target: entry.slice('node:'.length) };
  return null;
}

/** Glob-shape detection — path separator or glob wildcard. */
export function isGlobShape(entry: string): boolean {
  return entry.includes('/') || entry.includes('*') || entry.includes('?') || entry.includes('[');
}

/**
 * Platform convention layer — exact file paths only (no directory-class
 * entries, no glob entries). Default-loaded into every phase; absence-tolerant
 * by construction (agent-side missing-file warn+continue is the tolerance
 * mechanism — mirrors prologue degrade). Three-tier channel model: this
 * constant is the sole convention-layer source.
 */
export const DEFAULT_CONVENTIONS: readonly string[] = ['./CONTEXT.md', 'docs/domains.md'];

/**
 * Is a file entry a platform convention-layer path? Normalized membership in
 * DEFAULT_CONVENTIONS - the sole convention-layer source. Convention files are
 * platform-shipped, default-loaded into every phase, absence-tolerant: they are
 * implicit coverage, never a contract obligation.
 */
export function isConventionFile(entry: string): boolean {
  const f = normFile(entry);
  return DEFAULT_CONVENTIONS.some((c) => normFile(c) === f);
}

/**
 * Reference vocabulary — the platform's conventioned document estate,
 * organically discovered by the executing agent (read when present; never
 * declared, never existence-checked, never injected). Membership bounds the
 * platform: code and conventioned docs must not reference document paths
 * outside the vocabulary. Convention files (DEFAULT_CONVENTIONS) are the
 * always-on subset; output homes (docs/reports/, docs/specs/, .scratch/)
 * are exempt. Four-layer context model: convention layer -> user-supplement
 * layer (config `context:`) -> platform estate (this) -> graph channels.
 */
export const REFERENCE_VOCABULARY: readonly string[] = [
  './CONTEXT.md',
  'docs/domains.md',
  'docs/adr/**',
  'openspec/specs/**',
  'openspec/changes/**',
  'CHANGELOG.md',
  'README.md',
];

/**
 * Is a file entry inside the reference vocabulary? `dir/**` patterns cover
 * the directory itself and all descendants; exact patterns match exactly.
 */
export function isVocabularyFile(entry: string): boolean {
  const f = normFile(entry);
  return REFERENCE_VOCABULARY.some((raw) => {
    const p = normFile(raw);
    if (p.endsWith('/**')) {
      const base = p.slice(0, -3);
      return f === base || f.startsWith(base + '/');
    }
    return p === f;
  });
}

/**
 * Workflow runtime artifact namespaces — the only file-glob targets legal in
 * graph `context:` / phase `channels:` (four-layer channel model: graph file
 * channels carry workflow artifacts only; conventions are implicit via
 * DEFAULT_CONVENTIONS; project layout lives in config.json `context:`).
 */
const WORKFLOW_ARTIFACT_PREFIXES: readonly string[] = ['.graph-scheduler/', '.taskflow/'];

/** Is a file-glob channel entry targeting a workflow runtime artifact namespace? */
export function isWorkflowArtifactGlob(entry: string): boolean {
  const c = normFile(entry);
  return WORKFLOW_ARTIFACT_PREFIXES.some((p) => c === p.slice(0, -1) || c.startsWith(p));
}

/** normalize a file entry for matching — strip leading ./ and trailing / */
export function normFile(entry: string): string {
  return entry.replace(/^\.\//, '').replace(/\/$/, '');
}

/**
 * Shared run-scope gate — a `node:` channel target outside the current run's
 * flattened node set is a cross-run reference: warn + skip (stale content
 * from other runs must never deliver). Absent runNodeIds (validation paths
 * without a run) → check skipped.
 *
 * Single implementation shared by all dispatch paths (graph_start /
 * graph_advance / graph_jump NodeDetail construction) — no second copy.
 */
export function isNodeInRun(target: string, runNodeIds: ReadonlySet<string> | undefined): boolean {
  if (!runNodeIds) return true;
  return runNodeIds.has(target);
}

/** Run-scope warning text — same wording everywhere. */
export function runScopeWarning(display: string): string {
  return `"${display}" — target outside the current run's node set; cross-run channel declarations are never delivered (run-scope protection)`;
}

/**
 * Merge context scopes into a phase's effective channel list — two-scope
 * model: the global channel (config default layer + graph `context:`,
 * outer-first) then the phase's own `channels:`. Additive union with
 * exact-string dedup — no override semantics, context is additive, not
 * keyed configuration.
 *
 * Returns the sole non-empty scope's reference unchanged (zero-copy fast
 * path — identity checks at callers keep working, mirroring
 * stripOutOfRunChannels); undefined when every scope is empty.
 */
export function mergeChannelScopes(
  ...scopes: ReadonlyArray<readonly string[] | undefined>
): readonly string[] | undefined {
  const nonEmpty = scopes.filter((s): s is readonly string[] => s !== undefined && s.length > 0);
  if (nonEmpty.length === 0) return undefined;
  if (nonEmpty.length === 1) return nonEmpty[0];
  const out: string[] = [];
  for (const scope of nonEmpty) {
    for (const entry of scope) {
      if (!out.includes(entry)) out.push(entry);
    }
  }
  return out;
}

/**
 * Strip `node:` channel entries whose target is outside the run node set.
 * Returns surviving channels + warnings. Used by buildNodeDetail at dispatch
 * (deterministic — prefix-only, no contract needed). Returns the input
 * reference unchanged when nothing was stripped (identity check enables a
 * zero-copy fast path at the caller).
 */
export function stripOutOfRunChannels(
  channels: readonly string[] | undefined,
  runNodeIds: ReadonlySet<string> | undefined,
): { channels: readonly string[] | undefined; warnings: string[] } {
  if (!channels || !runNodeIds) return { channels, warnings: [] };
  let kept: string[] | null = null;
  const warnings: string[] = [];
  for (let i = 0; i < channels.length; i++) {
    const entry = channels[i];
    const prefixed = stripPrefix(entry);
    if (prefixed?.type === 'node' && !isNodeInRun(prefixed.target, runNodeIds)) {
      warnings.push(runScopeWarning(entry));
      kept ??= channels.slice(0, i); // lazy copy on first strip — prior entries preserved
      continue;
    }
    if (kept !== null) kept.push(entry);
  }
  return { channels: kept ?? channels, warnings };
}

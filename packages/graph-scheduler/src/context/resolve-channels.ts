/**
 * Scoped-context channel resolution — shared pure-function module (D1).
 *
 * Single source of truth for scoped-context semantics, consumed by BOTH:
 * - CLI validate (static bidirectional contract checks)
 * - handler main-branch runtime (inline context assembly)
 *
 * Channel type is derived from the skill contract lookup, never guessed:
 * - `skill:<name>` prefix  → reference skill
 * - `node:<id>` prefix     → upstream node output (cross-level legal)
 * - bare entry in contract From upstream table  → upstream node output
 * - bare entry in contract Reference skills     → reference skill
 * - bare entry in contract Files table or glob shape → file globs
 * - entry duplicating a dependsOn node          → redundant declaration (warning)
 * - entry matching nothing                      → error (no fallback search)
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Contract parsing — skill `## Context Requirements` → machine-readable lists
// ---------------------------------------------------------------------------

/** Parsed skill context contract — the single source of truth for channels. */
export interface IContextContract {
  /** `### From upstream` — node IDs whose output the skill consumes */
  readonly upstream: string[];
  /** `### Reference skills` — skill names the skill needs as reference */
  readonly references: string[];
  /** `### Files` — file globs the skill requires */
  readonly files: string[];
  /** parse errors — placeholder entries, malformed subsections */
  readonly errors: string[];
}

/** Marker for placeholder entries — `<configurable …>` etc. */
const PLACEHOLDER_RE = /<.*>/;

/** Fence-line detection — line starts with ```, optionally followed by a non-space language tag. */
function isFenceLine(t: string): boolean {
  if (!t.startsWith('```')) return false;
  const rest = t.slice(3);
  return rest.length === 0 || !rest.startsWith(' ');
}

/** Per-line fence mask — true for content lines inside a ``` code fence. */
function fenceMask(lines: readonly string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceLine(lines[i].trim())) {
      inFence = !inFence;
      continue;
    }
    mask[i] = inFence;
  }
  return mask;
}

/**
 * Extract a `### <name>` subsection's `- item` list from a section body.
 * Scan stops at the next `### ` heading or `## ` heading. Lines inside
 * code fences are skipped — fenced documentation examples never leak into
 * the contract.
 */
function parseSubsection(
  lines: readonly string[],
  sectionStart: number,
  heading: string,
  mask: readonly boolean[],
): string[] {
  const headingIdx = lines.findIndex((l, i) => i >= sectionStart && !mask[i] && l.trim() === heading);
  if (headingIdx === -1) return [];
  const out: string[] = [];
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (mask[i]) continue;
    const t = lines[i].trim();
    if (t.startsWith('### ') || t.startsWith('## ')) break;
    if (t.startsWith('- ')) out.push(t.slice(2).trim());
  }
  return out.filter(Boolean);
}

/**
 * Parse a SKILL.md body's `## Context Requirements` section into a
 * machine-readable contract. Entries are `- item` list lines under the three
 * subsections. Placeholder entries (`<…>`) are rejected — a contract with
 * placeholders is not machine-usable. Code-fenced blocks are inert: a
 * `## Context Requirements` heading inside a fence is not the section, and
 * fenced example entries never contribute to the contract.
 */
export function parseContextContract(content: string): IContextContract {
  const lines = content.split('\n');
  const mask = fenceMask(lines);
  const sectionStart = lines.findIndex((l, i) => !mask[i] && l.trim() === '## Context Requirements');
  if (sectionStart === -1) {
    return { upstream: [], references: [], files: [], errors: [] };
  }

  const upstream = parseSubsection(lines, sectionStart, '### From upstream', mask);
  const references = parseSubsection(lines, sectionStart, '### Reference skills', mask);
  const files = parseSubsection(lines, sectionStart, '### Files', mask);

  const errors: string[] = [];
  for (const [label, list] of [
    ['From upstream', upstream],
    ['Reference skills', references],
    ['Files', files],
  ] as const) {
    for (const entry of list) {
      if (PLACEHOLDER_RE.test(entry)) {
        errors.push(
          `placeholder entry in ${label}: "${entry}" — contract entries must be concrete node IDs, skill names, or file globs`,
        );
      }
    }
  }

  return { upstream, references, files, errors };
}

// ---------------------------------------------------------------------------
// Channel resolution — contract lookup with explicit prefixes, no fallback
// ---------------------------------------------------------------------------

/** Structured channel resolution result. */
export interface IResolveResult {
  /** upstream node IDs to read `.taskflow/outputs/<id>.output.txt` for */
  readonly upstream: string[];
  /** reference skill names to load via `skill://<name>` */
  readonly references: string[];
  /** file globs to expand via the glob tool */
  readonly files: string[];
  /** hard resolution failures — no-match entries */
  readonly errors: string[];
  /** non-blocking findings — redundant declarations, bare cross-level refs */
  readonly warnings: string[];
}

export interface IResolveInput {
  /** phase `channels` field entries — `string[]` */
  readonly channels: readonly string[] | undefined;
  /** phase `dependsOn` node IDs — implicit upstream coverage */
  readonly dependsOn: readonly string[] | undefined;
  /** parsed skill contract — single source of truth for type derivation */
  readonly contract: IContextContract;
}

/** Strip explicit prefix from a channel entry — returns the bare target. */
function stripPrefix(entry: string): { type: 'skill' | 'node'; target: string } | null {
  if (entry.startsWith('skill:')) return { type: 'skill', target: entry.slice('skill:'.length) };
  if (entry.startsWith('node:')) return { type: 'node', target: entry.slice('node:'.length) };
  return null;
}

/** Glob-shape detection — path separator or glob wildcard. */
export function isGlobShape(entry: string): boolean {
  return entry.includes('/') || entry.includes('*') || entry.includes('?') || entry.includes('[');
}

/** normalize a file entry for matching — strip leading ./ and trailing / */
function normFile(entry: string): string {
  return entry.replace(/^\.\//, '').replace(/\/$/, '');
}

/**
 * Does a channel entry cover a contract Files entry? (exact, dir-prefix, or glob match)
 *
 * Single file-matching primitive shared by BOTH directions:
 * - forward coverage — contracts checker: is every contract file covered by a channel?
 * - reverse resolution — this module: how is a channel entry classified?
 * One implementation — no sibling self-copies that can drift.
 */
export function fileChannelCoveredBy(channel: string, contractFile: string): boolean {
  const c = normFile(channel);
  const f = normFile(contractFile);
  if (c === f) return true;
  if (f.length > 0 && c.startsWith(f + '/')) return true; // dir prefix — e.g. contract `dir/` covers `dir/*.md`
  // glob: contract `*.md` covered by any `.md` channel
  if (f.startsWith('*')) return c.endsWith(f.slice(1));
  return false;
}

/**
 * Resolve a phase's `channels` against the skill contract.
 *
 * Type derivation order:
 * 1. explicit `skill:`/`node:` prefix — always wins
 * 2. bare entry matching contract From upstream / Reference skills / Files tables
 * 3. glob-shape entry → file
 * 4. entry duplicating dependsOn → redundant-declaration warning, implicit coverage
 * 5. no match → error (no fallback search — deterministic)
 */
export function resolveChannels(input: IResolveInput): IResolveResult {
  const channels = input.channels ?? [];
  const dependsOn = new Set(input.dependsOn ?? []);
  const { contract } = input;

  const upstream: string[] = [];
  const references: string[] = [];
  const files: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const entry of channels) {
    // empty entry — semantic no-op, reject with clear message
    if (!entry.trim()) {
      errors.push('empty channel entry — remove or replace with a valid entry');
      continue;
    }

    // 1 — explicit prefix always wins
    const prefixed = stripPrefix(entry);
    if (prefixed) {
      if (prefixed.type === 'skill') {
        references.push(prefixed.target);
      } else {
        if (dependsOn.has(prefixed.target)) {
          warnings.push(`"${entry}" — node already covered by dependsOn; redundant declaration`);
        } else {
          upstream.push(prefixed.target);
        }
      }
      continue;
    }

    // 2a — contract From upstream table
    if (contract.upstream.includes(entry)) {
      if (dependsOn.has(entry)) {
        warnings.push(`"${entry}" — already covered by dependsOn; redundant declaration`);
      } else {
        upstream.push(entry);
        warnings.push(
          `"${entry}" — cross-level upstream reference; use "node:${entry}" prefix for explicit declaration`,
        );
      }
      continue;
    }

    // 2b — contract Reference skills table
    if (contract.references.includes(entry)) {
      references.push(entry);
      continue;
    }

    // 2c — contract Files table
    if (contract.files.includes(entry)) {
      files.push(entry);
      continue;
    }

    // 3 — glob shape → file
    if (isGlobShape(entry)) {
      files.push(entry);
      continue;
    }

    // 4 — dependsOn duplicate (not in contract) → redundant warning
    if (dependsOn.has(entry)) {
      warnings.push(`"${entry}" — already covered by dependsOn; redundant declaration`);
      continue;
    }

    // 5 — no match → error, no fallback
    errors.push(
      `unresolvable channel "${entry}" — matches no contract subsection (From upstream/Reference skills/Files), has no explicit skill:/node: prefix, and is not a file glob`,
    );
  }

  return { upstream, references, files, errors, warnings };
}

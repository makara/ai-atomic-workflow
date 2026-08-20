/**
 * Shared display-render helpers — single source of truth for the
 * graph-fidelity / graph-fidelity-context settlement and benefit
 * rendering (parity pair migrated to the SDK, round 18, change
 * graph-fidelity-context-r18-fixes). Both consumer packages inline the
 * SDK via tsup `noExternal`, so bundles stay self-contained; these are
 * pure functions (no state — per-bundle copies are build artifacts).
 *
 * Spec-pinned output semantics (user rulings, rounds 10/17): benefit
 * bar fill = current / (current + saved), 8 fixed cells; compact
 * numbers `k`/`m` with one decimal, trailing `.0` trimmed; segment
 * omitted when saved <= 0 (never a zero claim).
 *
 * @module
 */

/** Benefit facts — the optional value-ratio graphic input (single render source: the ledger). */
export interface BenefitFacts {
  /** Exact token figures when the compressor reports them (graph-fidelity-context ledger authoritative). */
  readonly currentTokens?: number;
  readonly savedTokens?: number;
  /** Character figures — always locally computable; the ratio source when no exact tokens exist. */
  readonly currentChars?: number;
  readonly savedChars?: number;
}

const BAR_CELLS = 8;
const FILLED_CELL = '█';
const EMPTY_CELL = '░';

/**
 * Compact number formatting — `k`/`m` with one decimal, trailing `.0`
 * trimmed; integers below 1k stay bare. Display formatting only, never a
 * fact source.
 */
export function renderCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trimOne(n / 1_000_000)}m`;
  if (abs >= 1_000) return `${trimOne(n / 1_000)}k`;
  return String(Math.trunc(n));
}

function trimOne(x: number): string {
  const s = x.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/**
 * Value-ratio benefit segment — `│████░░│ cur/ref`: 8 fixed cells, fill
 * = current / (current + saved), followed by dual compact numbers when
 * exact token figures exist; ratio-only (bar, no numbers) otherwise.
 * `undefined` when no benefit facts exist or when saved <= 0 (no
 * benefit — the segment is omitted, never a zero claim; user ruling,
 * round 10).
 */
export function renderBenefitSegment(benefit: BenefitFacts | undefined): string | undefined {
  if (benefit === undefined) return undefined;
  const savedChars = benefit.savedChars ?? 0;
  if (savedChars <= 0) return undefined; // no benefit — omit
  const currentChars = benefit.currentChars ?? 0;
  const hasExactTokens =
    benefit.currentTokens !== undefined && benefit.savedTokens !== undefined && benefit.savedTokens > 0;
  const current = hasExactTokens ? benefit.currentTokens! : currentChars;
  const saved = hasExactTokens ? benefit.savedTokens! : savedChars;
  const total = current + saved;
  const fill = total <= 0 ? 0 : Math.max(0, Math.min(1, current / total));
  const filled = Math.round(fill * BAR_CELLS);
  const bar = FILLED_CELL.repeat(filled) + EMPTY_CELL.repeat(BAR_CELLS - filled);
  if (hasExactTokens) return `│${bar}│ ${renderCompact(current)}/${renderCompact(total)}`;
  return `│${bar}│`;
}

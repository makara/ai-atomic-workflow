/**
 * Structured debug logging for graph-scheduler.
 *
 * All output goes to stderr (console.error) with a unified
 * `[DEBUG-gs-NNN]` prefix keyed by caller filename.
 * Fire-and-forget — never throws.
 */

export type DebugPhase = 'load' | 'runtime';

/** Shape of the JSON payload written after the prefix. */
export interface IDebugEntry {
  ts: string;
  phase: DebugPhase;
  /** Milliseconds since module init, 3 decimal places. */
  elapsed: string;
  /** Caller basename parsed from Error().stack, or "unknown". */
  file: string;
  payload?: unknown;
}

// ── Module init timestamp (monotonic clock) ──────────────────

/** True when OMP_DEBUG environment variable is set to a truthy value. */
export function isDebugEnabled(): boolean {
  try {
    return process.env.OMP_DEBUG !== undefined && process.env.OMP_DEBUG !== '0' && process.env.OMP_DEBUG !== 'false';
  } catch {
    return false;
  }
}
const moduleInitTime = performance.now();

// ── Per-file sequence counter (keyed by caller basename) ─────
const seqCounter = new Map<string, number>();

// ── Caller detection via Error().stack ───────────────────────

/** Stack lines matching common V8/Bun formats. */
const STACK_LINE_RE = /(?:at\s+(?:.*?\s+)?\(?(.+?):(\d+):(\d+)\)?)/;

/**
 * Walk `Error().stack` to find the first caller outside this module.
 * Returns the caller basename, or `"unknown"` on failure.
 */
function getCallerFile(): string {
  try {
    const err = new Error();
    const stack = err.stack;
    if (!stack) return 'unknown';

    const lines = stack.split('\n');
    // Skip "Error\n" and the debugLog frame itself.
    for (let i = 2; i < lines.length; i++) {
      const match = lines[i].match(STACK_LINE_RE);
      if (!match) continue;

      const filePath = match[1];
      // Ignore frames inside this module only.
      if (filePath.includes('debug.ts')) continue;

      const parts = filePath.split('/');
      return parts[parts.length - 1] || 'unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Emit a structured debug log line to stderr.
 *
 * - Sequence number is per-file (auto-incremented).
 * - Timestamp is ISO 8601.
 * - Elapsed is milliseconds since this module was first imported.
 * - The caller basename is parsed from `Error().stack`.
 *
 * Never throws — failures are silently swallowed.
 */
export function debugLog(phase: DebugPhase, payload?: unknown): void {
  try {
    const file = getCallerFile();
    const current = (seqCounter.get(file) ?? 0) + 1;
    seqCounter.set(file, current);

    const seq = String(current).padStart(3, '0');
    const elapsed = (performance.now() - moduleInitTime).toFixed(3);
    const timestamp = new Date().toISOString();

    const entry: IDebugEntry = {
      ts: timestamp,
      phase,
      elapsed,
      file,
    };
    if (payload !== undefined) {
      entry.payload = payload;
    }

    console.error(`[DEBUG-omp-wf-${seq}] ${JSON.stringify(entry)}`);
  } catch {
    // fire-and-forget — never let debug output break the caller
  }
}

/** Reset per-file sequence counters. Exported for test isolation only. */
export function resetDebugCounters(): void {
  seqCounter.clear();
}

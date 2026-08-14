/**
 * Discipline echo — the per-call mechanical derivation of the node's
 * run frame. The single-line echo (display minimalism law 1) is rendered
 * by `core/echo-line.ts` from adapter signals (node id from the anchored
 * frame + progress segment — the R2 benefit graphic is suspended, ADR
 * 0175); this module owns the
 * INJECTION mechanics: canonical-line dedup, self-healing strip of
 * non-canonical `[seam]` lines, and append-to-last-user-message.
 *
 * Pure: no scheduler state, no mirror, no platform imports. The handler
 * frame is the single assembly point; the echo only derives from it.
 *
 * @module
 */

import { isUserLike, latestFrame } from './runframe.js';
import type { EchoMessage } from './types.js';

export const SEAM_MARKER = '[seam]';

/** Strip seam lines from a message text (self-heal helper) — other content untouched. Matches the glyph-prefixed canonical line (`▣ [seam] …`) and the bare marker (legacy/corrupted renders). */
export function stripSeamLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !isSeamLine(line))
    .join('\n');
}

/** True when a line is a seam line — `▣ [seam]` glyph-anchored or bare `[seam]`-prefixed. */
export function isSeamLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith(SEAM_MARKER) || trimmed.startsWith(`▣ ${SEAM_MARKER}`);
}

/** True when the text carries any seam line. */
function hasSeamLine(text: string): boolean {
  return text.split('\n').some((line) => isSeamLine(line));
}

/**
 * Append the rendered echo line to the most recent user message.
 *
 * Returns a new array when the echo was appended or replaced, or
 * `undefined` when nothing changed (no user message, or the exact
 * canonical line is already present — dedup). Never mutates the input.
 *
 * Dedup semantics (canonical-line byte comparison, R5-1):
 * - user message already carries the exact canonical line → skip
 *   (in-place refresh: identical content needs no re-injection);
 * - user message carries any OTHER `[seam]` line (stale node render,
 *   corrupted doc-text render) → strip it and append the canonical line
 *   in its place (self-heal — exactly one line per call, no accumulation).
 */
export function applyDisciplineEcho(messages: readonly EchoMessage[], appended: string): EchoMessage[] | undefined {
  const target = findEchoTarget(messages);
  if (target === -1) return undefined;
  // Nothing to append — never touch the transcript.
  if (appended.length === 0) return undefined;
  const targetText = messages[target]?.text ?? '';
  // Canonical dedup — canonical-line BYTE EQUALITY: a line exactly equal
  // to the rendered line is already present (substring matching would
  // wrongly skip when the fresh flagless line is a prefix of a stale
  // flagged line — the self-clear would never render).
  if (targetText.split('\n').some((line) => line === appended)) return undefined;
  // In-place refresh — strip any prior seam line before appending the
  // fresh render (the single line never accumulates).
  const base = hasSeamLine(targetText) ? stripSeamLines(targetText) : targetText;
  const text = base.length > 0 ? `${base}\n${appended}` : appended;
  const out = messages.map((m) => ({ ...m }));
  out[target] = { ...out[target], text };
  return out;
}

function findLastUserIndex(messages: readonly EchoMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isUserLike(messages[i]?.role)) return i;
  }
  return -1;
}

/**
 * Echo append target — the most recent user-like message when one
 * exists; otherwise the latest run-id anchored frame's own message
 * (fallback anchor, L1-B'): the frame-derived discipline signal is never
 * dropped on frame-only transcripts. Returns -1 when neither exists
 * (fail-open — nothing appended, the request proceeds unchanged).
 */
function findEchoTarget(messages: readonly EchoMessage[]): number {
  const lastUser = findLastUserIndex(messages);
  if (lastUser !== -1) return lastUser;
  // Frame fallback via the shared latest-frame helper (F8 single
  // source) — the message-level user-like preference stays local (the
  // append target is the last user-like MESSAGE, frame or not; the
  // helper resolves latest FRAMES only).
  const frame = latestFrame(messages.map((m) => m?.text ?? ''));
  return frame === undefined ? -1 : frame.index;
}

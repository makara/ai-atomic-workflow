/**
 * Error-shape detection — platform-neutral content-embedded error
 * verdict (relocated from graph-fidelity `core/hints.ts`, ADR 0205).
 * The canonical tool-result normalization computes the verdict once
 * per result; consumers check the verdict and never re-implement the
 * detection. Markers are anchored per class: start-anchored
 * validation/oversize markers vs the line-anchored platform exit line.
 * Non-string input fails open (returns false, never throws).
 *
 * @module
 */

import { joinTextChunks } from './shape-ops.js';

/** Start-anchored error markers — validation/oversize errors begin the result text (live-measured). */
export const START_MARKERS = ['Invalid args', 'The answer is too long'] as const;

/**
 * Line-anchored exit-code matcher — the platform bash exit line is a
 * full line of the form "Command exited with code N" following stdout.
 * A bare-phrase match false-skips successful results that merely MENTION
 * the phrase — the matcher requires a complete line with a trailing code
 * number.
 */
export const EXIT_LINE_MATCHER: RegExp = /^Command exited with code \d+$/m;

/**
 * Error-shape detection — content-embedded error results skip hint
 * attachment. Markers are anchored per class: start-anchored
 * validation/oversize markers vs the line-anchored platform exit line.
 * Non-string input fails open (returns false, never throws). Pure,
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
 * Error-shape verdict over a canonical tool-result content — a string
 * (opencode output surface) or a block array (OMP content surface).
 * Non-text content fails open (false, never throws).
 */
export function isErrorShapedContent(content: unknown): boolean {
  if (typeof content === 'string') return isErrorShaped(content);
  if (Array.isArray(content)) {
    const joined = joinTextChunks(content);
    return joined !== null && isErrorShaped(joined);
  }
  return false;
}

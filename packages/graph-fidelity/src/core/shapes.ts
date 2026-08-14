/**
 * Parametric message shape seam — ONE implementation of
 * normalize/denormalize/echo-classification serving BOTH platform faces;
 * the platform container (OMP content blocks vs opencode parts) is a
 * descriptor parameter, never duplicated logic.
 *
 * The adapter supplies the shape descriptor (how to read text, roles,
 * result ids, and how to materialize a line append / text replacement
 * into its container); the core owns the cross-face logic: EchoMessage
 * normalization, denormalize classification, echo append detection, and
 * seam stripping.
 *
 * R2 protection plumbing (protected-result lists, message-level identity
 * carriers) was removed from the runtime (ADR 0175); the suspended
 * reference tree in `graph-fidelity-context/src/context-management/` vendors its own.
 *
 * Pure: no platform imports, no I/O.
 *
 * @module
 */

import { isSeamLine } from './discipline.js';
import type { EchoMessage } from './types.js';

/** Platform container descriptor — the only face-specific inputs. */
export interface MessageShape<M> {
  /** Joined text-only content — the echo/frame anchor surface. */
  text(message: M): string | null;
  /** Joined working text (text + tool-result content) — R2 reference surface. */
  workingText(message: M): string;
  /** Role source. */
  role(message: M): string | undefined;
  /** Tool-result ids carried by this message. */
  toolResultIds(message: M): readonly string[];
  /** True when this message is a working-face tool result. */
  isToolResult(message: M): boolean;
  /** Archivable full payload; absent → text (storage defaults). */
  payload(message: M): string | undefined;
}

/** Denormalize materialization — how a changed text lands back in the container. */
export interface DenormalizeShape<M> extends MessageShape<M> {
  /** Append one text line to the container (echo append; stale seam lines stripped in place). */
  appendLine(message: M, line: string): M;
  /** Replace the message content with a single text. */
  replaceWithText(message: M, text: string): M;
}

/**
 * Normalize a platform transcript to the echo contract. One
 * implementation for both faces; the shape descriptor supplies the reads.
 */
export function normalizeToEchoMessages<M>(messages: readonly M[], shape: MessageShape<M>): EchoMessage[] {
  return messages.map((m) => {
    const resultIds = shape.toolResultIds(m);
    return {
      role: shape.role(m),
      text: shape.workingText(m),
      isToolResult: shape.isToolResult(m),
      toolResultIds: resultIds,
    };
  });
}

/** True when the chain's new text ends with an appended echo line (glyph-anchored or bare marker). */
export function isEchoAppend(text: string): boolean {
  const last = text.split('\n').at(-1)?.trim() ?? '';
  return isSeamLine(last);
}

/** Denormalize classification for one changed message. */
export type DenormalizeKind = 'unchanged' | 'echoAppend' | 'replacement';

/**
 * Classify a changed message by its new text (shared both faces). The
 * echo-only chain only ever appends lines or replaces text, so the
 * classification is append-vs-replacement (the R2 reduction-marker
 * precedence is gone with the suspended reference machinery).
 */
export function classifyDenormalize(before: string, after: string): DenormalizeKind {
  if (before === after) return 'unchanged';
  return isEchoAppend(after) ? 'echoAppend' : 'replacement';
}

/**
 * Denormalize the chain result back to platform shapes. Unchanged
 * messages keep their original object identity; a changed message is
 * classified by its new text: an appended echo line → container append
 * via the shape seam (stale seam lines stripped in place), any other
 * change → single-text replacement.
 */
export function denormalizeMessages<M>(
  messages: readonly M[],
  echoMessages: readonly EchoMessage[],
  result: readonly EchoMessage[],
  shape: DenormalizeShape<M>,
): M[] {
  return messages.map((m, i) => {
    const before = echoMessages[i]?.text ?? '';
    const after = result[i]?.text ?? '';
    const kind = classifyDenormalize(before, after);
    if (kind === 'unchanged') return m;
    if (kind === 'echoAppend') {
      const line = after.split('\n').at(-1) ?? '';
      return shape.appendLine(m, line);
    }
    return shape.replaceWithText(m, after);
  });
}

/**
 * Normalize ONE platform message to the echo contract — the single-message
 * form of `normalizeToEchoMessages`. Every field read is runtime-narrowed
 * through the shape descriptor. A message WITHOUT readable content
 * normalizes to `undefined` (callers no-op for it).
 *
 * @param message — one platform payload (runtime-narrowed via the shape).
 * @param shape — the face's container descriptor.
 */
export function normalizeOneToEchoMessage<M>(message: M, shape: MessageShape<M>): EchoMessage | undefined {
  const resultIds = shape.toolResultIds(message);
  const payload = shape.payload(message) ?? shape.text(message) ?? undefined;
  if (shape.text(message) === null && payload === undefined) return undefined;
  return {
    role: shape.role(message),
    text: shape.workingText(message),
    isToolResult: shape.isToolResult(message),
    toolResultIds: resultIds,
  };
}

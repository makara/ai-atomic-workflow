/**
 * Parametric container shape operations — the adapter-local shape work
 * converges HERE as ONE implementation shared by both platform faces:
 * text join, working-face text, tool-result id scan, tool-result
 * classification, and seam-line append. The platform containers (OMP
 * content blocks vs opencode parts) become thin predicates/wiring over
 * these ops; the descriptors (`OMP_SHAPE` / `OPENCODE_SHAPE`) hold only
 * the face-specific reads.
 *
 * R2-only ops (error classification `isErrorChunk`, the `GRAPH_FIDELITY_MODE`
 * env read) were removed with the R2/R1 decoupling (ADR 0175).
 *
 * Pure: no platform imports, no I/O.
 *
 * @module
 */

import { SEAM_MARKER, stripSeamLines } from './discipline.js';

/** Chunk-like container element — duck-typed block/part record (all reads runtime-narrowed). */
export interface ChunkLike {
  type?: unknown;
  text?: unknown;
  content?: unknown;
  toolCallId?: unknown;
  'tool-call-id'?: unknown;
}

/**
 * Record guard — single source for platform/consumer shape checks
 * (R-SDK5: consumer-local copies removed; SDK owns the guard).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Text chunk join — text-typed chunks joined with newlines; `null` when
 * no text chunk exists (the OMP string-content form is handled by the
 * adapter wrapper before this join runs).
 */
export function joinTextChunks(chunks: readonly unknown[]): string | null {
  const parts: string[] = [];
  for (const raw of chunks) {
    const chunk = raw as ChunkLike; // single narrowing point — all reads runtime-checked below
    if (chunk !== null && typeof chunk === 'object' && chunk['type'] === 'text' && typeof chunk['text'] === 'string') {
      parts.push(chunk['text']);
    }
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Working-face text — plain text PLUS tool-result chunk content.
 *
 * `includePlainText` mixes text chunks in (opencode: text parts + tool
 * parts in one pass); otherwise only tool-result chunks contribute with
 * the plain text as fallback (OMP: tool-result block contents only,
 * plain text fallback). Equivalent containers produce byte-identical
 * working text on both faces.
 */
export function joinWorkingText(
  chunks: readonly ChunkLike[],
  plainText: string | null,
  isToolResultChunk: (chunk: ChunkLike) => boolean,
  includePlainText: boolean,
): string {
  const out: string[] = [];
  for (const chunk of chunks) {
    if (chunk === null || typeof chunk !== 'object') continue;
    if (includePlainText && chunk['type'] === 'text' && typeof chunk['text'] === 'string' && chunk['text'].length > 0) {
      out.push(chunk['text']);
      continue;
    }
    if (isToolResultChunk(chunk)) {
      const field = typeof chunk['text'] === 'string' ? chunk['text'] : chunk['content'];
      if (typeof field === 'string' && field.length > 0) out.push(field);
    }
  }
  if (out.length > 0) return out.join('\n');
  return plainText ?? '';
}

/**
 * Tool-result id scan — ids carried by non-call chunks (the face's
 * `isCallChunk` predicate skips assistant call blocks/parts so result ids
 * never alias call ids). Reads `toolCallId` with the kebab-case fallback;
 * non-string ids are ignored (no crash, no match — passthrough).
 */
export function toolResultIdsOf(
  chunks: readonly ChunkLike[],
  isCallChunk: (chunk: ChunkLike) => boolean,
): readonly string[] {
  const ids: string[] = [];
  for (const chunk of chunks) {
    if (chunk === null || typeof chunk !== 'object') continue;
    if (isCallChunk(chunk)) continue;
    const id = chunk['toolCallId'] ?? chunk['tool-call-id'];
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

/**
 * Tool-result classifier — the platform toolResult role OR a user-role
 * message carrying tool-result evidence (the face supplies the evidence
 * predicate over its own container). One implementation for both faces.
 */
export function isToolResultMessage(role: string | undefined, hasToolResult: boolean): boolean {
  return role === 'toolResult' || (role === 'user' && hasToolResult);
}

/** One chunk-list append target — ordered; the first usable target wins. */
export interface ChunkAppendTarget<M, C extends ChunkLike> {
  /** The chunk list to strip + append into; `undefined` = absent. */
  readonly chunks: readonly C[] | undefined;
  /** Rebuild the message with the chunk list replaced. */
  readonly rebuild: (chunks: Array<C>) => M;
  /** Append into an EMPTY-but-present list (opencode parts / OMP parts branch). */
  readonly useWhenEmpty?: boolean;
}

/**
 * Append one text line to a container — strip stale seam lines from the
 * winning chunk list's text chunks, append a fresh text chunk. The first
 * usable target wins (non-empty by default; `useWhenEmpty` targets apply
 * even when empty); the string-content fallback strips + appends when no
 * chunk target applies. One implementation for both faces — the shape
 * descriptors supply only the targets + fallback.
 */
export function appendSeamLine<M, C extends ChunkLike>(
  message: M,
  line: string,
  targets: readonly ChunkAppendTarget<M, C>[],
  textContent: string,
  setText: (text: string) => M,
): M {
  for (const target of targets) {
    if (target.chunks === undefined) continue;
    if (target.chunks.length === 0 && target.useWhenEmpty !== true) continue;
    const stripped: C[] = target.chunks.map((c) => {
      const text = c?.['text'];
      if (
        c !== null &&
        typeof c === 'object' &&
        c['type'] === 'text' &&
        typeof text === 'string' &&
        text.includes(SEAM_MARKER)
      ) {
        return { ...c, text: stripSeamLines(text) };
      }
      return c;
    });
    return target.rebuild([...stripped, { type: 'text', text: line } as C]);
  }
  const base = textContent.length > 0 ? stripSeamLines(textContent) : '';
  return setText(base.length > 0 ? `${base}\n${line}` : line);
}

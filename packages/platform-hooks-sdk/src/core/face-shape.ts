/**
 * Per-dispatch platform face descriptor (sdk-hooks-capabilities) — the
 * lifecycle capability needs the platform's message shape (text/role/
 * append mechanics) to run the echo chain, but consumers must never
 * pass shape descriptors (card-3 closure, FR3). The ADAPTER owns the
 * platform knowledge, so it provides this service per dispatch —
 * the core stays zero-platform (the service carries a VALUE, no platform
 * import). Each adapter maps its concrete `DenormalizeShape<M>` to this
 * structural contract over `unknown` at the boundary (single narrowing
 * casts inside the adapter — its translation role; no double casts).
 *
 * Pure — no platform imports, no cross-module state.
 *
 * @module
 */

import { Context } from 'effect';
import type { DenormalizeShape } from './shapes.js';

/** The platform message-shape contract the lifecycle capability consumes (structural over unknown). */
export interface FaceShape {
  /** Joined text-only content — the echo/frame anchor surface. */
  text(message: unknown): string | null;
  /** Joined working text (text + tool-result content) — reference surface. */
  workingText(message: unknown): string;
  /** Role source. */
  role(message: unknown): string | undefined;
  /** Tool-result ids carried by this message. */
  toolResultIds(message: unknown): readonly string[];
  /** True when this message is a working-face tool result. */
  isToolResult(message: unknown): boolean;
  /** Append one text line to the container (echo append; stale seam lines stripped in place). */
  appendLine(message: unknown, line: string): unknown;
  /** Replace the message content with a single text. */
  replaceWithText(message: unknown, text: string): unknown;
}

/**
 * Map a container descriptor to the structural FaceShape contract (single
 * narrowing casts at the adapter boundary — its translation role; no double
 * casts). Single source — both adapters call this generic (sdk-slim-round5).
 */
export function toFaceShape<M>(shape: DenormalizeShape<M>): FaceShape {
  return {
    text: (m) => shape.text(m as M),
    workingText: (m) => shape.workingText(m as M),
    role: (m) => shape.role(m as M),
    toolResultIds: (m) => shape.toolResultIds(m as M),
    isToolResult: (m) => shape.isToolResult(m as M),
    appendLine: (m, line) => shape.appendLine(m as M, line),
    replaceWithText: (m, text) => shape.replaceWithText(m as M, text),
  };
}

/**
 * The active platform face's message container descriptor — provided by
 * the adapter before the chain runs. Absent (e.g. direct-dispatch
 * tests) → lifecycle echo degrades to pass-through (fail-open).
 */
export class FaceShapeService extends Context.Tag('FaceShape')<FaceShapeService, FaceShape>() {}

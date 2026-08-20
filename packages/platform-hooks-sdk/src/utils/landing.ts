/**
 * Canonical → landing translation (sdk-surface-convergence) — the
 * SDK-owned single home for converting a canonical `tool_result`
 * payload into the landing/transform input shape consumers reduce on
 * first sight. Consumers import this helper; no consumer holds a local
 * copy (FR3: zero platform-knowledge leakage, zero re-validation).
 *
 * Pure — no platform imports, no effect dependency.
 *
 * @module
 */

import type { CanonicalToolResult } from '../core/schemas.js';
import { isRecord } from '../core/shape-ops.js';
import { prefixClassOf, type ToolNamePrefixClass } from './tool-prefix.js';

/** Landing phase — a loose text-like content block (platform blocks carry type/text plus extras). */
export interface TextLikeBlock {
  readonly type?: string;
  readonly text?: string;
  [k: string]: unknown;
}

/** Landing transform input — the platform tool-result payload (adapter-normalized, Schema-decoded at the adapter boundary). */
export interface LandingTransformInput {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly content: readonly TextLikeBlock[];
  readonly isError: boolean;
  /** Tool-name prefix class derived from platform conventions — additive signal. */
  readonly toolNamePrefixClass?: ToolNamePrefixClass;
  /** Platform useless flag (L3 ownership stays platform-side; informational — the current adapter paths never set it; the consumer's protection branch reserves it for a future platform L3 face). */
  readonly useless?: boolean;
}

/**
 * Map a canonical `tool_result` payload to the landing input shape:
 * `{toolName, content?, args?, metadata?, isError?}` — the payload is
 * Schema-decoded at the adapter boundary, so no re-validation is needed.
 * Content blocks are normalized to `{ type, text }`-shaped records
 * (string content wraps to a single text block); non-record blocks pass
 * through loosely. The non-schema `toolCallId` defaults empty and the
 * `useless` flag never rides the canonical payload.
 */
export function toLandingInput(payload: CanonicalToolResult): LandingTransformInput {
  const content = Array.isArray(payload.content)
    ? payload.content.map((b) => ({ ...(isRecord(b) ? b : { text: String(b) }) }))
    : typeof payload.content === 'string'
      ? [{ type: 'text', text: payload.content }]
      : [];
  return {
    toolName: payload.toolName,
    toolCallId: '',
    input: isRecord(payload.args) ? payload.args : {},
    content,
    isError: payload.isError === true,
    toolNamePrefixClass: prefixClassOf(payload.toolName),
  };
}

/**
 * Canonical payload schemas — the single source of canonical payload
 * types AND the adapter-boundary decode contract (ADR 0199, R-SDK2).
 * Every formal canonical event has one Schema; inferred types replace
 * the former all-optional interfaces. Platform payloads are decoded
 * through these Schemas exactly once, at the adapter boundary —
 * consumer-side re-validation is unnecessary by construction.
 *
 * Schema.Struct ignores excess properties (onExcessProperty default):
 * adapter normalizers may carry extra identity fields (e.g.
 * toolCallId) without breaking decode.
 */

import { Data, Schema } from 'effect';
import type { CanonicalEvent } from './events.js';
import { isRecord } from './shape-ops.js';

/** Named decode failure — thrown by adapters when a platform payload fails the canonical Schema (loud, never silent drop). */
export class CanonicalError extends Data.TaggedError('CanonicalError')<{ message: string }> {}

export const CanonicalToolResultSchema = Schema.Struct({
  toolName: Schema.String,
  content: Schema.optional(Schema.Unknown),
  args: Schema.optional(Schema.Unknown),
  metadata: Schema.optional(Schema.Unknown),
  isError: Schema.optional(Schema.Boolean),
  errorShaped: Schema.optional(Schema.Boolean),
});
export type CanonicalToolResult = Schema.Schema.Type<typeof CanonicalToolResultSchema>;

export const CanonicalContextPayloadSchema = Schema.Struct({
  messages: Schema.Array(Schema.Unknown),
});
export type CanonicalContextPayload = Schema.Schema.Type<typeof CanonicalContextPayloadSchema>;

export const CanonicalUsagePayloadSchema = Schema.Struct({
  usage: Schema.optional(Schema.Unknown),
});
export type CanonicalUsagePayload = Schema.Schema.Type<typeof CanonicalUsagePayloadSchema>;

export const CanonicalUserInputSchema = Schema.Struct({
  text: Schema.String,
});
export type CanonicalUserInput = Schema.Schema.Type<typeof CanonicalUserInputSchema>;

export const CanonicalToolCallSchema = Schema.Struct({
  toolName: Schema.String,
  args: Schema.optional(Schema.Unknown),
});
export type CanonicalToolCall = Schema.Schema.Type<typeof CanonicalToolCallSchema>;

export const CanonicalEventStreamSchema = Schema.Struct({
  type: Schema.String,
  properties: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});
export type CanonicalEventStream = Schema.Schema.Type<typeof CanonicalEventStreamSchema>;

export const CanonicalChatMessageSchema = Schema.Struct({
  message: Schema.Unknown,
});
export type CanonicalChatMessage = Schema.Schema.Type<typeof CanonicalChatMessageSchema>;

export const CanonicalBeforeAgentStartSchema = Schema.Struct({
  systemPrompt: Schema.optional(Schema.Unknown),
  sessionId: Schema.optional(Schema.Unknown),
  system: Schema.optional(Schema.Unknown),
});
export type CanonicalBeforeAgentStart = Schema.Schema.Type<typeof CanonicalBeforeAgentStartSchema>;

export const CanonicalLifecycleEventSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown });
export type CanonicalLifecycleEvent = Schema.Schema.Type<typeof CanonicalLifecycleEventSchema>;

export const CanonicalSessionBeforeCompactSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown });
export type CanonicalSessionBeforeCompact = Schema.Schema.Type<typeof CanonicalSessionBeforeCompactSchema>;

export const CanonicalCredentialDisabledSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown });
export type CanonicalCredentialDisabled = Schema.Schema.Type<typeof CanonicalCredentialDisabledSchema>;

export const CanonicalToolApprovalRequestedSchema = Schema.Struct({
  type: Schema.optional(Schema.String),
  pattern: Schema.optional(Schema.Union(Schema.String, Schema.Array(Schema.String))),
  sessionID: Schema.optional(Schema.String),
  description: Schema.optional(Schema.Unknown),
});
export type CanonicalToolApprovalRequested = Schema.Schema.Type<typeof CanonicalToolApprovalRequestedSchema>;

/** Per-canonical-event payload schema registry — keyed by the catalog-derived canonical names. */
// TODO(any-boundary): Schema is invariant in its type params, so a
// heterogeneous schema map cannot be typed Schema<unknown, unknown>;
// Schema<any, any> is the registry escape hatch. Cleanup path: a
// typed lookup table keyed by CanonicalEvent (per-event decode fns).
export const CANONICAL_PAYLOAD_SCHEMAS = {
  context: CanonicalContextPayloadSchema,
  before_agent_start: CanonicalBeforeAgentStartSchema,
  user_input: CanonicalUserInputSchema,
  tool_call: CanonicalToolCallSchema,
  tool_result: CanonicalToolResultSchema,
  message_start: CanonicalUsagePayloadSchema,
  message_update: CanonicalUsagePayloadSchema,
  message_end: CanonicalUsagePayloadSchema,
  session_shutdown: CanonicalLifecycleEventSchema,
  session_before_compact: CanonicalSessionBeforeCompactSchema,
  before_provider_request: CanonicalLifecycleEventSchema,
  after_provider_response: CanonicalLifecycleEventSchema,
  chat_message: CanonicalChatMessageSchema,
  credential_disabled: CanonicalCredentialDisabledSchema,
  tool_approval_requested: CanonicalToolApprovalRequestedSchema,
  event: CanonicalEventStreamSchema,
} as const satisfies Record<CanonicalEvent, Schema.Schema<any, any>>;

/** Schema of a canonical event's payload — undefined = unknown event (defensive). */
// TODO(any-boundary): see CANONICAL_PAYLOAD_SCHEMAS registry note —
// same variance reason for the return type.
export function canonicalPayloadSchema(name: CanonicalEvent): Schema.Schema<any, any> {
  return CANONICAL_PAYLOAD_SCHEMAS[name] ?? Schema.Unknown;
}

/**
 * Decode a (normalized) platform payload through the canonical Schema.
 * Single validation point — adapters call this once per event; a decode
 * failure throws CanonicalError (loud, named — never a silent drop).
 */
export function decodeCanonicalPayload(name: CanonicalEvent, payload: unknown): unknown {
  const decode = Schema.decodeUnknownSync(canonicalPayloadSchema(name));
  try {
    return decode(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CanonicalError({ message: `Canonical payload decode failed for ${name}: ${message}` });
  }
}

/**
 * Encode a canonical result for platform delivery (R-SDK2 delivery
 * encode). Canonical PARTIAL records (OMP merge keys / opencode outKey
 * objects) are validated against the canonical Schema's partial form —
 * present fields checked, excess stripped, missing fields allowed
 * (partials by design). Surface values (arrays/primitives — the
 * opencode outKey contract writes the value itself) pass through
 * unencoded. A value violating its own field schemas throws
 * CanonicalError (loud, never silently written).
 */
export function encodeCanonicalPayload(name: CanonicalEvent, value: unknown): unknown {
  // Bare arrays/primitives are surface values (opencode outKey contract)
  // — pass through unencoded; only canonical partial RECORDS validate.
  if (value === undefined || Array.isArray(value) || !isRecord(value)) return value;
  const encode = Schema.encodeUnknownSync(Schema.partial(canonicalPayloadSchema(name)));
  try {
    return encode(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CanonicalError({ message: `Canonical payload encode failed for ${name}: ${message}` });
  }
}

/**
 * Interface-layer data contracts — the crossing payload shapes of the
 * SignalLifecycle / DisplayFeedback contracts, expressed as effect Schema
 * (ADR 0176, Q2: Schema defines the interface shape; implementations stay
 * pure functions with zero runtime overhead on the echo path — the Schema
 * objects are consumed by the contract tests, never by the runtime
 * bundle).
 *
 * Type-only consumption: adapters and the additional package import the
 * derived types (`S.Schema.Type`) via `./types.js` — erased at build, so
 * the interface surface carries zero runtime code and the additional
 * module's type-only docking never violates the self-containment
 * contract (ADR 0166).
 *
 * Pure: no platform imports.
 *
 * @module
 */

import { Schema as S } from 'effect';

/** Echo message shape — the crossing contract of the discipline core. */
export const EchoMessageContract = S.Struct({
  role: S.optional(S.String),
  text: S.optional(S.String),
  isToolResult: S.optional(S.Boolean),
  toolResultIds: S.optional(S.Array(S.String)),
});
export type EchoMessageContractType = S.Schema.Type<typeof EchoMessageContract>;

/** Run-frame reference — the echo identity source. */
export const FrameRefContract = S.Struct({
  index: S.Number,
  runId: S.String,
  nodeId: S.String,
  progress: S.optional(S.String),
});
export type FrameRefContractType = S.Schema.Type<typeof FrameRefContract>;

/** PCL mark record — the R1 observability audit payload. */
export const PclMarkContract = S.Struct({
  text: S.String,
  matched: S.String,
});
export type PclMarkContractType = S.Schema.Type<typeof PclMarkContract>;

/** Audit record — the DisplayFeedback.audit crossing payload (type-keyed union: today's PCL mark; the R2 redesign extends the union). */
export const AuditRecordContract = S.Struct({
  type: S.Literal('graph-fidelity.pcl'),
  payload: PclMarkContract,
});
export type AuditRecordContractType = S.Schema.Type<typeof AuditRecordContract>;

/** Hint result — the ToolHints crossing payload (kind + user-level guidance text). */
export const HintResultContract = S.Struct({
  kind: S.Literal('serena', 'jcodemunch'),
  text: S.String,
});
export type HintResultContractType = S.Schema.Type<typeof HintResultContract>;

/** Contract schema registry — the single validation surface for the contract tests. */
export const CONTRACT_SCHEMAS = {
  echoMessage: EchoMessageContract,
  frameRef: FrameRefContract,
  pclMark: PclMarkContract,
  auditRecord: AuditRecordContract,
  hintResult: HintResultContract,
} as const;

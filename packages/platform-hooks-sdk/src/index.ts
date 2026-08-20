/**
 * platform-hooks-sdk — unified platform hook contract + middleware
 * system (sdk-hooks-middleware). Core barrel: hook catalog (single
 * source), event directory, contract types, middleware chain registry
 * (hooks.<hook>.use(...)), composed services (DeliveryContext /
 * CanonicalEvent / module config), single execution face, bind registry,
 * built-in capabilities (hints / resident / lifecycle).
 */

export { bind } from './core/bind.js';
export type { BindResult, BindTag } from './core/bind.js';
export { createCapabilities, type Capabilities } from './core/capabilities.js';
export { CATALOG, FORMAL_CANONICALS } from './core/catalog.js';
export type { CanonicalName, CatalogEntry, CatalogStatus } from './core/catalog.js';
export { isErrorShapedContent } from './core/error-shape.js';
export { CANONICAL_EVENTS } from './core/events.js';
export type { CanonicalEvent } from './core/events.js';
export { FaceShapeService } from './core/face-shape.js';
export { createFeedbackChannel } from './core/feedback.js';
export type { FeedbackChannel, FeedbackLine } from './core/feedback.js';
export { createLifecycle, type LifecycleCapability, type LifecycleConfig } from './core/lifecycle.js';
export {
  BASE_HANDLER,
  CanonicalEventService,
  MiddlewareHookError,
  assertCanonicalHook,
  chainsOf,
  createHooks,
  foldMiddleware,
  type HookChain,
  type HookChains,
  type Hooks,
  type Middleware,
  type MiddlewareEnv,
} from './core/middleware.js';
export type { PendingInterfaceEntry, PendingPayloads } from './core/pending-interfaces.js';
export { NOOP_DELIVERY, runChainAsync } from './core/runtime.js';
export {
  CANONICAL_PAYLOAD_SCHEMAS,
  CanonicalBeforeAgentStartSchema,
  CanonicalChatMessageSchema,
  CanonicalContextPayloadSchema,
  CanonicalCredentialDisabledSchema,
  CanonicalError,
  CanonicalEventStreamSchema,
  CanonicalLifecycleEventSchema,
  CanonicalSessionBeforeCompactSchema,
  CanonicalToolApprovalRequestedSchema,
  CanonicalToolCallSchema,
  CanonicalToolResultSchema,
  CanonicalUsagePayloadSchema,
  CanonicalUserInputSchema,
  decodeCanonicalPayload,
  encodeCanonicalPayload,
} from './core/schemas.js';
export { isRecord } from './core/shape-ops.js';
export { DeliveryContext, OpencodeOptionsService } from './core/types.js';
export type {
  Adapter,
  CanonicalBeforeAgentStart,
  CanonicalChatMessage,
  CanonicalContextPayload,
  CanonicalCredentialDisabled,
  CanonicalEventStream,
  CanonicalLifecycleEvent,
  CanonicalPayloadOf,
  CanonicalSessionBeforeCompact,
  CanonicalToolApprovalRequested,
  CanonicalToolCall,
  CanonicalToolResult,
  CanonicalUsagePayload,
  CanonicalUserInput,
  DeliveryContextService,
  DenySnapshot,
  HandlerResult,
  HookEvent,
  InterceptResult,
  OpencodeAdapterOptions,
  ToolDeny,
  WriteInvocation,
} from './core/types.js';

// ── Signal chain (R1, migrated from graph-fidelity, ADR 0195) ────────

export type { ClassificationResult, ToolMap } from './core/classify.js';
export {
  RESIDENT_HEADING,
  RESIDENT_MARKER,
  applyResidentBlock,
  applyResidentToSystem,
  createResident,
  joinPartial,
  renderResidentBlock,
  stripResidentLines,
  type ResidentCapability,
  type ResidentConfigValue,
  type ResidentPrompt,
} from './core/resident.js';
export {
  SCENARIO_HINT_BLOCK_SCHEMA,
  SCENARIO_IDS,
  createHints,
  type HintDisplayContext,
  type HintDisplayFn,
  type HintsCapability,
  type ScenarioHintBlock,
  type ScenarioId,
} from './core/scenarios.js';
export { joinTextChunks, type ChunkLike } from './core/shape-ops.js';
export { parseUsageFacts, type UsageFacts } from './core/signal-lifecycle.js';

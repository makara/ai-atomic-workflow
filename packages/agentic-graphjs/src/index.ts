/**
 * A durable-step graph runtime: channels folded by reducers, a super-step
 * interpreter over a compiled graph, router edges, and checkpointed
 * persistence. The DI base is Awilix — the convenience face registers
 * the seven port tokens — while persistence, identity, and the clock arrive as
 * injected ports, and a node carries an opaque payload rather than any
 * format-level meaning.
 *
 * This module carries the contract face every other module compiles against:
 * the entry, the contract types, the build face, the refusal codes, and the
 * in-memory implementations. The machinery — channels, reducers,
 * planning, stepping, settlement, persistence, serialization — rides
 * `agentic-graphjs/internal`, so this root stays the test face and the semver
 * face rather than a restatement of the implementation.
 *
 * @module
 */
export { Annotation, Command, GraphBuildError, StateGraph } from './build/graph.js';
export type {
  ChannelAnnotation,
  CommandInit,
  GraphBuildCode,
  InterruptCall,
  LoopDeclaration,
  NodeDeclaration,
  RouterMap,
  StateShape,
} from './build/graph.js';
export type {
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointTuple,
  PendingWrite,
  ThreadConfig,
} from './contract/checkpoint.js';
export type {
  ArtifactRef,
  ClockPort,
  IdentityPort,
  LogEntry,
  OutcomeEntry,
  ProgressEntry,
  Receipt,
} from './contract/log.js';
export { PORTS } from './contract/ports.js';
export type {
  GraphSource,
  LoggerPort,
  PortRow,
  PortToken,
  RuntimeContext,
  RuntimeDeps,
  StorePort,
  WriterPort,
} from './contract/ports.js';
export type { CheckpointSaver, LogRecord, RecordLogPort } from './contract/records.js';
export type { ReportInput } from './contract/report.js';
export { runtimeContainer, runtimeRegistrations } from './entry/container.js';
export type { PortFactory, PortType, RuntimeCradle } from './entry/container.js';
export { createRuntime } from './entry/runtime.js';
export type { ReportResult, RewindResult, Runtime, TakeResult } from './entry/runtime.js';
export { emptyStatus, statusOf } from './entry/status.js';
export type { RunStatus, StatusReceipt, StatusSettlement, StatusStep } from './entry/status.js';
export { END, IR_VERSION, START, validateGraph } from './ir.js';
export type {
  ChannelSource,
  ChannelSpec,
  CompiledGraph,
  EdgeKind,
  EdgeSpec,
  Json,
  KeySpec,
  LoopSpec,
  NodeRef,
  NodeSpec,
  NodeType,
  PermissionMode,
  PermissionModel,
  ReducerId,
  ValidationCode,
  ValidationFault,
} from './ir.js';
export { createMemoryLog, createMemorySaver } from './persist/memory-saver.js';
export type { MemorySaverPorts } from './persist/memory-saver.js';
export { INFRA, REFUSALS, REFUSAL_CODES, refuse } from './refusals.js';
export type { RefusalCode, RefusalInfo, RefusalPayload } from './refusals.js';
export type { JudgePort, JudgeRequest, StateSnapshot } from './settle/judge.js';
export type { SettleWarning } from './settle/settle.js';
export { Suspended, interrupt } from './step/interrupt.js';
export type { Suspension } from './step/interrupt.js';

/**
 * The internal face: the mechanism a same-repo consumer or an in-package test reaches for.
 *
 * The public face (`.`) stays minimal: the entry, the contract types, the build face,
 * the refusal codes, and the in-memory implementations. Everything that is machinery — channels
 * and reducers, planning and stepping, settlement, persistence, serialization, and the judge
 * helpers — is here, so the root export is the test face and the semver face, never the
 * implementation's own size.
 *
 * The face is an explicit name set: the re-exported root names and the machinery
 * names are declared name by name — no wildcard rides this file, so a new root export never
 * lands here by accident. `resume` retired with the sweep: the replay reads it from its own
 * module directly, and nothing on either consumer face imported it from here.
 *
 * @module
 */
export type { ChannelState, ChannelValue, ChannelWrite } from './contract/channels.js';
export type { SaverPorts } from './contract/records.js';
export { ChannelError, applyWrite, applyWrites, foldWrites, initialState } from './fold/channels.js';
export type { ChannelFaultCode } from './fold/channels.js';
export { REDUCERS, REDUCER_EMPTY, ReducerError, reduce, sameValue } from './fold/reducers.js';
export type { Reducer, ReducerFaultCode } from './fold/reducers.js';
export {
  Annotation,
  END,
  GraphBuildError,
  IR_VERSION,
  REFUSALS,
  REFUSAL_CODES,
  START,
  StateGraph,
  createMemoryLog,
  createMemorySaver,
  createRuntime,
  refuse,
  runtimeContainer,
  validateGraph,
} from './index.js';
export type {
  ChannelSpec,
  Checkpoint,
  CheckpointMetadata,
  CheckpointSaver,
  CompiledGraph,
  GraphSource,
  Json,
  JudgePort,
  JudgeRequest,
  KeySpec,
  NodeSpec,
  RecordLogPort,
  Runtime,
  RuntimeContext,
  RuntimeDeps,
  ThreadConfig,
} from './index.js';
export { SaverError, createCheckpointSaver, stateOf } from './persist/saver.js';
export type { SaverFaultCode } from './persist/saver.js';
export { serialize } from './persist/serialize.js';
export { mechanicalKey, readsOf } from './settle/judge.js';
export { settle } from './settle/settle.js';
export type { SettleAnswer, SettlePorts } from './settle/settle.js';
export { runNode } from './step/node.js';
export type { Settlement } from './step/node.js';
export { plan } from './step/plan.js';
export type { Task } from './step/plan.js';
export { RuntimeError, run, start } from './step/run.js';
export type { RunEvent, RunResult, RunState, RuntimeFaultCode } from './step/run.js';

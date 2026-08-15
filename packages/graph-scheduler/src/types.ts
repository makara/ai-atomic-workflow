/**
 * Cross-domain DTOs, error types, and internal domain types
 *
 * Canonical types for graph-scheduling domain. Public DTOs defined here;
 * FSM types live in fsm/; schema-validated types derived from schemas/.
 *
 * @module
 */

import type { FileSystemError } from './filesystem.js';
import type { FsmNodeState } from './fsm/effects.js';
import type { FsmState, WorkflowGraph } from './fsm/transition.js';
import type { NodeState, RegistryEntry } from './schemas/index.js';

/** run not found — askNext/getStatus/resume/abort when runId missing */
export interface NotFoundError {
  readonly _tag: 'NotFoundError';
  readonly runId: string;
  readonly message: string;
}

/** illegal state transition — e.g., notifyResult on completed run */
export interface InvalidStateError {
  readonly _tag: 'InvalidStateError';
  readonly runId: string;
  readonly currentStatus: string;
  readonly attemptedAction: string;
  readonly message: string;
}

/** graph definition error — schema validation failure, file not found */
export interface GraphDefinitionError {
  readonly _tag: 'GraphDefinitionError';
  readonly graphName: string;
  readonly message: string;
  readonly violations?: ReadonlyArray<string>;
}

/** flow flattening error — dynamic expression, max depth, name conflict, missing child graph.
 *  Error subclass — carries .stack/.name, satisfies instanceof Error guards. */
export class FlowPhaseError extends Error {
  readonly _tag = 'FlowPhaseError' as const;
  constructor(
    readonly phaseId: string,
    readonly code:
      'DYNAMIC_EXPRESSION' | 'MAX_DEPTH_EXCEEDED' | 'NAME_CONFLICT' | 'GRAPH_NOT_FOUND' | 'BARE_GRAPH_CHANNEL',
    message: string,
  ) {
    super(message);
    this.name = 'FlowPhaseError';
  }
}

/** persistence error — libsql write/read failure */
export interface PersistenceError {
  readonly _tag: 'PersistenceError';
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}

/** run mode missing/invalid at graph_start — activation requires args.mode (manual | auto) */
export interface ModeRequiredError {
  readonly _tag: 'ModeRequiredError';
  readonly graphName: string;
  readonly message: string;
}

/** Union of all scheduler operation errors */
export type SchedulerError =
  | NotFoundError
  | InvalidStateError
  | GraphDefinitionError
  | FlowPhaseError
  | PersistenceError
  | FileSystemError
  | RegistryLoadError
  | DispatchConfigError
  | ModeRequiredError;

/** graph/registry contract violation at dispatch time — missing entry skill, unregistered phase type.
 *  Replaces the silent three-layer fallback: agent phases SHALL declare explicit entry skill. */
export class DispatchConfigError extends Error {
  readonly _tag = 'DispatchConfigError' as const;

  constructor(message: string) {
    super(message);
    this.name = 'DispatchConfigError';
  }
}

/** NodeDetail construction input — single object, all fields required; args matches GraphRun (null when absent). */
export interface NodeDetailInput {
  readonly phaseId: string;
  readonly nodeState: FsmNodeState;
  readonly graph: WorkflowGraph;
  readonly args: Record<string, unknown> | null;
  /**
   * Project-level ambient context (config.json `context`) — default layer of
   * the global channel, merged with the graph's `context:` at dispatch.
   * Absent → empty project scope.
   */
  readonly projectContext?: readonly string[];
}

/** Next-node construction input — single object, all fields required; args matches GraphRun (null when absent). */
export interface NextNodeInput {
  readonly runId: string;
  readonly state: FsmState;
  readonly graph: WorkflowGraph;
  readonly args: Record<string, unknown> | null;
}

/** runtime assembly failure — database open, DDL, or layer wiring */
export interface ConfigError {
  readonly _tag: 'ConfigError';
  readonly message: string;
  readonly cause?: unknown;
}

// Types derived from zod schema single source (z.infer) — shared definition with validation.
export type { Phase } from './schemas/index.js';

export type { NodeState } from './schemas/index.js';

export type { RegistryEntry } from './schemas/index.js';

/** Error when registry file is invalid or unreadable. */
export class RegistryLoadError {
  readonly _tag = 'RegistryLoadError' as const;

  constructor(
    readonly registryPath: string,
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

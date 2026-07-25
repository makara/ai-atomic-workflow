/**
 * Cross-domain DTOs, error types, and internal domain types
 *
 * Canonical types for graph-scheduling domain. Public DTOs defined here;
 * FSM types live in fsm/; schema-validated types derived from schemas/.
 *
 * @module
 */

import type { FileSystemError } from './filesystem.js';
import type { NodeState, RegistryEntry } from './schemas/index.js';
// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

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

/** persistence error — libsql write/read failure */
export interface PersistenceError {
  readonly _tag: 'PersistenceError';
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}

/** Union of all scheduler operation errors */
export type SchedulerError =
  NotFoundError | InvalidStateError | GraphDefinitionError | PersistenceError | FileSystemError | RegistryLoadError;

/** runtime assembly failure — database open, DDL, or layer wiring */
export interface ConfigError {
  readonly _tag: 'ConfigError';
  readonly message: string;
  readonly cause?: unknown;
}

// ---------------------------------------------------------------------------
// Cross-domain DTOs (graph-scheduling → platform-adapter)
// ---------------------------------------------------------------------------

/**
 * Graph run status snapshot — for resume decisions and status queries.
 */
export interface GraphStatus {
  /** graph name */
  readonly graphName: string;
  /** graph-level run status */
  readonly status: 'running' | 'completed' | 'failed' | 'paused';
  /** per-phase state map — key = phaseId */
  readonly phases: Record<string, NodeState>;
  /** run start time (ISO 8601) */
  readonly startedAt: string;
}

// ---------------------------------------------------------------------------
// Cross-domain DTOs (platform-adapter → graph-scheduling)
// ---------------------------------------------------------------------------

/**
 * Agent-reported node execution result.
 *
 * Carries only topological completion data — output lives in agent session,
 * not in graph-scheduler. See docs/reports §11.0.
 */
export interface NotifyPayload {
  /** run identifier */
  readonly runId: string;
  /** phase id */
  readonly nodeId: string;
  /** execution status */
  readonly status: 'done' | 'failed';
  /** execution duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Start a new graph run.
 */
export interface StartPayload {
  /** graph name — matches .taskflow.yaml name field */
  readonly graphName: string;
  /** invocation args — injected into interpolation context via {args.X} */
  readonly args: Record<string, unknown>;
}

/**
 * Human decision — collected by agent's question(),
 * carried as structured JSON in the agent session.
 */
export type ApprovalDecision =
  | { readonly action: 'continue'; readonly note?: string }
  | { readonly action: 'retry'; readonly note?: string }
  | { readonly action: 'jump'; readonly target: string; readonly note?: string };

// ---------------------------------------------------------------------------
// Internal types — graph-scheduling domain only
// ---------------------------------------------------------------------------

// Phase type — now derived from zod schema via schemas/phase.ts (z.infer)
export type { Phase } from './schemas/index.js';

/** graph-level run status */
export type RunStatus = 'running' | 'completed' | 'failed' | 'paused';

// NodeState type — now derived from zod schema via schemas/node-state.ts (z.infer)
export type { NodeState } from './schemas/index.js';

/**
 * Full run record — mirrors execution_runs SQLite table.
 */
export interface ExecutionRun {
  /** run identifier (UUID v4) */
  readonly runId: string;
  /** graph name */
  readonly graphName: string;
  /** run-level status */
  readonly status: RunStatus;
  /** invocation args (JSON) */
  readonly args?: Record<string, unknown>;
  /** creation time (ISO 8601) */
  readonly createdAt: string;
  /** last update time (ISO 8601) */
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// FSM types — canonical definitions live in fsm/ layer
// ---------------------------------------------------------------------------
// FsmState  → fsm/transition.ts (discriminated union)
// FsmEvent  → fsm/events.ts (discriminated union)
// TransitionResult → fsm/transition.ts
// FsmEffect → fsm/effects.ts

// ---------------------------------------------------------------------------
// Registry types — now derived from zod schema via schemas/registry-entry.ts (z.infer)
// Re-export removed during progressive migration; types defined inline below.
// ---------------------------------------------------------------------------

// RegistryEntry type — now derived from zod schema (z.infer)
export type { RegistryEntry } from './schemas/index.js';

/**
 * Registry file shape.
 * A registry is a JSON file containing an array of RegistryEntry objects.
 */
export interface Registry {
  entries: ReadonlyArray<RegistryEntry>;
}

/** Error when registry file is invalid or unreadable. */
export class RegistryLoadError {
  readonly _tag = 'RegistryLoadError' as const;

  constructor(
    readonly registryPath: string,
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

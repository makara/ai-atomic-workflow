/**
 * Cross-domain DTOs, error types, and internal domain types
 *
 * Canonical types for graph-scheduling domain. Public DTOs defined here;
 * schema-validated types derived from schemas/.
 *
 * @module
 */

import type { FileSystemError } from './filesystem.js';
import type { NodeState, RegistryEntry } from './schemas/index.js';

/** run not found — askNext/getStatus/resume/abort when runId missing */
export interface NotFoundError {
  readonly _tag: 'NotFoundError';
  readonly runId: string;
  readonly message: string;
}

/** illegal state transition — e.g., resume on completed run; message carries the phase-level detail */
export interface InvalidStateError {
  readonly _tag: 'InvalidStateError';
  readonly runId: string;
  readonly message: string;
}

/** graph definition error — schema validation failure, file not found */
export interface GraphDefinitionError {
  readonly _tag: 'GraphDefinitionError';
  readonly graphName: string;
  readonly message: string;
  readonly violations?: ReadonlyArray<string>;
}

/** flow flattening error — missing child graph. Only the constructed code remains;
 *  the former flatten-mechanism codes (dynamic expression, max depth, name
 *  conflict, bare channel) died with the v2 use-composition rewrite.
 *  Error subclass — carries .stack/.name, satisfies instanceof Error guards. */
export class FlowPhaseError extends Error {
  readonly _tag = 'FlowPhaseError' as const;
  constructor(
    readonly phaseId: string,
    readonly code: 'GRAPH_NOT_FOUND',
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

/** runtime assembly failure — database open, DDL, or layer wiring */
export interface ConfigError {
  readonly _tag: 'ConfigError';
  readonly message: string;
  readonly cause?: unknown;
}

/** Union of all scheduler operation errors — the single domain-error surface (adapter included). */
export type SchedulerError =
  | NotFoundError
  | InvalidStateError
  | GraphDefinitionError
  | FlowPhaseError
  | PersistenceError
  | FileSystemError
  | RegistryLoadError
  | ConfigError;

/** Error when registry file is invalid or unreadable. */
export class RegistryLoadError {
  readonly _tag = 'RegistryLoadError' as const;

  constructor(
    readonly registryPath: string,
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

/** Base NodeDetail — fields common to all phase types, set by graph-scheduler core. */
export interface IBaseNodeDetail {
  readonly nodeId: string;
  readonly type: string;
  /** upstream phase ids this phase depends on — from phase.dependsOn, present for all phase types (implicit upstream coverage verifiable at runtime) */
  readonly dependsOn?: readonly string[];
  /** execution skill — phase.skill, the skill that executes this phase's work (main type; optional) */
  readonly skill?: string;
  /** operation classes — phase operations declaration; evidence-only Tool usage check verification per declared class */
  readonly operations?: string[];
  /** Agent hints — priority-ordered sub-agent type preferences for main phases; advisory, consumed by skills when dispatching (fallback platform default) */
  readonly agent?: string[];
  /** graph-level constraints — `[graph]`-prefixed dispatch facts from the loaded graph definition; absent graph field → empty */
  readonly constraints?: string[];
  readonly retryCount: number;
}

/**
 * Unified NodeDetail DTO returned by graph_start / graph_advance / graph_jump.
 *
 * The dispatch handler skill is the constant 'atom-phase-handler' (agent-side
 * knowledge — not carried in the payload).
 */
export interface INodeDetail extends IBaseNodeDetail {
  /** main phase — task instruction text */
  readonly task?: string;
  /** template parameters — machine-declared `template_args` (router template
   *  nodes: `paths` = the candidate graphs, the selection-card option source —
   *  never parsed from task text; `questions` = caller-declared extra
   *  judgment entries `[{ prompt, condition }]` — the node has additional
   *  judgment and corresponding flow edges, prompt content and condition
   *  vocabulary come from the calling graph, never template semantics,
   *  accept-node consolidation; scope-entry nodes: `terminal` = the per-graph
   *  terminal name). The loop template_args shape does not
   *  exist (loop/rework semantics are flow self-edges — graph-flow). */
  readonly template_args?: {
    readonly paths?: readonly string[];
    readonly terminal?: string;
    readonly questions?: readonly { prompt: string; condition: string }[];
  };
  /** machine-declared decision options — default / choices / rework / direct_end; consumers route from this block, never task-text parsing */
  readonly completion: CompletionInfo;
  /** All types — effective channel patterns (scheduler-side scope merge: project → graph → flow → phase) */
  readonly channels?: readonly string[];
}

/**
 * Machine-declared completion options for a dispatched node — derived at
 * compile time from the flow transition table (the node's labeled outgoing
 * flow-edge conditions = the flow-defined condition vocabulary) plus explicit
 * `direct end:` task-text declarations. The pilot routes decisions from this
 * block; it never parses the task text for options (the backtick channel is
 * retired — loop/rework semantics are flow self-edges, graph-flow capability).
 */
export interface CompletionInfo {
  /** default action — always 'continue' (no branch) */
  readonly default: 'continue';
  /** flow condition vocabulary of the node's labeled outgoing edges — the
   *  machine-declared card options (reported as the advance `condition`
   *  value on advance; absent when the node has no labeled flow edges —
   *  sequence default) */
  readonly choices?: readonly string[];
  /** declared `direct end: <label>` label — the final confirm card offers the direct-end option */
  readonly direct_end?: string;
}

/** Run summary — returned by graphList (single canonical shape). */
export interface RunSummary {
  readonly runId: string;
  readonly graphName: string;
  readonly fsmState: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// Types derived from zod schema single source (z.infer) — shared definition with validation.
export type { Phase } from './schemas/index.js';

export type { NodeState } from './schemas/index.js';

export type { RegistryEntry } from './schemas/index.js';

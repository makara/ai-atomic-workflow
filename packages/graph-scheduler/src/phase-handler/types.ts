/**
 * PhaseHandler types — PhaseHandler interface, BaseNodeDetail, NodeDetail DTO, error types.
 *
 * Core abstraction for phase type plug-in system. Each phase type implements
 * PhaseHandler and registers via PhaseHandlerRegistry at runtime init.
 * FSM/topology/DB layers never reference concrete handlers — only this interface.
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';

// ---------------------------------------------------------------------------
// PhaseHandler
// ---------------------------------------------------------------------------

/**
 * Phase handler — implemented once per supported phase type.
 *
 * Registered via PhaseHandlerRegistry at createRuntime(). graph-scheduler core
 * never imports concrete handlers — only this interface.
 */
export interface IPhaseHandler {
  /** Phase type string — e.g. "agent", "approval", "gate", "map" */
  readonly phaseType: string;

  /**
   * Validate phase-specific fields.
   * Base fields (id, dependsOn) validated by core schema.
   * Called after schema.parse() but before normalize().
   * Throws PhaseHandlerError on validation failure.
   */
  validate(phase: Phase): Phase;

  /**
   * Normalize phase — fill defaults, coerce legacy shapes.
   * Called after validate(), before FSM.
   */
  normalize(phase: Phase): Phase;

  /**
   * Extend the base NodeDetail with type-specific fields.
   * Base fields (nodeId, type, handlerSkill, entrySkill, agent, retryAttempt) set by core.
   * Handler adds type-specific fields (task, topic, routes, context, eval, etc.).
   * @since ADR 0028 — `strategy` removed; `skill` split into handlerSkill + entrySkill.
   */
  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, nodeState: IFsmNodeState): Partial<INodeDetail>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Apply default retry ({@link RetryConfig.max} = 0) when phase has no retry config.
 * Shared by all phase handler normalize() implementations — avoids DRY violation
 * across handler types.
 */
export function applyDefaultRetry(phase: Phase): Phase {
  return {
    ...phase,
    retry: phase.retry ?? { max: 0 },
  };
}

// ---------------------------------------------------------------------------
// BaseNodeDetail
// ---------------------------------------------------------------------------

/** Base NodeDetail — fields common to all phase types, set by graph-scheduler core. */
export interface IBaseNodeDetail {
  readonly nodeId: string;
  readonly type: string;
  /** handler skill — handles MCP response data, organizes context, dispatches sub-agents (from agentRegistry.skill) */
  readonly handlerSkill: string;
  /** entry skill — the target skill for task() execution (from phase.skill ?? agentRegistry.skill) */
  readonly entrySkill: string;
  /** sub-agent type for task() dispatch (e.g. "task", "scout") */
  readonly agent?: string;
  /** when guard — natural-language skip condition (ADR 0036 D2) */
  readonly when?: string;
  readonly retryAttempt: number;
}

// ---------------------------------------------------------------------------
// NodeDetail — unified DTO
// ---------------------------------------------------------------------------

/**
 * Unified NodeDetail DTO returned by graph_start / graph_advance.
 *
 * All phase-type-specific fields are optional — handler fills what it needs.
 * Was: type field was TypeScript union 'agent' | 'approval'.
 * Now: type is string — PhaseHandlerRegistry is the enforcement mechanism.
 */
export interface INodeDetail {
  readonly nodeId: string;
  readonly type: string;
  /** handler skill — from agentRegistry.skill (Layer 1+2) */
  readonly handlerSkill: string;
  /** entry skill — from phase.skill ?? agentRegistry.skill (Layer 3 override) */
  readonly entrySkill: string;
  /** sub-agent type for task() dispatch (e.g. "task", "scout") */
  readonly agent?: string;
  /** agent registry name — surfaced by phase handler from base.agent */
  readonly agentName?: string;
  /** Agent phase — task instruction text */
  readonly task?: string;
  /** Approval phase — decision topic */
  readonly topic?: string;
  /** Approval phase — decision routing actions (replaces deprecated routes) */
  readonly routingActions?: ReadonlyArray<IApprovalAction>;
  /** Agent phase — file glob patterns resolved before sub-agent dispatch */
  readonly context?: string[];
  /** when guard — natural-language skip condition (ADR 0036 D2) */
  readonly when?: string;
  /** Gate phase (future) — zero-token eval checks */
  readonly eval?: ReadonlyArray<string>;
  readonly retryAttempt: number;
}

/**
 * Approval routing action — discriminated union.
 *
 * Replaces the shallow IRoute interface. `action` carries routing semantics
 * explicitly so handler never needs to guess intent from label text.
 */
export interface IApprovalAction {
  /** Routing semantics: continue → advance, retry → re-execute upstream, jump → go to target node */
  readonly action: 'continue' | 'retry' | 'jump';
  /** Jump target node ID — meaningful only when action='jump' */
  readonly target?: string;
  /** Display label used in question() options[].label */
  readonly label: string;
  /** Display description used in question() options[].description */
  readonly description: string;
}

/**
 * Approval decision — handler output after collecting user choice + custom input.
 *
 * Carries selected routing action plus the mandatory custom:true free-text from question().
 */
export interface IApprovalDecision {
  /** Chosen routing action */
  readonly action: 'continue' | 'retry' | 'jump';
  /** Jump target node ID — meaningful only when action='jump' */
  readonly target?: string;
  /** Free-text input from question() custom:true text box — semantics vary by action */
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// FsmNodeState — lightweight subset for handler consumption
// ---------------------------------------------------------------------------

/** Minimal FSM node state passed to handler.extendNodeDetail(). */
export interface IFsmNodeState {
  readonly status: string;
  readonly retryCount: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Thrown when an unregistered phase type is resolved. */
export class PhaseHandlerError extends Error {
  constructor(
    message: string,
    public readonly phaseType: string,
  ) {
    super(message);
    this.name = 'PhaseHandlerError';
  }
}

/** Thrown when resolvePhaseHandler encounters an unknown phase type. */
export class UnknownPhaseTypeError extends PhaseHandlerError {
  constructor(phaseType: string, registeredTypes: readonly string[]) {
    const registered = registeredTypes.join(', ');
    super(`Unknown phase type '${phaseType}'. Registered types: ${registered || '(none)'}`, phaseType);
    this.name = 'UnknownPhaseTypeError';
  }
}

/** Thrown when registerPhaseHandler registers a duplicate phaseType. */
export class DuplicatePhaseHandlerError extends PhaseHandlerError {
  constructor(phaseType: string, registeredTypes: readonly string[]) {
    const registered = registeredTypes.join(', ');
    super(`Duplicate phase handler for type '${phaseType}'. Already registered: ${registered}`, phaseType);
    this.name = 'DuplicatePhaseHandlerError';
  }
}

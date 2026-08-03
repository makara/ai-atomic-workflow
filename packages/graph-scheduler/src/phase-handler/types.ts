/**
 * PhaseHandler types — PhaseHandler interface, BaseNodeDetail, NodeDetail DTO, error types.
 *
 * Static type dispatch — main/approval handlers resolved by type at
 * dispatch (no registry service). FSM/topology/DB layers
 * never reference concrete handlers — only this interface.
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';
import type { RunMode } from '../types.js';

/**
 * Phase handler — implemented once per supported phase type.
 *
 * Resolved statically by type (main/approval) at dispatch — no registry.
 */
export interface IPhaseHandler {
  /** Phase type string — "main" or "approval" */
  readonly phaseType: string;

  /**
   * Validate phase-specific fields.
   * Base fields (id, dependsOn) validated by core schema.
   * Called after schema.parse().
   * Throws PhaseHandlerError on validation failure.
   */
  validate(phase: Phase): Phase;

  /**
   * Extend the base NodeDetail with type-specific fields.
   * Base fields (nodeId, type, handlerSkill, skill, retryAttempt) set by core.
   * Handler adds type-specific fields (task, topic, routingActions, preText, channels, eval, etc.).
   */
  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, nodeState: IFsmNodeState): Partial<INodeDetail>;
}

/** Base NodeDetail — fields common to all phase types, set by graph-scheduler core. */
export interface IBaseNodeDetail {
  readonly nodeId: string;
  readonly type: string;
  /** upstream phase ids this phase depends on — from phase.dependsOn, present for all phase types (implicit upstream coverage verifiable at runtime) */
  readonly dependsOn?: readonly string[];
  /** handler skill — constant 'atom-phase-handler' */
  readonly handlerSkill: string;
  /** execution skill — phase.skill, the skill that executes this phase's work (main type; optional) */
  readonly skill?: string;
  /** when guard — natural-language skip condition */
  readonly when?: string;
  /** project constraints — loaded from .graph-scheduler/constraints.md, same level as when */
  readonly constraints: readonly string[];
  /** Run Mode — run-level auto-approve mode, auto-supplied from the run record (never declarable in YAML) */
  readonly runMode: RunMode;
  readonly retryAttempt: number;
}

/**
 * Unified NodeDetail DTO returned by graph_start / graph_advance.
 *
 * All phase-type-specific fields are optional — handler fills what it needs.
 * type is the closed enum (main/approval/gate/flow — schema-enforced);
 * handlerSkill is the constant 'atom-phase-handler'.
 */
export interface INodeDetail {
  readonly nodeId: string;
  readonly type: string;
  /** upstream phase ids this phase depends on — from phase.dependsOn, present for all phase types */
  readonly dependsOn?: readonly string[];
  /** handler skill — constant 'atom-phase-handler' */
  readonly handlerSkill: string;
  /** execution skill — from phase.skill; the skill that executes this phase's work */
  readonly skill?: string;
  /** Agent hints — priority-ordered sub-agent type preferences for main phases; advisory, consumed by skills when dispatching */
  readonly agent?: string[];
  /** main phase — task instruction text */
  readonly task?: string;
  /** Approval phase — decision topic */
  readonly topic?: string;
  /** Approval phase — decision routing actions (replaces deprecated routes) */
  readonly routingActions?: ReadonlyArray<IApprovalAction>;
  /** Main phase — channel patterns (skill names, file globs, node:<id>) resolved against the execution skill contract before inline context assembly */
  readonly channels?: string[];
  /** Approval phase — decision-card pre-call text (never channel-resolved) */
  readonly preText?: string;
  /** when guard — natural-language skip condition */
  readonly when?: string;
  /** project constraints — from .graph-scheduler/constraints.md, all phase types carry */
  readonly constraints: readonly string[];
  /** Run Mode — run-level auto-approve mode, auto-supplied from the run record */
  readonly runMode: RunMode;
  /** Gate phase — eval conditions for machine auto-decision (no continue — auto-approval is a non-bypassable-gate violation) */
  readonly eval?: ReadonlyArray<IEvalCondition>;
  readonly retryAttempt: number;
}

/**
 * Eval condition — auto-decision rule evaluated by agent on gate nodes.
 *
 * When natural-language `when` condition matches upstream review output,
 * handler auto-produces IApprovalDecision with configured action.
 * Conditions evaluated in array order — first match short-circuits.
 */
export interface IEvalCondition {
  /** Natural-language condition — evaluated by agent via completion(smol) */
  readonly when: string;
  /** Auto-routing action when condition matches — continue rejected (silent gate bypass is unexpressible) */
  readonly action: 'retry' | 'jump';
  /** Target node ID for retry or jump. Routing targets SHALL be explicit; absent retry target degrades to continue. */
  readonly target?: string;
  /** Auto-decision note — injected as IApprovalDecision.note */
  readonly note?: string;
}

/**
 * Approval routing action — discriminated union.
 *
 * Replaces the shallow IRoute interface. `action` carries routing semantics
 * explicitly so handler never needs to guess intent from label text.
 */
export interface IApprovalAction {
  /** Routing semantics: continue → advance, retry → re-execute target, jump → go to target node */
  readonly action: 'continue' | 'retry' | 'jump';
  /** Target node ID for retry or jump. Routing targets SHALL be explicit; absent retry target degrades to continue (pilot fallback). */
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
  /** Target node ID for retry or jump. Routing targets SHALL be explicit; absent retry target degrades to continue. */
  readonly target?: string;
  /** Free-text input from question() custom:true text box — semantics vary by action */
  readonly note?: string;
  /** Chosen routing option label — distinguishes same-action options (e.g. two continues) */
  readonly label?: string;
}

/** Minimal FSM node state passed to handler.extendNodeDetail(). */
export interface IFsmNodeState {
  readonly status: string;
  readonly retryCount: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
}

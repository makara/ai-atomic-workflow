/**
 * PhaseHandler types — PhaseHandler interface, BaseNodeDetail, NodeDetail DTO, error types.
 *
 * Static type dispatch — main/approval/gate handlers resolved by type at
 * dispatch (no registry service). FSM/topology/DB layers never reference
 * concrete handlers — only this interface.
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';

/**
 * Phase handler — implemented once per supported phase type.
 *
 * Resolved statically by type (main/approval/gate) at dispatch — no registry.
 */
export interface IPhaseHandler {
  /** Phase type string — "main", "approval" or "gate" */
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
   * Base fields (nodeId, type, skill, retryCount) set by core; the dispatch
   * handler skill is the constant atom-phase-handler (agent-side knowledge).
   * Handler adds type-specific fields (task, topic, routingActions,
   * channels, jumps, route, etc.).
   */
  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, nodeState: IFsmNodeState): Partial<INodeDetail>;
}

/** Base NodeDetail — fields common to all phase types, set by graph-scheduler core. */
export interface IBaseNodeDetail {
  readonly nodeId: string;
  readonly type: string;
  /** upstream phase ids this phase depends on — from phase.dependsOn, present for all phase types (implicit upstream coverage verifiable at runtime) */
  readonly dependsOn?: readonly string[];
  /** execution skill — phase.skill, the skill that executes this phase's work (main type; optional) */
  readonly skill?: string;
  /** operation classes — phase operations declaration (HLT closed set); handler injects registry entries + verifies per declared class */
  readonly operations?: string[];
  /** graph-level constraints — `[graph]`-prefixed dispatch facts from the loaded graph definition; absent graph field → empty */
  readonly constraints?: string[];
  readonly retryCount: number;
}

/**
 * Unified NodeDetail DTO returned by graph_start / graph_advance.
 *
 * All phase-type-specific fields are optional — handler fills what it needs.
 * type is the closed enum (main/approval/gate/flow — schema-enforced);
 * the dispatch handler skill is the constant 'atom-phase-handler' (agent-side
 * knowledge — not carried in the payload).
 */
export interface INodeDetail {
  readonly nodeId: string;
  readonly type: string;
  /** upstream phase ids this phase depends on — from phase.dependsOn, present for all phase types */
  readonly dependsOn?: readonly string[];
  /** execution skill — from phase.skill; the skill that executes this phase's work */
  readonly skill?: string;
  /** Agent hints — priority-ordered sub-agent type preferences for main phases; advisory, consumed by skills when dispatching */
  readonly agent?: string[];
  /** operation classes — phase operations declaration (HLT closed set); handler injects registry entries + verifies per declared class */
  readonly operations?: string[];
  /** main phase — task instruction text */
  readonly task?: string;
  /** Approval phase — decision topic */
  readonly topic?: string;
  /** Approval phase — decision routing actions (replaces deprecated routes) */
  readonly routingActions?: ReadonlyArray<IApprovalAction>;
  /** All types — effective channel patterns (scheduler-side scope merge: project → graph → flow → phase) */
  readonly channels?: string[];
  /** All types — graph-level constraints as dispatch facts: `[graph]`-prefixed entries read from the loaded graph definition (unbypassable; absent graph field → empty). Project-level rules are NOT carried here — they arrive via the agent-side activation session copy and are merged into the block by the dispatch handler. */
  readonly constraints?: string[];
  /** Gate phase — rework jumps (route-first): agent evaluates when against judgment context; hit → backward jump target */
  readonly jumps?: ReadonlyArray<IJumpCondition>;
  /** Route membership — all phase types (optional; absent = implicit default route) */
  readonly route?: string;
  readonly retryCount: number;
}

/**
 * Gate jump condition — rework rule evaluated by the agent.
 *
 * Natural-language `when` condition read against the judgment context
 * (direct dependsOn outputs + node: channels) + snapshot + run mode; a match
 * reports a backward jump to the explicit `to` target
 * (target + downstream terminal nodes reset, upstream kept). Conditions
 * evaluated in array order — first match wins; no match = pass through.
 * Targets SHALL be upstream terminal nodes (validator-enforced).
 */
export interface IJumpCondition {
  /** Natural-language condition — evaluated by agent (judgment stays agent-side) */
  readonly when: string;
  /** Explicit backward jump target node ID */
  readonly to: string;
}

/**
 * Approval routing action — decision option.
 *
 * Branch-route scenario only: declared actions carry `target` (route or node
 * id — activating a route, or a retry/jump re-run target) and `value` (stable
 * machine identifier for the persisted decision). The default approval card
 * is Accept + free input + AI-generated options — no declared actions needed.
 */
export interface IApprovalAction {
  /** Routing semantics: continue → advance, end → complete the run, retry → re-execute target, jump → go to target node */
  readonly action: 'continue' | 'retry' | 'jump' | 'end';
  /** Branch-route option target (continue, route or node id) or re-run target (retry/jump, node id) */
  readonly target?: string;
  /** Stable machine identifier — carried in the decision output */
  readonly value?: string;
  /** Display label used in approval() options[].label */
  readonly label: string;
  /** Display description used in approval() options[].description */
  readonly description: string;
}

/**
 * Approval decision — handler output after collecting user choice + custom input.
 *
 * Carries selected routing action plus the mandatory custom free-text from approval().
 */
export interface IApprovalDecision {
  /** Chosen routing action */
  readonly action: 'continue' | 'retry' | 'jump' | 'end';
  /** Branch-route target (continue) or re-run target (retry/jump) */
  readonly target?: string;
  /** Free-text input from approval() custom input — semantics vary by action */
  readonly note?: string;
  /** Chosen routing option label — distinguishes same-action options (e.g. two continues) */
  readonly label?: string;
  /** Chosen routing option value — stable machine identifier */
  readonly value?: string;
}

/** Minimal FSM node state passed to handler.extendNodeDetail(). */
export interface IFsmNodeState {
  readonly status: string;
  readonly retryCount: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

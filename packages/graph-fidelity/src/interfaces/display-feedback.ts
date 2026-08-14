/**
 * DisplayFeedback — the normative information display / feedback output
 * contract (ADR 0176): notify → display → audit.
 *
 * The base module implements audit (R1 observability — the PCL mark
 * record); notify / display are RESERVED for the additional module (R2
 * redesign — platform notification capability OMP `ctx.ui.notify` /
 * opencode toast delivered as adapter implementations of the same
 * contract).
 *
 * Contract rules (ADR 0176 / spec display-feedback-interface): feedback
 * SHALL avoid the LLM message channel except as the documented degrade
 * when no platform capability exists; audit SHALL execute independently
 * of display delivery — a display failure never drops the audit record
 * (audit never lost — platform law).
 *
 * @module
 */

import type { AuditRecordContractType } from './contracts.js';

/** Reserved: platform notification (additional module / R2 redesign). */
export interface NotifyInput {
  readonly text: string;
}

/** Reserved: display line (additional module / R2 redesign). */
export interface DisplayInput {
  readonly text: string;
}

/** Audit record — R1 observability (PCL mark). */
export interface AuditInput {
  readonly record: AuditRecordContractType;
}

/** The normative display/feedback contract. */
export interface DisplayFeedback {
  audit(input: AuditInput): void;
  /** Reserved — the additional module implements these against the same contract. */
  readonly notify?: (input: NotifyInput) => void;
  readonly display?: (input: DisplayInput) => void;
}

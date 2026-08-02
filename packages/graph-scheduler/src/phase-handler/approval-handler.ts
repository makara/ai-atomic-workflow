/**
 * Approval phase handler — validate, extendNodeDetail for "approval" type.
 *
 * Approval phases:
 * - No extra validation (task is optional — topic/routingActions/preText/eval synthesized)
 * - NodeDetail extends: topic (from task), routingActions, preText, eval
 * - eval: auto-decision conditions evaluated before question() — match → auto IApprovalDecision
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';
import type { IApprovalAction, IBaseNodeDetail, IFsmNodeState, INodeDetail, IPhaseHandler } from './types.js';

/**
 * Default approval actions — used when phase.routing is not configured.
 *
 * Contains only continue + retry. Jump is opt-in via phase.routing.actions
 * because jump without explicit target configuration is ambiguous.
 */
const DEFAULT_APPROVAL_ACTIONS: ReadonlyArray<IApprovalAction> = [
  { action: 'continue', label: 'Continue', description: 'Accept output, advance to next phase' },
  { action: 'retry', label: 'Retry', description: 'Re-execute the upstream phase with feedback' },
];

export const approvalPhaseHandler: IPhaseHandler = {
  phaseType: 'approval',

  validate(phase: Phase): Phase {
    // No extra validation — task is optional for approval
    return phase;
  },

  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, _nodeState: IFsmNodeState): Partial<INodeDetail> {
    const routing = phase.routing;
    return {
      topic: phase.task ?? 'Decision Required',
      routingActions: routing?.actions ?? DEFAULT_APPROVAL_ACTIONS,
      preText: phase.preText ?? `Phase: ${phase.id}. Output is ready for review.`,
      eval: phase.eval,
    };
  },
};

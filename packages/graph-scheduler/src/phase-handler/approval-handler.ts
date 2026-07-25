/**
 * Approval phase handler — validate, normalize, extendNodeDetail for "approval" type.
 *
 * Approval phases:
 * - No extra validation (task is optional — topic/routingActions/context synthesized)
 * - Default: retry.max = 0
 * - NodeDetail extends: topic, routingActions, context
 * - routingActions replaces the old routes field (IRoute deleted — no backward compat)
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';
import type { IApprovalAction, IBaseNodeDetail, IFsmNodeState, INodeDetail, IPhaseHandler } from './types.js';
import { applyDefaultRetry } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const approvalPhaseHandler: IPhaseHandler = {
  phaseType: 'approval',

  validate(phase: Phase): Phase {
    // No extra validation — task is optional for approval
    return phase;
  },

  normalize(phase: Phase): Phase {
    return applyDefaultRetry(phase);
  },

  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, _nodeState: IFsmNodeState): Partial<INodeDetail> {
    const routing = phase.routing;
    return {
      topic: phase.task ?? 'Decision Required',
      routingActions: routing?.actions ?? DEFAULT_APPROVAL_ACTIONS,
      context: routing?.context ?? [`Phase: ${phase.id}. Output is ready for review.`],
    };
  },
};

/**
 * Approval phase handler — validate, extendNodeDetail for "approval" type.
 *
 * Approval phases (route-first redesign):
 * - No extra validation (task is optional — topic synthesized)
 * - NodeDetail extends: topic (from task first line), routingActions
 *   (branch-route scenario only — declared actions pass through verbatim),
 *   channels (node:-only judgment context)
 * - Decision confirmation card: Accept (AI recommendation) + free input +
 *   AI-generated contextual options — the card is built agent-side
 *   (atom-phase-handler); the backend never invents written actions.
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail, IPhaseHandler } from './types.js';

export const approvalPhaseHandler: IPhaseHandler = {
  phaseType: 'approval',

  validate(phase: Phase): Phase {
    // No extra validation — task is optional for approval
    return phase;
  },

  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, _nodeState: IFsmNodeState): Partial<INodeDetail> {
    const routing = phase.routing;
    return {
      // Card header derives from the task's first line (schema field
      // convergence — task is the full card prompt; the handler skill
      // truncates to the header limit at display). Empty/blank task falls
      // back — a card always carries a header.
      topic: phase.task?.trim().split('\n')[0] || 'Decision Required',
      // Branch-route scenario only — undeclared approvals carry NO written
      // actions; the decision card is Accept + free input + AI options.
      routingActions: routing?.actions,
      channels: phase.channels,
    };
  },
};

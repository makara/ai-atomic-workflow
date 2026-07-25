/**
 * Agent phase handler — validate, normalize, extendNodeDetail for "agent" type.
 *
 * Agent phases:
 * - Require: task (non-empty string)
 * - Default: retry.max = 0
 * - NodeDetail extends: task, context, agentName (from base.agent / registry entry)
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail, IPhaseHandler } from './types.js';
import { applyDefaultRetry, PhaseHandlerError } from './types.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const agentPhaseHandler: IPhaseHandler = {
  phaseType: 'agent',

  validate(phase: Phase): Phase {
    if (!phase.task || phase.task.trim().length === 0) {
      throw new PhaseHandlerError(`Agent phase '${phase.id}': task is required and must be non-empty`, phase.type);
    }
    return phase;
  },

  normalize(phase: Phase): Phase {
    return applyDefaultRetry(phase);
  },

  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, _nodeState: IFsmNodeState): Partial<INodeDetail> {
    return {
      task: phase.task,
      context: phase.context,
      agentName: base.agent,
    };
  },
};

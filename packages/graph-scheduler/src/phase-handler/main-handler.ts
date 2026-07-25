/**
 * Main phase handler — validate, normalize, extendNodeDetail for "main" type.
 *
 * Main phases:
 * - Execute inline in the main agent process
 * - Require: task (non-empty string)
 * - Default: retry.max = 0
 * - NodeDetail extends: task
 *
 * @since ADR 0028
 * @module
 */

import type { Phase } from '../schemas/index.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail, IPhaseHandler } from './types.js';
import { applyDefaultRetry, PhaseHandlerError } from './types.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const mainPhaseHandler: IPhaseHandler = {
  phaseType: 'main',

  validate(phase: Phase): Phase {
    if (!phase.task || phase.task.trim().length === 0) {
      throw new PhaseHandlerError(`Main phase '${phase.id}': task is required and must be non-empty`, phase.type);
    }
    return phase;
  },

  normalize(phase: Phase): Phase {
    return applyDefaultRetry(phase);
  },

  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, _nodeState: IFsmNodeState): Partial<INodeDetail> {
    return {
      task: phase.task,
    };
  },
};

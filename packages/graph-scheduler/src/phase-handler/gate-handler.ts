/**
 * Gate phase handler — validate, extendNodeDetail for "gate" type.
 *
 * Gate phases:
 * - Machine-judgment node — eval conditions drive auto retry/jump; no decision card.
 * - Requires: eval (non-empty — schema enforces presence; validate enforces non-empty)
 * - NodeDetail extends: eval only — no task/topic/routingActions/preText (closed field surface)
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';
import { PhaseHandlerError } from './errors.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail, IPhaseHandler } from './types.js';

export const gatePhaseHandler: IPhaseHandler = {
  phaseType: 'gate',

  validate(phase: Phase): Phase {
    if (!phase.eval || phase.eval.length === 0) {
      throw new PhaseHandlerError(
        `Gate phase '${phase.id}': eval is required and must be non-empty (a gate without conditions is a silent pass-through)`,
        phase.type,
      );
    }
    return phase;
  },

  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, _nodeState: IFsmNodeState): Partial<INodeDetail> {
    return {
      eval: phase.eval,
    };
  },
};

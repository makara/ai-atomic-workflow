/**
 * Gate phase handler — validate, extendNodeDetail for "gate" type.
 *
 * Gate phases (route-first redesign):
 * - Pure rework node — the agent evaluates `jumps` (when conditions) against
 *   the judgment context (direct dependsOn outputs + node: channels +
 *   snapshot + run mode); a hit reports a backward jump to the target
 *   (target + downstream reset, upstream kept); no hit passes through.
 * - No forward routing, no decision card.
 * - Requires: jumps (non-empty — schema enforces presence; validate enforces
 *   non-empty)
 * - NodeDetail extends: jumps, channels — no task/topic/routingActions
 *   (closed field surface)
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';
import { PhaseHandlerError } from './errors.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail, IPhaseHandler } from './types.js';

export const gatePhaseHandler: IPhaseHandler = {
  phaseType: 'gate',

  validate(phase: Phase): Phase {
    if (!phase.jumps || phase.jumps.length === 0) {
      throw new PhaseHandlerError(
        `Gate phase '${phase.id}': jumps is required and must be non-empty (a gate without rework jumps is a silent pass-through — delete the gate)`,
        phase.type,
      );
    }
    return phase;
  },

  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, _nodeState: IFsmNodeState): Partial<INodeDetail> {
    return {
      jumps: phase.jumps,
      channels: phase.channels,
    };
  },
};

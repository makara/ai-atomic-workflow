/**
 * Main phase handler — validate, extendNodeDetail for "main" type.
 *
 * Main phases:
 * - Execute inline in the main agent process
 * - Require: task (non-empty string)
 * - NodeDetail extends: task, channels, agent (priority hint array — injected as
 *   `## Agent hints:` block by the handler main branch before task execution)
 *
 * @module
 */

import type { Phase } from '../schemas/index.js';
import { PhaseHandlerError } from './errors.js';
import type { IBaseNodeDetail, IFsmNodeState, INodeDetail, IPhaseHandler } from './types.js';

export const mainPhaseHandler: IPhaseHandler = {
  phaseType: 'main',

  validate(phase: Phase): Phase {
    if (!phase.task || phase.task.trim().length === 0) {
      throw new PhaseHandlerError(`Main phase '${phase.id}': task is required and must be non-empty`, phase.type);
    }
    return phase;
  },

  extendNodeDetail(base: IBaseNodeDetail, phase: Phase, _nodeState: IFsmNodeState): Partial<INodeDetail> {
    return {
      task: phase.task,
      channels: phase.channels,
      agent: phase.agent,
    };
  },
};

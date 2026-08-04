/**
 * PhaseHandler barrel — exports + static type dispatch.
 *
 * main/approval handlers are resolved statically by type — no registry
 * service (registry collapsed). Dispatch helpers live here:
 * resolvePhaseHandler (throws UnknownPhaseTypeError for unregistered types).
 *
 * @module
 */

export { approvalPhaseHandler } from './approval-handler.js';
export { PhaseHandlerError, UnknownPhaseTypeError } from './errors.js';
export { gatePhaseHandler } from './gate-handler.js';
export { mainPhaseHandler } from './main-handler.js';
export type {
  IApprovalAction,
  IApprovalDecision,
  IBaseNodeDetail,
  IFsmNodeState,
  INodeDetail,
  IPhaseHandler,
} from './types.js';

import type { Phase } from '../schemas/index.js';
import { approvalPhaseHandler } from './approval-handler.js';
import { UnknownPhaseTypeError } from './errors.js';
import { gatePhaseHandler } from './gate-handler.js';
import { mainPhaseHandler } from './main-handler.js';
import type { IPhaseHandler } from './types.js';

/**
 * Static handler map — single source for the enabled type set.
 *
 * Built-in dispatch types: main/approval/gate (always present). Flow is a
 * load-time composition type, not a dispatch type. Unknown types fail
 * via UnknownPhaseTypeError — never a silent pass-through.
 */
const HANDLERS: Readonly<Record<string, IPhaseHandler>> = {
  main: mainPhaseHandler,
  approval: approvalPhaseHandler,
  gate: gatePhaseHandler,
};

/** Resolve a phase handler by type — throws UnknownPhaseTypeError for unknown types. */
export function resolvePhaseHandler(phaseType: string): IPhaseHandler {
  const handler = HANDLERS[phaseType];
  if (!handler) {
    throw new UnknownPhaseTypeError(phaseType, Object.keys(HANDLERS));
  }
  return handler;
}

/** Run a phase through its handler's validate() — schema parse has already run. */
export function validatePhase(phase: Phase): Phase {
  return resolvePhaseHandler(phase.type).validate(phase);
}

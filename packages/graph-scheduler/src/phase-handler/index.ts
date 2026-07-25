/**
 * PhaseHandler barrel — exports + default registration Layer.
 *
 * Import registerDefaultPhaseHandlersLayer and compose into createRuntime() envLayer.
 * Replaces legacy registerDefaultPhaseHandlers() (global mutable state).
 *
 * @module
 */

export { agentPhaseHandler } from './agent-handler.js';
export { approvalPhaseHandler } from './approval-handler.js';
export { mainPhaseHandler } from './main-handler.js';
export { makePhaseHandlerRegistryLayer, makePhaseHandlerRegistryService, PhaseHandlerRegistry } from './registry.js';
export { DuplicatePhaseHandlerError, PhaseHandlerError, UnknownPhaseTypeError } from './types.js';
export type {
  IApprovalAction,
  IApprovalDecision,
  IBaseNodeDetail,
  IFsmNodeState,
  INodeDetail,
  IPhaseHandler,
} from './types.js';

import { Layer } from 'effect';
import { agentPhaseHandler } from './agent-handler.js';
import { approvalPhaseHandler } from './approval-handler.js';
import { mainPhaseHandler } from './main-handler.js';
import { makePhaseHandlerRegistryService, PhaseHandlerRegistry } from './registry.js';
import type { IPhaseHandler } from './types.js';

/**
 * Register all built-in phase handlers and return a Layer.
 *
 * Creates a fresh Map, registers main/agent/approval handlers directly,
 * and returns a Layer providing the populated PhaseHandlerRegistry.
 * Call once in createRuntime() — each call yields an independent registry.
 */
export function registerDefaultPhaseHandlersLayer(): Layer.Layer<PhaseHandlerRegistry, never, never> {
  const map = new Map<string, IPhaseHandler>();
  map.set(mainPhaseHandler.phaseType, mainPhaseHandler);
  map.set(agentPhaseHandler.phaseType, agentPhaseHandler);
  map.set(approvalPhaseHandler.phaseType, approvalPhaseHandler);
  return Layer.succeed(PhaseHandlerRegistry, makePhaseHandlerRegistryService(map));
}

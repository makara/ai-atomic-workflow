/**
 * PhaseHandlerRegistry — Effect-TS injectable service for phase handler
 * registration, resolution, and listing.
 *
 * Replaces module-level global HANDLER_MAP (Finding 3 fix).
 * Each createRuntime() creates a fresh Map via Layer.succeed,
 * injected through Context.Tag<PhaseHandlerRegistry>.
 * Duplicate registration is an explicit error — no silent skip.
 *
 * @module
 */

import { Context, Effect, Layer } from 'effect';
import type { IPhaseHandler } from './types.js';
import { DuplicatePhaseHandlerError, UnknownPhaseTypeError } from './types.js';

// ---------------------------------------------------------------------------
// Context.Tag
// ---------------------------------------------------------------------------

/**
 * PhaseHandlerRegistry Context.Tag — injectable per-runtime service.
 *
 * Three methods: registerPhaseHandler (Effect, fails on dup),
 * resolvePhaseHandler (Effect, fails on unknown type),
 * getRegisteredTypes (Effect, pure listing).
 *
 * Follows the same pattern as FileSystem, GraphRepository,
 * RegistryLoader, and AgentRegistryService.
 */
export class PhaseHandlerRegistry extends Context.Tag('PhaseHandlerRegistry')<
  PhaseHandlerRegistry,
  {
    readonly registerPhaseHandler: (handler: IPhaseHandler) => Effect.Effect<void, DuplicatePhaseHandlerError>;
    readonly resolvePhaseHandler: (phaseType: string) => Effect.Effect<IPhaseHandler, UnknownPhaseTypeError>;
    readonly getRegisteredTypes: () => Effect.Effect<readonly string[]>;
  }
>() {}

// ---------------------------------------------------------------------------
// Service factory (exported for pre-populated Layer construction)
// ---------------------------------------------------------------------------

/**
 * Create a PhaseHandlerRegistry service backed by the given Map.
 *
 * Exported so registerDefaultPhaseHandlersLayer() can create a pre-populated
 * Map and wrap it in Layer.succeed.
 */
export function makePhaseHandlerRegistryService(map: Map<string, IPhaseHandler>): PhaseHandlerRegistry['Type'] {
  return {
    registerPhaseHandler: (handler: IPhaseHandler): Effect.Effect<void, DuplicatePhaseHandlerError> =>
      Effect.sync(() => {
        if (map.has(handler.phaseType)) {
          return Effect.fail(new DuplicatePhaseHandlerError(handler.phaseType, [...map.keys()]));
        }
        map.set(handler.phaseType, handler);
        return Effect.void;
      }).pipe(Effect.flatten),

    resolvePhaseHandler: (phaseType: string): Effect.Effect<IPhaseHandler, UnknownPhaseTypeError> =>
      Effect.sync(() => {
        const handler = map.get(phaseType);
        if (!handler) {
          return Effect.fail(new UnknownPhaseTypeError(phaseType, [...map.keys()]));
        }
        return Effect.succeed(handler);
      }).pipe(Effect.flatten),

    getRegisteredTypes: () => Effect.sync(() => [...map.keys()]),
  };
}

/**
 * Create a Layer providing a fresh, empty PhaseHandlerRegistry.
 *
 * Call once per createRuntime() — each Layer yields an independent Map.
 */
export function makePhaseHandlerRegistryLayer(): Layer.Layer<PhaseHandlerRegistry, never, never> {
  const map = new Map<string, IPhaseHandler>();
  return Layer.succeed(PhaseHandlerRegistry, makePhaseHandlerRegistryService(map));
}

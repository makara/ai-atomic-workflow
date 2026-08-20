/**
 * Single async execution face (sdk-hooks-capabilities) — a chain runs as
 * ONE Effect awaited via Effect.runPromise on BOTH platform faces. The
 * OMP platform awaits handler promises (`ExtensionHandler =
 * (event, ctx) => Promise<R | void> | R | void`, awaited by the
 * extension runner), so the former sync face and its loud-failure
 * machinery (`runChainSync` / `LoudExecutionError` /
 * `isAsyncBlockingFailure`) were deleted — they existed for a
 * constraint that is not a platform law.
 *
 * Pure — no platform imports, no cross-module state.
 *
 * @module
 */

import { Effect } from 'effect';
import { NOOP_DELIVERY } from './services.js';
import { type CanonicalError, type HandlerResult } from './types.js';

/** Run a composed chain asynchronously — awaited, settled result delivered. */
export function runChainAsync(program: Effect.Effect<HandlerResult, CanonicalError, never>): Promise<unknown> {
  return Effect.runPromise(program);
}

export { NOOP_DELIVERY };

/**
 * Chain-dispatch helpers (sdk-hooks-capabilities test surface) — run a
 * wired hooks chain for one canonical event with the per-dispatch
 * services provided (CanonicalEventService + DeliveryContext), mirroring
 * the bind path the platform adapters use. Capability configuration is
 * captured at bind time by the capability objects — no config layers
 * exist (the former `layers` bind parameter is deleted). Chains run on
 * the single async face; a test-local sync runner covers pure-sync
 * chains.
 *
 * @module
 */

import {
  BASE_HANDLER,
  CanonicalEventService,
  DeliveryContext,
  foldMiddleware,
  NOOP_DELIVERY,
  runChainAsync,
  type CanonicalError,
  type CanonicalEvent,
  type DeliveryContextService,
  type HandlerResult,
  type Hooks,
  type MiddlewareEnv,
} from '@ai-atomic-workflow/platform-hooks-sdk';
import { Effect } from 'effect';

/** Build the per-dispatch program — chains folded around the base handler, event + delivery provided. */
function programFor(
  hooks: Hooks,
  name: CanonicalEvent,
  payload: unknown,
  ctx: DeliveryContextService,
): Effect.Effect<HandlerResult, CanonicalError, never> {
  const chain = hooks[name].chain;
  const program = foldMiddleware(chain)(BASE_HANDLER) as Effect.Effect<HandlerResult, CanonicalError, MiddlewareEnv>;
  return Effect.provideService(CanonicalEventService, { name, payload } as never)(
    Effect.provideService(DeliveryContext, ctx)(program),
  ) as Effect.Effect<HandlerResult, CanonicalError, never>;
}

/** Run a chain synchronously (test-only — pure-sync chains). */
export function dispatchChainSync(
  hooks: Hooks,
  name: CanonicalEvent,
  payload: unknown,
  ctx: DeliveryContextService = NOOP_DELIVERY,
): unknown {
  return Effect.runSync(programFor(hooks, name, payload, ctx));
}

/** Run a chain on the async face — awaited, settled result. */
export function dispatchChainAsync(
  hooks: Hooks,
  name: CanonicalEvent,
  payload: unknown,
  ctx: DeliveryContextService = NOOP_DELIVERY,
): Promise<unknown> {
  return runChainAsync(programFor(hooks, name, payload, ctx));
}

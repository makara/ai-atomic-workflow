/**
 * Shared dispatch test harness (sdk-slim-round5) — fold a middleware chain
 * over BASE_HANDLER, provide the per-dispatch services (OpencodeOptions,
 * CanonicalEvent, DeliveryContext), and run it. Single home for the
 * spyDelivery + foldMiddleware + provideService pattern that was copy-pasted
 * across SDK tests. Test-only — never part of the package surface.
 *
 * @module
 */
import { Effect } from 'effect';
import { vi } from 'vitest';
import { runChainAsync } from '../../src/core/runtime.js';
import {
  BASE_HANDLER,
  CanonicalEventService,
  DeliveryContext,
  NOOP_DELIVERY,
  OpencodeOptionsService,
  foldMiddleware,
  type DeliveryContextService,
  type HookEvent,
  type Middleware,
} from '../../src/index.js';

/** Spy delivery — records notify/appendEntry/mutate calls. */
export function spyDelivery() {
  const notify = vi.fn();
  const appendEntry = vi.fn();
  const mutate = vi.fn();
  const ctx = { notify, appendEntry, mutate } as unknown as DeliveryContextService;
  return { ctx, notify, appendEntry, mutate };
}

/** Fold the chain, provide the per-dispatch services, run synchronously (pure chains only). */
export function dispatchSync(
  chain: readonly Middleware[],
  event: HookEvent,
  ctx: DeliveryContextService = NOOP_DELIVERY,
): unknown {
  const program = foldMiddleware(chain)(BASE_HANDLER);
  const delivered = Effect.provideService(
    OpencodeOptionsService,
    undefined,
  )(Effect.provideService(CanonicalEventService, event)(Effect.provideService(DeliveryContext, ctx)(program)));
  return Effect.runSync(delivered);
}

/** Fold the chain, provide the per-dispatch services, run asynchronously. */
export function dispatchAsync(
  chain: readonly Middleware[],
  event: HookEvent,
  ctx: DeliveryContextService = NOOP_DELIVERY,
): Promise<unknown> {
  const program = foldMiddleware(chain)(BASE_HANDLER);
  const delivered = Effect.provideService(
    OpencodeOptionsService,
    undefined,
  )(Effect.provideService(CanonicalEventService, event)(Effect.provideService(DeliveryContext, ctx)(program)));
  return runChainAsync(delivered);
}

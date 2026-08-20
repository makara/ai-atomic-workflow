/**
 * Middleware system — the SDK's single hook-handling composition surface
 * (sdk-hooks-middleware). Middleware are Effect transformers with no
 * explicit `next`: short-circuit = return a terminal effect (succeed /
 * fail) without running `self`. The canonical event is provided through
 * the effect environment per dispatch (CanonicalEvent service) — never
 * positional, never closure-threaded.
 *
 * Verified idiom (spike, effect 3.22.1): HttpMiddleware / RpcServer fold
 * shape in .refs/effect — reduceRight composition, terminal-effect
 * short-circuit; downstream flatMapped steps never execute.
 *
 * Pure — no platform imports, no cross-module state.
 *
 * @module
 */

import { Context, Data, Effect } from 'effect';
import { CANONICAL_EVENTS, type CanonicalEvent as CanonicalEventName } from './events.js';
import type { CanonicalError, DeliveryContext, HandlerResult, HookEvent, OpencodeOptionsService } from './types.js';

/** Middleware environment — delivery channels + the per-dispatch canonical event + adapter-provided per-server-call options. */
export type MiddlewareEnv = DeliveryContext | CanonicalEventService | OpencodeOptionsService;

/**
 * Middleware — an Effect transformer. `use`-registered middleware fold
 * in registration order (outermost first, reduceRight). A middleware
 * that must stop the chain returns a terminal effect without running
 * `self`; a pass-through runs `self` and maps the result.
 */
export type Middleware<E = CanonicalError, R = MiddlewareEnv> = (
  self: Effect.Effect<HandlerResult, E, R>,
) => Effect.Effect<HandlerResult, E, R>;

/** Composed middleware for one canonical hook — registration order preserved. */
export type HookChain = readonly Middleware[];

/** Per-canonical-hook chain table — the bind input shape (one array per canonical event). */
export type HookChains = { readonly [K in CanonicalEventName]: HookChain };

/**
 * Loud failure — unknown hook target on `use`/namespace access, naming
 * the offending key (no silent skip, no no-op namespace).
 */
export class MiddlewareHookError extends Data.TaggedError('MiddlewareHookError')<{
  key: string;
}> {
  override get message(): string {
    return `Unknown canonical event: ${this.key}`;
  }
}

/** Per-dispatch canonical event — provided by the adapter before the chain runs. */
export class CanonicalEventService extends Context.Tag('CanonicalEvent')<CanonicalEventService, HookEvent>() {}

/**
 * One hook namespace — `use(middleware)` appends (additive, chainable),
 * `unwire(middleware)` detaches by identity. `chain` is the composed
 * middleware list read by the bind path.
 */
export interface HookNamespace<K extends CanonicalEventName> {
  /** Append a middleware to this hook — additive (never shadowing); returns the namespace for chaining. */
  use(mw: Middleware): HookNamespace<K>;
  /** Detach a previously attached middleware by identity — fail-open. */
  unwire(mw: Middleware): void;
  /** The composed middleware list (registration order) — consumed by the bind path. */
  readonly chain: HookChain;
}

/** Hooks — one namespace per canonical event, statically typed. */
export type Hooks = { readonly [K in CanonicalEventName]: HookNamespace<K> };

const EMPTY_CHAIN: HookChain = [];

/**
 * Create the hooks surface — one namespace per canonical event. Unknown
 * hook names are impossible at the type level; the runtime guard fails
 * loudly (MiddlewareHookError) against direct key access on the raw map.
 */
export function createHooks(): Hooks {
  const namespaces = new Map<CanonicalEventName, HookNamespace<CanonicalEventName>>();
  for (const name of CANONICAL_EVENTS) {
    let chain: HookChain = EMPTY_CHAIN;
    const namespace: HookNamespace<CanonicalEventName> = {
      use(mw) {
        chain = [...chain, mw];
        return namespace;
      },
      unwire(mw) {
        chain = chain.filter((entry) => entry !== mw);
      },
      get chain() {
        return chain;
      },
    };
    namespaces.set(name, namespace);
  }
  // Build the statically-typed record — canonical keys only, zero dynamic access.
  const hooks = {} as Hooks;
  for (const [name, namespace] of namespaces) {
    (hooks as Record<CanonicalEventName, HookNamespace<CanonicalEventName>>)[name] = namespace;
  }
  return hooks;
}

/** Extract the per-event chain table from a hooks surface — the bind input. */
export function chainsOf(hooks: Hooks): HookChains {
  const chains = {} as HookChains;
  for (const name of CANONICAL_EVENTS) {
    (chains as Record<CanonicalEventName, HookChain>)[name] = hooks[name].chain;
  }
  return chains;
}

/**
 * Fold middleware in registration order — reduceRight: the FIRST
 * registered middleware is OUTERMOST and runs first; the LAST registered
 * is innermost (closest to the base). Short-circuit: an outer middleware
 * returning a terminal effect stops everything downstream at runtime.
 */
export function foldMiddleware<E, R>(middleware: readonly Middleware<E, R>[]) {
  return (self: Effect.Effect<HandlerResult, E, R>): Effect.Effect<HandlerResult, E, R> =>
    middleware.reduceRight((acc, mw) => mw(acc), self);
}

/** The base effect a chain folds around — a void handler result (delivery decides the surface). */
export const BASE_HANDLER: Effect.Effect<HandlerResult, CanonicalError, never> = Effect.succeed(undefined);

/** Guard a hook name against the canonical directory — loud on unknown. */
export function assertCanonicalHook(name: string): asserts name is CanonicalEventName {
  if (!(CANONICAL_EVENTS as readonly string[]).includes(name)) {
    throw new MiddlewareHookError({ key: name });
  }
}

/**
 * Capability wiring helper (sdk-hooks-capabilities) — register one
 * middleware instance onto one or more canonical hooks (loud
 * unknown-hook validation at wiring time); returns an unwire handle
 * detaching by identity. Shared by the lifecycle / hints / resident
 * capabilities — single home, no per-capability duplication.
 */
export function wireCapability(
  hooks: Hooks,
  hook: CanonicalEventName | readonly CanonicalEventName[],
  middleware: Middleware,
): () => void {
  const targets = Array.isArray(hook) ? hook : [hook];
  const namespaces = targets.map((name) => {
    assertCanonicalHook(name);
    return hooks[name];
  });
  for (const ns of namespaces) ns.use(middleware);
  return () => {
    for (const ns of namespaces) ns.unwire(middleware);
  };
}

/**
 * Middleware chain behavior (sdk-hooks-middleware + capabilities) — the
 * single hook-handling composition surface replaces the removed
 * registry/dispatch pair (dispatch.test.ts deleted). Pins: additive
 * `use`, chainable namespaces, `unwire` detach, terminal-effect
 * short-circuit, loud unknown-hook failure (MiddlewareHookError), and
 * the single ASYNC execution face (both platform faces await the chain
 * — the former sync face / LoudExecutionError machinery is deleted).
 * Pure — no I/O.
 *
 * @module
 */

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CanonicalError,
  MiddlewareHookError,
  assertCanonicalHook,
  createHooks,
  type HookEvent,
  type Middleware,
} from '../src/index.js';
import { dispatchAsync, dispatchSync } from './helpers/dispatch.js';

/** Provide the per-dispatch services and run the composed chain synchronously (test-only — pure-sync chains). */
function syncRun(chain: readonly Middleware[], event: HookEvent): unknown {
  return dispatchSync(chain, event);
}

/** Provide the per-dispatch services and run the composed chain asynchronously. */
function asyncRun(chain: readonly Middleware[], event: HookEvent): Promise<unknown> {
  return dispatchAsync(chain, event);
}

describe('middleware chain — registration', () => {
  it('use is additive — every registered middleware runs in registration order', () => {
    const order: string[] = [];
    const a: Middleware = (self) =>
      Effect.gen(function* () {
        order.push('a');
        return yield* self;
      });
    const b: Middleware = (self) =>
      Effect.gen(function* () {
        order.push('b');
        return yield* self;
      });
    const hooks = createHooks();
    hooks.tool_result.use(a).use(b);
    expect(hooks.tool_result.chain).toHaveLength(2);
    const result = syncRun(hooks.tool_result.chain, {
      name: 'tool_result',
      payload: { toolName: 'read' },
    });
    expect(order).toEqual(['a', 'b']);
    expect(result).toBeUndefined();
  });

  it('use returns the namespace (chainable)', () => {
    const hooks = createHooks();
    const pass: Middleware = (self) => self;
    const ns = hooks.context.use(pass).use(pass);
    expect(ns).toBe(hooks.context);
    expect(ns.chain).toHaveLength(2);
  });

  it('unwire detaches by identity — fail-open on repeat', () => {
    const order: string[] = [];
    const a: Middleware = (self) =>
      Effect.gen(function* () {
        order.push('a');
        return yield* self;
      });
    const b: Middleware = (self) =>
      Effect.gen(function* () {
        order.push('b');
        return yield* self;
      });
    const hooks = createHooks();
    hooks.tool_result.use(a).use(b);
    hooks.tool_result.unwire(a);
    expect(hooks.tool_result.chain).toEqual([b]);
    syncRun(hooks.tool_result.chain, { name: 'tool_result', payload: { toolName: 'read' } });
    expect(order).toEqual(['b']);
    expect(() => hooks.tool_result.unwire(a)).not.toThrow(); // already detached — fail-open
    expect(hooks.tool_result.chain).toEqual([b]);
  });

  it('first-registered middleware is outermost (registration order preserved)', () => {
    const hooks = createHooks();
    const wrapA: Middleware = (self) => self.pipe(Effect.map((r) => `a(${String(r)})`));
    const wrapB: Middleware = (self) => self.pipe(Effect.map((r) => `b(${String(r)})`));
    hooks.tool_result.use(wrapA).use(wrapB);
    const result = syncRun(hooks.tool_result.chain, {
      name: 'tool_result',
      payload: { toolName: 'read' },
    });
    expect(result).toBe('a(b(undefined))');
  });
});

describe('middleware chain — execution semantics', () => {
  it('short-circuits: a terminal effect skips everything downstream', () => {
    let ran = false;
    const hooks = createHooks();
    hooks.tool_result
      .use(() => Effect.succeed('short'))
      .use((self) =>
        Effect.tap(self, () => {
          ran = true;
          return Effect.void;
        }),
      );
    const result = syncRun(hooks.tool_result.chain, {
      name: 'tool_result',
      payload: { toolName: 'read' },
    });
    expect(result).toBe('short');
    expect(ran).toBe(false);
  });

  it('fail short-circuits the error channel (downstream never runs)', () => {
    let ran = false;
    const hooks = createHooks();
    hooks.tool_result
      .use(() => Effect.fail(new CanonicalError({ message: 'stop' })))
      .use((self) =>
        Effect.tap(self, () => {
          ran = true;
          return Effect.void;
        }),
      );
    expect(() => syncRun(hooks.tool_result.chain, { name: 'tool_result', payload: { toolName: 'read' } })).toThrow(
      /stop/,
    );
    expect(ran).toBe(false);
  });

  it('unknown hook names fail loudly with MiddlewareHookError', () => {
    expect(() => assertCanonicalHook('bogus_hook')).toThrow(MiddlewareHookError);
    expect(() => assertCanonicalHook('bogus_hook')).toThrow(/Unknown canonical event: bogus_hook/);
    expect(new MiddlewareHookError({ key: 'nope' }).message).toBe('Unknown canonical event: nope');
  });
});

describe('middleware chain — single async execution face', () => {
  it('an async chain is awaited and its settled result delivered (no sync face exists)', async () => {
    const asyncMw: Middleware = (self) => Effect.flatMap(self, () => Effect.promise(() => Promise.resolve('async')));
    const hooks = createHooks();
    hooks.message_end.use(asyncMw);
    const event: HookEvent = { name: 'message_end', payload: {} };
    await expect(asyncRun(hooks.message_end.chain, event)).resolves.toBe('async');
  });

  it('a synchronous chain executes and delivers on the async face', async () => {
    const hooks = createHooks();
    hooks.message_end.use((self) => Effect.map(self, () => 'sync'));
    const event: HookEvent = { name: 'message_end', payload: {} };
    await expect(asyncRun(hooks.message_end.chain, event)).resolves.toBe('sync');
  });

  it('void results are legal', async () => {
    const hooks = createHooks();
    hooks.session_shutdown.use((self) => self);
    const event: HookEvent = { name: 'session_shutdown', payload: {} };
    await expect(asyncRun(hooks.session_shutdown.chain, event)).resolves.toBeUndefined();
  });
});

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { ompAdapter } from '../src/adapters/omp.js';
import { opencodeAdapter } from '../src/adapters/opencode.js';
import { bind } from '../src/core/bind.js';
import { assertCanonicalHook, createHooks, MiddlewareHookError } from '../src/index.js';

describe('bind registry', () => {
  it('omp bind produces a tagged factory that registers via pi.on', () => {
    const hooks = createHooks();
    hooks.tool_result.use((self) => self.pipe(Effect.map(() => 'x')));
    const { tag, value: factory } = bind(ompAdapter, hooks);
    expect(tag).toBe('omp');
    const registered: Array<[string, unknown]> = [];
    const pi = { on: (name: string, fn: unknown) => registered.push([name, fn]) };
    factory(pi);
    expect(registered.map(([n]) => n)).toContain('tool_result');
    expect(registered.length).toBeGreaterThan(0);
  });

  it('opencode bind produces the tagged { server } plugin shape', async () => {
    const hooks = createHooks();
    hooks.tool_result.use((self) => self.pipe(Effect.map(() => 'x')));
    const { tag, value: plugin } = bind(opencodeAdapter, hooks);
    expect(tag).toBe('opencode');
    expect(typeof plugin.server).toBe('function');
    const result = plugin.server({});
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('adapter platforms are declared', () => {
    expect(ompAdapter.platform).toBe('omp');
    expect(opencodeAdapter.platform).toBe('opencode');
  });

  it('unknown hook names fail loudly at the guard (MiddlewareHookError, no silent skip)', () => {
    // The bind path needs no key validation — chains come from createHooks
    // (canonical keys only); the loud guard lives on the hook surface.
    expect(() => assertCanonicalHook('bogus_key')).toThrow(MiddlewareHookError);
    expect(() => assertCanonicalHook('bogus_key')).toThrow(/Unknown canonical event: bogus_key/);
  });

  it('bind accepts adapter + hooks (+ optional config layers) — the resident option is removed (ADR 0211)', () => {
    // The bind signature is (adapter, hooks, layers?); the third argument
    // is a config Layer (HintsConfig / ResidentConfig), not an options
    // object. A resident-shaped third argument is a type error, never
    // consumed — resident injection is the `resident` middleware value's
    // job.
    const hooks = createHooks();
    hooks.tool_result.use((self) => self.pipe(Effect.map(() => 'x')));
    const { tag, value: factory } = bind(
      ompAdapter,
      hooks,
      // @ts-expect-error — bind takes config Layers, never a resident options object
      { resident: [] },
    );
    expect(tag).toBe('omp');
    expect(factory).toBeTypeOf('function');
  });
});

/**
 * Unit tests for PhaseHandlerRegistry — Effect-TS service with per-runtime isolation.
 *
 * TDD red phase: PhaseHandlerRegistry Context.Tag does not exist yet.
 * These tests define the expected API contract:
 *   - Multi-runtime isolation (no shared state)
 *   - Duplicate registration → explicit error
 *   - Resolution returns unknown types list on miss
 *   - Listing registered types
 */

import { Effect, Layer, ManagedRuntime } from 'effect';
import { describe, expect, it } from 'vitest';

// PhaseHandlerRegistry + errors will exist in registry.ts after implementation
import {
  DuplicatePhaseHandlerError,
  makePhaseHandlerRegistryLayer,
  PhaseHandlerRegistry,
} from '../../src/phase-handler/registry.js';
import type { IPhaseHandler } from '../../src/phase-handler/types.js';
import { UnknownPhaseTypeError } from '../../src/phase-handler/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock handler — returns phase as-is, no extension. */
function mockHandler(phaseType: string): IPhaseHandler {
  return {
    phaseType,
    validate: (p) => p,
    normalize: (p) => p,
    extendNodeDetail: (base) => ({}),
  };
}

/** Create a fresh runtime with a new PhaseHandlerRegistry layer. */
function freshRuntime() {
  return ManagedRuntime.make(makePhaseHandlerRegistryLayer());
}

// ---------------------------------------------------------------------------
// Tests — multi-runtime isolation
// ---------------------------------------------------------------------------

describe('PhaseHandlerRegistry — multi-runtime isolation', () => {
  it('each runtime gets its own independent PhaseHandler registry', async () => {
    const rt1 = freshRuntime();
    const rt2 = freshRuntime();

    // Register 'agent' handler in rt1 only
    await rt1.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        yield* reg.registerPhaseHandler(mockHandler('agent'));
      }),
    );

    // rt2 MUST NOT see 'agent' handler
    const types2 = await rt2.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        return yield* reg.getRegisteredTypes();
      }),
    );

    expect(types2).not.toContain('agent');
  });

  it('two runtimes can register different handlers without interference', async () => {
    const rtA = freshRuntime();
    const rtB = freshRuntime();

    await rtA.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        yield* reg.registerPhaseHandler(mockHandler('agent'));
      }),
    );

    await rtB.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        yield* reg.registerPhaseHandler(mockHandler('approval'));
      }),
    );

    const typesA = await rtA.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        return yield* reg.getRegisteredTypes();
      }),
    );

    const typesB = await rtB.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        return yield* reg.getRegisteredTypes();
      }),
    );

    expect(typesA).toContain('agent');
    expect(typesA).not.toContain('approval');
    expect(typesB).toContain('approval');
    expect(typesB).not.toContain('agent');
  });
});

// ---------------------------------------------------------------------------
// Tests — duplicate registration
// ---------------------------------------------------------------------------

describe('PhaseHandlerRegistry — duplicate registration', () => {
  it('throws DuplicatePhaseHandlerError on duplicate phaseType', async () => {
    const rt = freshRuntime();

    const program = Effect.gen(function* () {
      const reg = yield* PhaseHandlerRegistry;
      yield* reg.registerPhaseHandler(mockHandler('agent'));
      yield* reg.registerPhaseHandler(mockHandler('agent')); // DUPLICATE!
    });

    await expect(rt.runPromise(program)).rejects.toThrow(/Duplicate phase handler/);
  });

  it('duplicate error message includes phaseType', async () => {
    const rt = freshRuntime();

    const program = Effect.gen(function* () {
      const reg = yield* PhaseHandlerRegistry;
      yield* reg.registerPhaseHandler(mockHandler('approval'));
      yield* reg.registerPhaseHandler(mockHandler('approval'));
    });

    await expect(rt.runPromise(program)).rejects.toThrow(/approval/);
  });

  it('first registration succeeds, second fails — first stays registered', async () => {
    const rt = freshRuntime();

    const program = Effect.gen(function* () {
      const reg = yield* PhaseHandlerRegistry;
      yield* reg.registerPhaseHandler(mockHandler('main'));
      return yield* reg.resolvePhaseHandler('main');
    });

    const handler = await rt.runPromise(program);
    expect(handler.phaseType).toBe('main');
  });
});

// ---------------------------------------------------------------------------
// Tests — resolution
// ---------------------------------------------------------------------------

describe('PhaseHandlerRegistry — resolution', () => {
  it('resolves registered handler by type', async () => {
    const rt = freshRuntime();

    await rt.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        yield* reg.registerPhaseHandler(mockHandler('agent'));
      }),
    );

    const resolved = await rt.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        return yield* reg.resolvePhaseHandler('agent');
      }),
    );

    expect(resolved.phaseType).toBe('agent');
  });

  it('throws UnknownPhaseTypeError for unregistered type', async () => {
    const rt = freshRuntime();

    const program = Effect.gen(function* () {
      const reg = yield* PhaseHandlerRegistry;
      return yield* reg.resolvePhaseHandler('nonexistent');
    });

    // Effect.fail wraps in FiberFailure — check message pattern
    await expect(rt.runPromise(program)).rejects.toThrow(/Unknown phase type/);
  });

  it('UnknownPhaseTypeError message lists registered types', async () => {
    const rt = freshRuntime();

    await rt.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        yield* reg.registerPhaseHandler(mockHandler('agent'));
        yield* reg.registerPhaseHandler(mockHandler('main'));
      }),
    );

    const program = Effect.gen(function* () {
      const reg = yield* PhaseHandlerRegistry;
      return yield* reg.resolvePhaseHandler('unknown');
    });

    await expect(rt.runPromise(program)).rejects.toThrow(/agent.*main/);
  });
});

// ---------------------------------------------------------------------------
// Tests — listing
// ---------------------------------------------------------------------------

describe('PhaseHandlerRegistry — listing', () => {
  it('getRegisteredTypes returns empty array for fresh registry', async () => {
    const rt = freshRuntime();

    const types = await rt.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        return yield* reg.getRegisteredTypes();
      }),
    );

    expect(types).toEqual([]);
  });

  it('getRegisteredTypes returns all registered types', async () => {
    const rt = freshRuntime();

    await rt.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        yield* reg.registerPhaseHandler(mockHandler('agent'));
        yield* reg.registerPhaseHandler(mockHandler('main'));
        yield* reg.registerPhaseHandler(mockHandler('approval'));
      }),
    );

    const types = await rt.runPromise(
      Effect.gen(function* () {
        const reg = yield* PhaseHandlerRegistry;
        return yield* reg.getRegisteredTypes();
      }),
    );

    expect(types.sort()).toEqual(['agent', 'approval', 'main']);
  });
});

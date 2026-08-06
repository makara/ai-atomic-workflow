/**
 * Tests for registry-loader.ts — multi-registry merge, graph resolution,
 * error handling, and caching.
 */
import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { FileSystem, FileSystemError } from '../src/filesystem.js';
import { makeRegistryLoader } from '../src/registry-loader.js';

// ── Helpers ──────────────────────────────────────────────────────

function validRegistry(graphs: Array<{ name: string; path: string; description?: string }>): string {
  return JSON.stringify({ graphs });
}

function mockFsLayer(files: Record<string, string>): Layer.Layer<FileSystem, never, never> {
  return Layer.succeed(FileSystem, {
    readFile: (path: string) => {
      const content = files[path];
      if (content !== undefined) return Effect.succeed(content);
      return Effect.fail(new FileSystemError(path, `ENOENT: file not found: ${path}`));
    },
    resolvePath: (filePath: string) => (filePath in files ? filePath : null),
  });
}

/** Run an Effect and return the success value. */
async function runSuccess<A>(program: Effect.Effect<A, unknown, never>): Promise<A> {
  return Effect.runPromise(program);
}

// ── makeRegistryLoader / resolveGraph ─────────────────────────────

describe('makeRegistryLoader', () => {
  const PATHS = ['reg1.json', 'reg2.json'];

  it('resolveGraph finds a graph in first registry', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': validRegistry([{ name: 'graph-a', path: 'graphs/a.taskflow.yaml' }]),
      'reg2.json': validRegistry([{ name: 'graph-b', path: 'graphs/b.taskflow.yaml' }]),
    });

    const result = await runSuccess(loader.resolveGraph('graph-a').pipe(Effect.provide(layer)));
    expect(result.path).toMatch(/graphs\/a\.taskflow\.yaml$/);
  });

  it('resolveGraph finds a graph in second registry', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': validRegistry([{ name: 'graph-a', path: 'graphs/a.taskflow.yaml' }]),
      'reg2.json': validRegistry([{ name: 'graph-b', path: 'graphs/b.taskflow.yaml' }]),
    });

    const result = await runSuccess(loader.resolveGraph('graph-b').pipe(Effect.provide(layer)));
    expect(result.path).toMatch(/graphs\/b\.taskflow\.yaml$/);
  });

  it('resolveGraph fails for unknown graph name', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': validRegistry([{ name: 'graph-a', path: 'graphs/a.taskflow.yaml' }]),
      'reg2.json': validRegistry([]),
    });

    await expect(Effect.runPromise(loader.resolveGraph('unknown').pipe(Effect.provide(layer)))).rejects.toThrow(
      /not found in any registry/,
    );
  });

  it('project registry (later) overrides builtin (earlier) for same-named graph — project-first precedence', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': validRegistry([{ name: 'dup', path: 'graphs/v1.taskflow.yaml' }]),
      'reg2.json': validRegistry([{ name: 'dup', path: 'graphs/v2.taskflow.yaml' }]),
    });

    const result = await runSuccess(loader.resolveGraph('dup').pipe(Effect.provide(layer)));
    expect(result.path).toMatch(/graphs\/v2\.taskflow\.yaml$/);
    expect(result.source).toBe('project');
  });

  it('resolvedFrom reports builtin when only builtin registry has the graph', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': validRegistry([{ name: 'builtin-only', path: 'graphs/b.taskflow.yaml' }]),
      'reg2.json': validRegistry([]),
    });

    const result = await runSuccess(loader.resolveGraph('builtin-only').pipe(Effect.provide(layer)));
    expect(result.source).toBe('builtin');
  });

  it('registry method returns merged map with all entries', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': validRegistry([{ name: 'a', path: 'a.json' }]),
      'reg2.json': validRegistry([{ name: 'b', path: 'b.json' }]),
    });

    const result = await runSuccess(loader.registry.pipe(Effect.provide(layer)));
    expect(result.size).toBe(2);
    expect(result.get('a')!.path).toMatch(/a\.json$/);
    expect(result.get('b')!.path).toMatch(/b\.json$/);
  });

  // ── Error handling ─────────────────────────────────────────────

  it('skips missing registry file gracefully', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg2.json': validRegistry([{ name: 'b', path: 'b.json' }]),
    });

    const result = await runSuccess(loader.resolveGraph('b').pipe(Effect.provide(layer)));
    expect(result.path).toMatch(/b\.json$/);
  });

  it('fails on non-ENOENT file error (e.g. Permission denied)', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = Layer.succeed(FileSystem, {
      readFile: (_path: string) => Effect.fail(new FileSystemError('reg1.json', 'Permission denied')),
      resolvePath: () => null,
    });

    await expect(Effect.runPromise(loader.resolveGraph('anything').pipe(Effect.provide(layer)))).rejects.toThrow(
      /Permission denied/,
    );
  });

  it('fails on invalid JSON in registry', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': 'not valid json {{{',
      'reg2.json': validRegistry([]),
    });

    await expect(Effect.runPromise(loader.resolveGraph('anything').pipe(Effect.provide(layer)))).rejects.toThrow(
      /Invalid JSON/,
    );
  });

  it('fails when "graphs" is not an array', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': JSON.stringify({ graphs: 'not-an-array' }),
      'reg2.json': validRegistry([]),
    });

    await expect(Effect.runPromise(loader.resolveGraph('anything').pipe(Effect.provide(layer)))).rejects.toThrow(
      /graphs.*must be an array/,
    );
  });

  it('skips invalid entries within the graphs array', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': JSON.stringify({
        graphs: [
          'not-an-object',
          null,
          { name: 123, path: 'bad' },
          { name: 'valid', path: 'valid.json' },
          { path: 'no-name.json' },
          { name: 'b' },
        ],
      }),
      'reg2.json': validRegistry([]),
    });

    const result = await runSuccess(loader.resolveGraph('valid').pipe(Effect.provide(layer)));
    expect(result.path).toMatch(/valid\.json$/);
  });

  it('registry entry with description is loaded correctly', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': JSON.stringify({
        graphs: [{ name: 'a', path: 'a.json', description: 'Test graph A' }],
      }),
      'reg2.json': validRegistry([]),
    });

    const result = await runSuccess(loader.registry.pipe(Effect.provide(layer)));
    expect(result.get('a')!.description).toBe('Test graph A');
  });

  // ── Fresh reads ────────────────────────────────────────────────

  it('registries are re-read on every call — no stale cache', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    let readCount = 0;
    const layer = Layer.succeed(FileSystem, {
      readFile: (path: string) => {
        readCount++;
        if (path === 'reg1.json') return Effect.succeed(validRegistry([{ name: 'a', path: 'a.json' }]));
        if (path === 'reg2.json') return Effect.succeed(validRegistry([{ name: 'b', path: 'b.json' }]));
        return Effect.fail(new FileSystemError(path, 'ENOENT'));
      },
      resolvePath: (filePath: string) => filePath,
    });

    await runSuccess(loader.resolveGraph('a').pipe(Effect.provide(layer)));
    expect(readCount).toBe(2);

    await runSuccess(loader.resolveGraph('b').pipe(Effect.provide(layer)));
    expect(readCount).toBe(4);
  });

  it('registry method returns merged index', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': validRegistry([{ name: 'a', path: 'a.json' }]),
      'reg2.json': validRegistry([{ name: 'b', path: 'b.json' }]),
    });

    const result = await runSuccess(loader.registry.pipe(Effect.provide(layer)));
    expect(result.size).toBe(2);
  });

  // ── Edge cases ─────────────────────────────────────────────────

  it('all registry files missing — resolveGraph fails', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({});

    await expect(Effect.runPromise(loader.resolveGraph('anything').pipe(Effect.provide(layer)))).rejects.toThrow();
  });

  it('empty registries — resolveGraph fails for any graph name', async () => {
    const loader = makeRegistryLoader(PATHS, 'reg1.json');
    const layer = mockFsLayer({
      'reg1.json': validRegistry([]),
      'reg2.json': validRegistry([]),
    });

    await expect(Effect.runPromise(loader.resolveGraph('anything').pipe(Effect.provide(layer)))).rejects.toThrow();
  });
});

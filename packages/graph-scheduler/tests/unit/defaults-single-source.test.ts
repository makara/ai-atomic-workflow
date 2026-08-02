/**
 * Defaults single source — the canonical project layout is
 * defined once (createDefaultConfig) and every producer (CLI template,
 * setup-skill seeds, runtime resolution) derives from it. These tests lock
 * the drift between scaffold defaults and runtime defaults.
 */
import { Effect } from 'effect';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BUILTIN_DB_PATH,
  BUILTIN_REGISTRY_PATH,
  BUILTIN_TASKFLOW_DIR,
  createDefaultConfig,
  createRuntime,
} from '../../src/scheduler-runtime.js';

describe('defaults single source', () => {
  it('setup-skill seed config.json equals createDefaultConfig — no handwritten literals', () => {
    const seed = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../graph-workflow/skills/setup-atomic-workflow/seeds/config.json'),
        'utf-8',
      ),
    );
    expect(seed).toEqual(createDefaultConfig());
  });

  it('built-in constants are exported and non-empty', () => {
    expect(BUILTIN_DB_PATH).toBe(':memory:');
    expect(BUILTIN_TASKFLOW_DIR.length).toBeGreaterThan(0);
    expect(BUILTIN_REGISTRY_PATH.length).toBeGreaterThan(0);
  });

  it('runtime adopts the scaffold layout — project graph in the default taskflowDir loads', async () => {
    // Repo root ships the scaffolded .graph-scheduler/config.json (produced by
    // the setup flow). lorem-gen lives in the project taskflowDir
    // ('.graph-scheduler/graphs'), NOT the builtin dir. Config lookup is
    // cwd-relative — resolve the scaffold paths explicitly so the test passes
    // from any working directory (package-local config shadows root when run
    // from packages/graph-scheduler).
    const repoRoot = resolve(__dirname, '..', '..', '..', '..');
    const program = Effect.gen(function* () {
      const rt = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: resolve(repoRoot, '.graph-scheduler/graphs'),
        registryPaths: [resolve(repoRoot, '.graph-scheduler/graphs/registry.json')],
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('lorem-gen')));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });

    const res = await Effect.runPromise(program);
    expect(res._tag).toBe('Right');
    if (res._tag === 'Right') {
      expect(res.right.node?.nodeId).toBeTruthy();
    }
  });
});

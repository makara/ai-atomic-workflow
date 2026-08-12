/**
 * Uniform user-supplement validation surface (run path).
 *
 * The reference-vocabulary Files-coverage semantics were agent-side contract
 * coverage (checkForwardCoverage — deleted with the entry-skill machinery;
 * the engine never parses skill prose). What remains is the machine-owned
 * user-supplement layer: project-context existence validation runs uniformly
 * on the graph_start load path (same implementation as graph_init).
 */
import { Effect } from 'effect';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateProjectContext } from '../../src/context/contracts.js';
import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

interface Fixture {
  dir: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'vocab-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('uniform user-supplement validation surface (run path)', () => {
  let fixture: Fixture;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fixture = makeFixture();
    // runContractsPass validates against process.cwd() — anchor it to the
    // fixture so assertions resolve against fixture paths, never the repo.
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(fixture.dir);
  });
  afterEach(() => {
    cwdSpy.mockRestore();
    fixture.cleanup();
  });

  function writeGraph(): void {
    const graph = {
      name: 'g',

      phases: [{ id: 'p', type: 'main', dependsOn: [], task: 'x', operations: [] }],
    };
    writeFileSync(join(fixture.dir, 'g.taskflow.yaml'), JSON.stringify(graph, null, 2));
    writeFileSync(
      join(fixture.dir, 'registry.json'),
      JSON.stringify({ graphs: [{ name: 'g', path: 'g.taskflow.yaml' }] }, null, 2),
    );
  }

  async function startWithContext(context: string[]): Promise<{ tag: string; errors?: string[] }> {
    const program = Effect.gen(function* () {
      const rt: SchedulerRuntime = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: fixture.dir,
        registryPaths: [join(fixture.dir, 'registry.json')],
        context,
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('g', { mode: 'auto' })));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });
    const res = await Effect.runPromise(program);
    if (res._tag === 'Left') {
      const raw = (res.left as { error?: unknown }).error ?? res.left;
      const err = raw as { violations?: string[] };
      return { tag: 'Left', errors: err.violations ?? [] };
    }
    return { tag: 'Right' };
  }

  it('graph_start fails on missing exact user-supplement file — same as graph_init', async () => {
    writeGraph();
    const res = await startWithContext(['docs/ghost-missing-x/index.md']);
    expect(res.tag).toBe('Left');
    expect(res.errors?.some((e) => e.includes('does not exist'))).toBe(true);
  });

  it('graph_start does not block on zero-match user-supplement glob — same validation as graph_init', async () => {
    writeGraph();
    // The load path tolerates a zero-match glob (lazy document creation) —
    // the run starts; the warning is surfaced by the shared validator.
    const res = await startWithContext(['docs/ghost-missing-x/*.md']);
    expect(res.tag).toBe('Right');
    const { errors, warnings } = validateProjectContext(['docs/ghost-missing-x/*.md'], fixture.dir);
    expect(errors).toHaveLength(0);
    expect(warnings.some((e) => e.includes('matches zero files'))).toBe(true);
  });
});

/**
 * graph_init full-registry validation — config health report, missing-config
 * tolerance, idempotency. Machine validation only: YAML parse + config
 * health + project-context existence. Entry-skill alignment and orphan
 * detection are agent-side (estate-maintain consistency gate) — deleted.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IGraphInitReport } from '../../src/api/maintenance.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

interface Fixture {
  cwd: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const cwd = join(tmpdir(), `init-val-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(cwd, 'graphs'), { recursive: true });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function writeConfig(fix: Fixture, content: string): void {
  mkdirSync(join(fix.cwd, '.graph-scheduler'), { recursive: true });
  writeFileSync(join(fix.cwd, '.graph-scheduler', 'config.json'), content);
}

function writeGraph(fix: Fixture, name: string, graph: Record<string, unknown>): void {
  writeFileSync(join(fix.cwd, 'graphs', `${name}.yaml`), JSON.stringify(graph, null, 2));
}

async function runInit(taskflowDir: string): Promise<IGraphInitReport> {
  const program = Effect.gen(function* () {
    const rt = yield* createRuntime({
      dbPath: ':memory:',
      taskflowDir,
      // Explicit override — loadConfigFile resolves config.json against the real
      // process cwd (vi.spyOn(process, 'cwd') does not affect path.resolve in
      // the bun runtime), so the fixture config is never read.
    });
    const report = yield* Effect.tryPromise(() => rt.graphInit());
    yield* Effect.tryPromise(() => rt.dispose());
    return report;
  });
  return Effect.runPromise(program);
}

describe('graph_init full-registry validation', () => {
  let fix: Fixture;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fix = makeFixture();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(fix.cwd);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fix.cleanup();
  });

  it('reports malformed config while still validating graphs', async () => {
    writeConfig(fix, '{ not json');
    writeGraph(fix, 'g', {
      name: 'g',

      phases: [
        { id: 'p1', type: 'main', skill: 'temp-skill', task: 'x', channels: ['req.md'], dependsOn: [], operations: [] },
      ],
    });

    const report = await runInit(join(fix.cwd, 'graphs'));
    expect(report.validation.config.exists).toBe(true);
    expect(report.validation.config.valid).toBe(false);
    expect(report.validation.config.schemaErrors[0]).toContain('invalid JSON');
    // graph validation still ran — the fixture graph parses cleanly
    expect(report.validation.errors.filter((e) => e.includes('YAML parse error'))).toHaveLength(0);
  });

  it('missing config is non-blocking and reported', async () => {
    // no .graph-scheduler/config.json — only builtin graphs scanned
    const report = await runInit(join(fix.cwd, 'graphs'));
    expect(report.validation.config.exists).toBe(false);
    expect(report.validation.errors).toHaveLength(0);
  });

  it('reports schema violations in the graph health scan (not YAML-parse only)', async () => {
    // YAML-parseable but WorkflowSchema-invalid: non-semver version + no name
    writeGraph(fix, 'bad-schema', { version: 'not-semver', phases: [] });

    const report = await runInit(join(fix.cwd, 'graphs'));
    const schemaError = report.validation.errors.find((e) => e.includes('schema validation failed'));
    expect(schemaError).toBeDefined();
    expect(schemaError).toContain('bad-schema.yaml');
    // the builtin graphs scan cleanly (valid headers) — no YAML parse noise
    expect(report.validation.errors.filter((e) => e.includes('YAML parse error'))).toHaveLength(0);
  });

  it('is idempotent — repeated runs report identical state', async () => {
    writeConfig(fix, JSON.stringify({ dbPath: ':memory:', taskflowDir: 'graphs' }));
    writeGraph(fix, 'g', {
      name: 'g',

      phases: [
        { id: 'p1', type: 'main', skill: 'temp-skill', task: 'x', channels: ['req.md'], dependsOn: [], operations: [] },
      ],
    });

    const r1 = await runInit(join(fix.cwd, 'graphs'));
    const r2 = await runInit(join(fix.cwd, 'graphs'));
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

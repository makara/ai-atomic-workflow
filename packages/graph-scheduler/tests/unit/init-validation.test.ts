/**
 * graph_init full-registry validation — orphan detection,
 * channel-deletion surfacing, config health report, idempotency.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setConfiguredSkillsDir } from '../../src/api/graph-loader.js';
import type { IGraphInitReport } from '../../src/api/maintenance.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

const SKILL_CONTRACT = `---
name: temp-skill
description: test skill
---

## Context Requirements

### From upstream

- plan

### Reference skills

### Files

- req.md
`;

interface Fixture {
  cwd: string;
  skillsDir: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const cwd = join(tmpdir(), `init-val-${Math.random().toString(36).slice(2)}`);
  const skillsDir = join(cwd, 'skills');
  mkdirSync(join(cwd, 'graphs'), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  return { cwd, skillsDir, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function writeConfig(fix: Fixture, content: string): void {
  mkdirSync(join(fix.cwd, '.graph-scheduler'), { recursive: true });
  writeFileSync(join(fix.cwd, '.graph-scheduler', 'config.json'), content);
}

function writeGraph(fix: Fixture, name: string, graph: Record<string, unknown>): void {
  writeFileSync(join(fix.cwd, 'graphs', `${name}.taskflow.yaml`), JSON.stringify(graph, null, 2));
}

function writeSkill(fix: Fixture, name: string, content: string): void {
  mkdirSync(join(fix.skillsDir, name), { recursive: true });
  writeFileSync(join(fix.skillsDir, name, 'SKILL.md'), content);
}

async function runInit(taskflowDir: string, skillsDir: string): Promise<IGraphInitReport> {
  const program = Effect.gen(function* () {
    const rt = yield* createRuntime({
      dbPath: ':memory:',
      taskflowDir,
      // Explicit override — loadConfigFile resolves config.json against the real
      // process cwd (vi.spyOn(process, 'cwd') does not affect path.resolve in
      // the bun runtime), so the fixture config is never read.
      skillsDir,
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
    setConfiguredSkillsDir(fix.skillsDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    setConfiguredSkillsDir(undefined);
    fix.cleanup();
  });

  it('reports orphan entry skill not dispatched by any graph', async () => {
    writeConfig(fix, JSON.stringify({ dbPath: ':memory:', taskflowDir: 'graphs', skillsDir: fix.skillsDir }));
    writeSkill(fix, 'orphan-skill', SKILL_CONTRACT.replace('name: temp-skill', 'name: orphan-skill'));
    // graph dispatches a DIFFERENT skill — orphan-skill has no dispatcher
    writeGraph(fix, 'g', {
      name: 'g',
      version: 1,
      phases: [{ id: 'p1', type: 'main', skill: 'temp-skill', task: 'x', channels: ['req.md'], dependsOn: [] }],
    });

    const report = await runInit(join(fix.cwd, 'graphs'), fix.skillsDir);
    expect(report.validation.errors.some((e) => e.includes('orphan entry skill') && e.includes('orphan-skill'))).toBe(
      true,
    );
  });

  it('surfaces channel deletion (contract file missing from channels)', async () => {
    writeConfig(fix, JSON.stringify({ dbPath: ':memory:', taskflowDir: 'graphs', skillsDir: fix.skillsDir }));
    writeSkill(fix, 'temp-skill', SKILL_CONTRACT);
    // contract declares req.md — channels omit it
    writeGraph(fix, 'g', {
      name: 'g',
      version: 1,
      phases: [{ id: 'p1', type: 'main', skill: 'temp-skill', task: 'x', dependsOn: [] }],
    });

    const report = await runInit(join(fix.cwd, 'graphs'), fix.skillsDir);
    expect(report.validation.errors.some((e) => e.includes("declares file 'req.md' not covered"))).toBe(true);
  });

  it('reports malformed config while still validating graphs', async () => {
    writeConfig(fix, '{ not json');
    writeSkill(fix, 'temp-skill', SKILL_CONTRACT);
    writeGraph(fix, 'g', {
      name: 'g',
      version: 1,
      phases: [{ id: 'p1', type: 'main', skill: 'temp-skill', task: 'x', channels: ['req.md'], dependsOn: [] }],
    });

    const report = await runInit(join(fix.cwd, 'graphs'), fix.skillsDir);
    expect(report.validation.config.exists).toBe(true);
    expect(report.validation.config.valid).toBe(false);
    expect(report.validation.config.schemaErrors[0]).toContain('invalid JSON');
    // graph validation still ran — no YAML errors, no channel errors (channels cover req.md)
    expect(report.validation.errors.filter((e) => e.includes('YAML parse error'))).toHaveLength(0);
  });

  it('missing config is non-blocking and reported', async () => {
    // no .graph-scheduler/config.json — only builtin graphs scanned
    const report = await runInit(join(fix.cwd, 'graphs'), fix.skillsDir);
    expect(report.validation.config.exists).toBe(false);
    expect(report.validation.errors).toHaveLength(0);
  });

  it('is idempotent — repeated runs report identical state', async () => {
    writeConfig(fix, JSON.stringify({ dbPath: ':memory:', taskflowDir: 'graphs', skillsDir: fix.skillsDir }));
    writeSkill(fix, 'temp-skill', SKILL_CONTRACT);
    writeGraph(fix, 'g', {
      name: 'g',
      version: 1,
      phases: [{ id: 'p1', type: 'main', skill: 'temp-skill', task: 'x', channels: ['req.md'], dependsOn: [] }],
    });

    const r1 = await runInit(join(fix.cwd, 'graphs'), fix.skillsDir);
    const r2 = await runInit(join(fix.cwd, 'graphs'), fix.skillsDir);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

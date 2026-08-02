import { Effect } from 'effect';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSkillsDir, setConfiguredSkillsDir } from '../../src/api/graph-loader.js';
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

describe('debug3', () => {
  let fix: { cwd: string; skillsDir: string; cleanup: () => void };
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    const cwd = join(tmpdir(), `dbg3-${Math.random().toString(36).slice(2)}`);
    const skillsDir = join(cwd, 'skills');
    mkdirSync(join(cwd, 'graphs'), { recursive: true });
    mkdirSync(join(cwd, '.graph-scheduler'), { recursive: true });
    writeFileSync(
      join(cwd, '.graph-scheduler', 'config.json'),
      JSON.stringify({ dbPath: ':memory:', taskflowDir: 'graphs', skillsDir }),
    );
    mkdirSync(join(skillsDir, 'orphan-skill'), { recursive: true });
    writeFileSync(
      join(skillsDir, 'orphan-skill', 'SKILL.md'),
      SKILL_CONTRACT.replace('name: temp-skill', 'name: orphan-skill'),
    );
    writeFileSync(
      join(cwd, 'graphs', 'g.taskflow.yaml'),
      JSON.stringify(
        {
          name: 'g',
          version: 1,
          phases: [{ id: 'p1', type: 'main', skill: 'temp-skill', task: 'x', channels: ['req.md'], dependsOn: [] }],
        },
        null,
        2,
      ),
    );
    fix = { cwd, skillsDir, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
    spy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  });
  afterEach(() => {
    spy.mockRestore();
    setConfiguredSkillsDir(undefined);
    fix.cleanup();
  });

  it('trace scan', async () => {
    setConfiguredSkillsDir(fix.skillsDir);
    const rt = await Effect.runPromise(createRuntime({ dbPath: ':memory:', taskflowDir: join(fix.cwd, 'graphs') }));
    console.log('RESOLVED_SKILLS_DIR:', resolveSkillsDir());
    const report = await rt.graphInit();
    console.log('ERRORS:', JSON.stringify(report.validation.errors, null, 2));
    await rt.dispose();
  });
});

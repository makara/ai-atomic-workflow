import { Effect } from 'effect';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfiguredSkillsDir } from '../../src/api/graph-loader.js';
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

describe('repro', () => {
  it('init validation', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'gs-init-'));
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
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    setConfiguredSkillsDir(skillsDir);
    try {
      const rt = await Effect.runPromise(createRuntime({ dbPath: ':memory:', taskflowDir: join(cwd, 'graphs') }));
      const report = await rt.graphInit();
      console.log('ERRORS:', JSON.stringify(report.validation.errors, null, 2));
      console.log('WARNINGS:', JSON.stringify(report.validation.warnings, null, 2));
      await rt.dispose();
    } finally {
      spy.mockRestore();
      setConfiguredSkillsDir(undefined);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

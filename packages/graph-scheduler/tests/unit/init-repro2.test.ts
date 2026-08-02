import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateEntrySkillContracts } from '../../src/context/contracts.js';
import { parseContextContract } from '../../src/context/resolve-channels.js';

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

describe('debug', () => {
  it('parse + orphan', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'gs-dbg-'));
    const skillsDir = join(cwd, 'skills');
    mkdirSync(join(skillsDir, 'orphan-skill'), { recursive: true });
    writeFileSync(
      join(skillsDir, 'orphan-skill', 'SKILL.md'),
      SKILL_CONTRACT.replace('name: temp-skill', 'name: orphan-skill'),
    );
    const parsed = parseContextContract(SKILL_CONTRACT.replace('name: temp-skill', 'name: orphan-skill'));
    console.log('PARSED:', JSON.stringify(parsed));
    const graph = {
      name: 'g',
      version: 1,
      phases: [{ id: 'p1', type: 'main', skill: 'temp-skill', task: 'x', channels: ['req.md'], dependsOn: [] }],
    };
    const res = await validateEntrySkillContracts(
      [{ filePath: join(cwd, 'graphs', 'g.taskflow.yaml'), graph }],
      skillsDir,
      { checkOrphans: true },
    );
    console.log('ERRORS:', JSON.stringify(res.errors, null, 2));
    console.log('WARNINGS:', JSON.stringify(res.warnings, null, 2));
    rmSync(cwd, { recursive: true, force: true });
  });
});

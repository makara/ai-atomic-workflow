import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toTaskflowGraph } from '../src/api/graph-loader.js';
import { validateEntrySkillContracts } from '../src/context/contracts.js';

describe('load probe — annotated convention entry (reported defect)', () => {
  it('graph load + entry-skill validation pass with annotated convention entry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probe-'));
    mkdirSync(join(dir, 'annotated-skill'));
    writeFileSync(
      join(dir, 'annotated-skill', 'SKILL.md'),
      `---
name: annotated-skill
description: x
---

## Context Requirements

### From upstream

- up (review output)

### Reference skills

- codebase-design (vocabulary)

### Files

- ./CONTEXT.md (project glossary per domain-modeling CONTEXT-FORMAT.md)
- docs/adr/*.md

## Entry

**MUST run**
`,
    );
    try {
      const graph = toTaskflowGraph({
        name: 'probe-graph',
        version: 1,
        phases: [
          {
            id: 'p',
            type: 'main',
            dependsOn: [],
            skill: 'annotated-skill',
            channels: ['node:up', 'skill:codebase-design', 'docs/adr/*.md'],
            task: 'x',
          },
        ],
      });
      const { errors, warnings } = await validateEntrySkillContracts([{ filePath: 'probe.yaml', graph }], dir, {
        checkOrphans: false,
      });
      expect(errors).toEqual([]);
      expect(warnings.some((w) => w.includes('declares file'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

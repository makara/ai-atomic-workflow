import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  globMatchesAny,
  validateEntrySkillContracts,
  validateGraphContracts,
  validateProjectContext,
} from '../src/context/contracts.js';
import { DEFAULT_CONVENTIONS } from '../src/context/resolve-channels.js';

function makeDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'tier-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function makeSkillsDir(entries: Record<string, string>): { dir: string; cleanup: () => void } {
  const { dir, cleanup } = makeDir();
  for (const [name, body] of Object.entries(entries)) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'SKILL.md'), body);
  }
  return { dir, cleanup };
}

const SKILL_FILES_CONTRACT = (files: string): string => `---
name: picker
description: x
---

## Context Requirements

### Files

${files}
`;

const baseGraph = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'g',
  version: 1,
  phases: [{ id: 'p', type: 'main', dependsOn: [], task: 'x' }],
  ...over,
});

describe('three-tier channel model — graph-level context', () => {
  it('rejects project file glob in graph context (tier violation)', () => {
    const { errors } = validateGraphContracts(baseGraph({ context: ['docs/adr/*.md'] }), 'g.yaml');
    expect(errors.some((e) => e.includes('docs/adr/*.md') && e.includes('workflow runtime artifacts'))).toBe(true);
  });

  it('accepts workflow artifact glob in graph context', () => {
    const { errors } = validateGraphContracts(baseGraph({ context: ['.graph-scheduler/docs/x.md'] }), 'g.yaml');
    expect(errors.some((e) => e.includes('.graph-scheduler/docs/x.md'))).toBe(false);
  });

  it('accepts skill: and node: context entries', () => {
    const { errors } = validateGraphContracts(baseGraph({ context: ['skill:codebase-design', 'node:p'] }), 'g.yaml');
    expect(errors).toHaveLength(0);
  });

  it('still rejects bare-name context entries (regression)', () => {
    const { errors } = validateGraphContracts(baseGraph({ context: ['naked-name'] }), 'g.yaml');
    expect(errors.some((e) => e.includes('bare name'))).toBe(true);
  });
});

describe('three-tier channel model — phase channels', () => {
  it('rejects project file glob in phase channels (tier violation)', async () => {
    const { dir, cleanup } = makeSkillsDir({ picker: SKILL_FILES_CONTRACT('- docs/adr/') });
    try {
      const graph = baseGraph({
        phases: [{ id: 'p', type: 'main', dependsOn: [], skill: 'picker', channels: ['docs/adr/*.md'], task: 'x' }],
      });
      const { errors } = await validateEntrySkillContracts([{ filePath: 'g.yaml', graph }], dir, {
        checkOrphans: false,
      });
      expect(errors.some((e) => e.includes('docs/adr/*.md') && e.includes('workflow runtime artifacts'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('accepts workflow artifact glob in phase channels', async () => {
    const { dir, cleanup } = makeSkillsDir({ picker: SKILL_FILES_CONTRACT('- .graph-scheduler/docs/x.md') });
    try {
      const graph = baseGraph({
        phases: [
          {
            id: 'p',
            type: 'main',
            dependsOn: [],
            skill: 'picker',
            channels: ['.graph-scheduler/docs/x.md'],
            task: 'x',
          },
        ],
      });
      const { errors } = await validateEntrySkillContracts([{ filePath: 'g.yaml', graph }], dir, {
        checkOrphans: false,
      });
      expect(errors.some((e) => e.includes('workflow runtime artifacts'))).toBe(false);
    } finally {
      cleanup();
    }
  });
});

describe('three-tier channel model — coverage via convention/project layers', () => {
  it('satisfies forward coverage through the convention layer — absence-tolerant', async () => {
    const { dir, cleanup } = makeSkillsDir({ picker: SKILL_FILES_CONTRACT('- CONTEXT.md') });
    try {
      // fresh-scaffold absence: the convention file does NOT exist on disk —
      // conventions are never existence-checked (absence-tolerance by
      // construction), coverage still passes via the convention layer.
      expect(existsSync(join(dir, 'CONTEXT.md'))).toBe(false);
      const graph = baseGraph({ phases: [{ id: 'p', type: 'main', dependsOn: [], skill: 'picker', task: 'x' }] });
      const { errors } = await validateEntrySkillContracts([{ filePath: 'g.yaml', graph }], dir, {
        checkOrphans: false,
      });
      expect(errors.some((e) => e.includes('declares file'))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('satisfies forward coverage through the project layer', async () => {
    const { dir, cleanup } = makeSkillsDir({ picker: SKILL_FILES_CONTRACT('- docs/adr/') });
    try {
      const graph = baseGraph({ phases: [{ id: 'p', type: 'main', dependsOn: [], skill: 'picker', task: 'x' }] });
      const { errors } = await validateEntrySkillContracts([{ filePath: 'g.yaml', graph }], dir, {
        checkOrphans: false,
        projectContext: ['docs/adr/*.md'],
      });
      expect(errors.some((e) => e.includes('declares file'))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('still errors on uncovered contract files (deletion never silent)', async () => {
    const { dir, cleanup } = makeSkillsDir({ picker: SKILL_FILES_CONTRACT('- docs/specs/') });
    try {
      const graph = baseGraph({ phases: [{ id: 'p', type: 'main', dependsOn: [], skill: 'picker', task: 'x' }] });
      const { errors } = await validateEntrySkillContracts([{ filePath: 'g.yaml', graph }], dir, {
        checkOrphans: false,
      });
      expect(errors.some((e) => e.includes('declares file'))).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('three-tier channel model — project layer existence', () => {
  it('errors on exact-file entry that does not exist', () => {
    const { dir, cleanup } = makeDir();
    try {
      const { errors } = validateProjectContext(['docs/estate/index.md'], dir);
      expect(errors.some((e) => e.includes('does not exist'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('passes exact-file entry that exists', () => {
    const { dir, cleanup } = makeDir();
    try {
      mkdirSync(join(dir, 'docs'));
      writeFileSync(join(dir, 'docs', 'estate.md'), 'x');
      const { errors, warnings } = validateProjectContext(['./docs/estate.md'], dir);
      expect(errors).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('warns on glob zero-match (lazy document creation legal)', () => {
    const { dir, cleanup } = makeDir();
    try {
      const { errors, warnings } = validateProjectContext(['docs/adr/*.md'], dir);
      expect(errors).toHaveLength(0);
      expect(warnings.some((e) => e.includes('matches zero files'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('passes glob that matches files', () => {
    const { dir, cleanup } = makeDir();
    try {
      mkdirSync(join(dir, 'openspec', 'specs', 'adr'), { recursive: true });
      writeFileSync(join(dir, 'openspec', 'specs', 'adr', 'spec.md'), 'x');
      const { errors, warnings } = validateProjectContext(['openspec/specs/**/*.md'], dir);
      expect(errors).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});

describe('globMatchesAny', () => {
  it('matches ** across directories', () => {
    const { dir, cleanup } = makeDir();
    try {
      mkdirSync(join(dir, 'a', 'b'), { recursive: true });
      writeFileSync(join(dir, 'a', 'b', 'c.md'), 'x');
      expect(globMatchesAny('a/**/*.md', dir)).toBe(true);
      expect(globMatchesAny('a/**/*.ts', dir)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('returns false when static prefix missing', () => {
    const { dir, cleanup } = makeDir();
    try {
      expect(globMatchesAny('nope/*.md', dir)).toBe(false);
    } finally {
      cleanup();
    }
  });
});

describe('convention layer constant', () => {
  it('is exact files only — no dir-class, no globs', () => {
    expect(DEFAULT_CONVENTIONS).toEqual(['./CONTEXT.md', 'docs/domains.md']);
    for (const entry of DEFAULT_CONVENTIONS) {
      expect(entry).not.toMatch(/[*?\[]/);
    }
  });
});

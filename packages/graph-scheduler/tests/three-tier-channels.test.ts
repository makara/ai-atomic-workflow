/**
 * Three-tier channel model — engine-side machine validation only.
 *
 * The engine validates what it owns: graph-level context entry shape (the
 * global channel's graph layer), user-supplement layer existence, and the
 * convention-layer constant. Skill prose is never parsed — phase-channel
 * tier enforcement was agent-side contract coverage (deleted with the
 * entry-skill machinery); phase channels pass through shape-validated.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globMatchesAny, validateGraphContracts, validateProjectContext } from '../src/context/contracts.js';
import { DEFAULT_CONVENTIONS } from '../src/context/resolve-channels.js';

function makeDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'tier-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const baseGraph = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'g',

  phases: [{ id: 'p', type: 'main', dependsOn: [], task: 'x', operations: [] }],
  ...over,
});

describe('three-tier channel model — graph-level context', () => {
  it('rejects project file glob in graph context (tier violation)', () => {
    const { errors } = validateGraphContracts(baseGraph({ context: ['docs/adr/*.md'] }), 'g.yaml');
    expect(errors.some((e) => e.includes('docs/adr/*.md') && e.includes('workflow runtime artifacts'))).toBe(true);
  });

  it('accepts workflow artifact glob in graph context', () => {
    const { errors } = validateGraphContracts(baseGraph({ context: ['.graph-scheduler/graphs/x.yaml'] }), 'g.yaml');
    expect(errors.some((e) => e.includes('.graph-scheduler/graphs/x.yaml'))).toBe(false);
  });

  it('accepts skill: and node: context entries', () => {
    const { errors } = validateGraphContracts(baseGraph({ context: ['skill:codebase-design', 'node:p'] }), 'g.yaml');
    expect(errors).toHaveLength(0);
  });

  it('still rejects bare-name context entries (regression)', () => {
    const { errors } = validateGraphContracts(baseGraph({ context: ['naked-name'] }), 'g.yaml');
    expect(errors.some((e) => e.includes('bare name'))).toBe(true);
  });

  it('warns (never errors) on convention-layer declaration in graph context', () => {
    const { errors, warnings } = validateGraphContracts(baseGraph({ context: ['./CONTEXT.md'] }), 'g.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('convention-layer') && w.includes('./CONTEXT.md'))).toBe(true);
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

  it('matches ** with zero directory levels', () => {
    const { dir, cleanup } = makeDir();
    try {
      mkdirSync(join(dir, 'a'), { recursive: true });
      writeFileSync(join(dir, 'a', 'c.md'), 'x');
      expect(globMatchesAny('a/**/*.md', dir)).toBe(true);
      expect(globMatchesAny('a/**', dir)).toBe(true);
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

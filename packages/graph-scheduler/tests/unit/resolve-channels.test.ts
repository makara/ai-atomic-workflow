/**
 * Unit tests for resolve-channels — engine-side channel shape validation.
 *
 * The engine validates what it owns: channel shape (explicit prefixes, glob
 * namespaces, convention guard, run-scope protection). Skill `## Context
 * Requirements` contracts are agent-side knowledge — the engine never parses
 * skill prose. All contract-parsing machinery (parseContextContract,
 * resolveChannels, stripAnnotation) is deleted.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONVENTIONS,
  isConventionFile,
  isGlobShape,
  isNodeInRun,
  isVocabularyFile,
  isWorkflowArtifactGlob,
  mergeChannelScopes,
  normFile,
  REFERENCE_VOCABULARY,
  runScopeWarning,
  stripOutOfRunChannels,
  stripPrefix,
} from '../../src/context/resolve-channels.js';

describe('stripPrefix', () => {
  it('strips explicit skill: prefix', () => {
    expect(stripPrefix('skill:atom-graph-spec')).toEqual({ type: 'skill', target: 'atom-graph-spec' });
  });

  it('strips explicit node: prefix', () => {
    expect(stripPrefix('node:plan-parse')).toEqual({ type: 'node', target: 'plan-parse' });
  });

  it('returns null for unprefixed entries — no fallback', () => {
    expect(stripPrefix('scope-confirm')).toBeNull();
    expect(stripPrefix('./CONTEXT.md')).toBeNull();
    expect(stripPrefix('')).toBeNull();
  });
});

describe('isGlobShape', () => {
  it('detects path separators and glob wildcards', () => {
    expect(isGlobShape('docs/designs/*.md')).toBe(true);
    expect(isGlobShape('src/file?.ts')).toBe(true);
    expect(isGlobShape('file-[0-9].md')).toBe(true);
  });

  it('rejects bare names', () => {
    expect(isGlobShape('scope-confirm')).toBe(false);
    expect(isGlobShape('atom-graph-spec')).toBe(false);
  });
});

describe('isConventionFile', () => {
  it('matches convention-layer paths by normalized membership', () => {
    expect(DEFAULT_CONVENTIONS).toEqual(['./CONTEXT.md', 'docs/domains.md']);
    expect(isConventionFile('./CONTEXT.md')).toBe(true);
    expect(isConventionFile('CONTEXT.md')).toBe(true);
    expect(isConventionFile('docs/domains.md')).toBe(true);
    expect(isConventionFile('./docs/domains.md')).toBe(true);
  });

  it('rejects non-convention paths and near-misses', () => {
    expect(isConventionFile('docs/adr/*.md')).toBe(false);
    expect(isConventionFile('CONTEXT.mdx')).toBe(false);
    expect(isConventionFile('README.md')).toBe(false);
  });
});

describe('isVocabularyFile', () => {
  it('matches exact vocabulary paths', () => {
    expect(isVocabularyFile('README.md')).toBe(true);
    expect(isVocabularyFile('./CHANGELOG.md')).toBe(true);
    expect(isVocabularyFile('docs/domains.md')).toBe(true);
  });

  it('matches dir/** vocabulary patterns against the directory and descendants', () => {
    expect(REFERENCE_VOCABULARY).toContain('docs/adr/**');
    expect(isVocabularyFile('docs/adr')).toBe(true);
    expect(isVocabularyFile('docs/adr/2026-08-11-foo.md')).toBe(true);
    expect(isVocabularyFile('docs/adr/nested/dir/file.md')).toBe(true);
  });

  it('rejects paths outside the vocabulary', () => {
    expect(isVocabularyFile('docs/designs/blueprint.md')).toBe(false);
    expect(isVocabularyFile('src/main.ts')).toBe(false);
    expect(isVocabularyFile('docs/adr.md')).toBe(false); // near-miss, not under docs/adr/
  });
});

describe('isWorkflowArtifactGlob', () => {
  it('accepts workflow runtime artifact namespace globs', () => {
    expect(isWorkflowArtifactGlob('.graph-scheduler/artifacts/*.md')).toBe(true);
    expect(isWorkflowArtifactGlob('.taskflow/**')).toBe(true);
    expect(isWorkflowArtifactGlob('.graph-scheduler')).toBe(true);
  });

  it('rejects non-artifact glob targets', () => {
    expect(isWorkflowArtifactGlob('docs/designs/*.md')).toBe(false);
    expect(isWorkflowArtifactGlob('docs/adr/*.md')).toBe(false);
  });
});

describe('normFile', () => {
  it('strips leading ./ and trailing /', () => {
    expect(normFile('./CONTEXT.md')).toBe('CONTEXT.md');
    expect(normFile('docs/adr/')).toBe('docs/adr');
    expect(normFile('./docs/domains.md')).toBe('docs/domains.md');
    expect(normFile('README.md')).toBe('README.md');
  });
});

describe('isNodeInRun', () => {
  it('true when the target is in the run node set', () => {
    expect(isNodeInRun('scope-confirm', new Set(['scope-confirm', 'plan-parse']))).toBe(true);
  });

  it('false when the target is outside the run node set', () => {
    expect(isNodeInRun('loop-entry', new Set(['scope-confirm', 'plan-parse']))).toBe(false);
  });

  it('absent runNodeIds skips the gate — validation paths', () => {
    expect(isNodeInRun('anything', undefined)).toBe(true);
  });
});

describe('runScopeWarning', () => {
  it('mentions the display target and the run-scope protection rationale', () => {
    const w = runScopeWarning('node:loop-entry');
    expect(w).toContain('node:loop-entry');
    expect(w).toContain('current run');
  });
});

describe('mergeChannelScopes', () => {
  it('returns undefined when every scope is empty/absent', () => {
    expect(mergeChannelScopes()).toBeUndefined();
    expect(mergeChannelScopes([], undefined, [])).toBeUndefined();
  });

  it('returns the sole non-empty scope by reference — zero-copy fast path', () => {
    const phase = ['./CONTEXT.md', 'node:spec'];
    expect(mergeChannelScopes(undefined, undefined, phase)).toBe(phase);
  });

  it('merges scopes outer-first with exact-string dedup', () => {
    const project = ['./CONTEXT.md', 'docs/adr/*.md'];
    const graph = ['./CONTEXT.md', 'skill:atom-graph-spec'];
    const phase = ['node:spec', 'skill:atom-graph-spec'];
    const merged = mergeChannelScopes(project, graph, phase);
    expect(merged).toEqual(['./CONTEXT.md', 'docs/adr/*.md', 'skill:atom-graph-spec', 'node:spec']);
  });

  it('preserves per-scope order and skips empty middle scopes', () => {
    const merged = mergeChannelScopes(['a', 'b'], [], undefined, ['c', 'a']);
    expect(merged).toEqual(['a', 'b', 'c']);
  });
});

describe('stripOutOfRunChannels', () => {
  const runNodeIds = new Set(['scope-confirm', 'plan-parse']);

  it('returns input reference unchanged when nothing is stripped', () => {
    const channels = ['skill:atom-graph-spec', 'node:scope-confirm'];
    const r = stripOutOfRunChannels(channels, runNodeIds);
    expect(r.channels).toBe(channels);
    expect(r.warnings).toEqual([]);
  });

  it('strips out-of-run node: entries and warns', () => {
    const r = stripOutOfRunChannels(['node:loop-entry', 'node:scope-confirm'], runNodeIds);
    expect(r.channels).toEqual(['node:scope-confirm']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('node:loop-entry');
  });

  it('lazy copy preserves prior entries when stripping mid-list', () => {
    const r = stripOutOfRunChannels(['skill:a', 'node:loop-entry', 'node:plan-parse'], runNodeIds);
    expect(r.channels).toEqual(['skill:a', 'node:plan-parse']);
    expect(r.warnings).toHaveLength(1);
  });

  it('skips stripping when runNodeIds is absent — validation paths', () => {
    const channels = ['node:loop-entry'];
    const r = stripOutOfRunChannels(channels, undefined);
    expect(r.channels).toBe(channels);
    expect(r.warnings).toEqual([]);
  });

  it('handles undefined channels', () => {
    const r = stripOutOfRunChannels(undefined, runNodeIds);
    expect(r.channels).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });
});

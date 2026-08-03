/**
 * Unit tests for resolve-channels — scoped-context contract parser + channel resolver.
 *
 * Contract: skill `## Context Requirements` three subsections are the single
 * source of truth; channel type derived from contract lookup; explicit
 * `skill:`/`node:` prefixes always win; no fallback search; no-match = error;
 * dependsOn duplicate = warning.
 */

import { describe, expect, it } from 'vitest';
import { parseContextContract, resolveChannels } from '../../src/context/resolve-channels.js';

const SAMPLE_SKILL = `---
name: sample-skill
description: test
---

## Context Requirements

### From upstream

- scope-confirm
- plan-parse

### Reference skills

- atom-graph-spec

### Files

- CONTEXT.md
- docs/adr/

## Entry

**MUST run**
`;

describe('parseContextContract', () => {
  it('parses three subsections into typed lists', () => {
    const c = parseContextContract(SAMPLE_SKILL);
    expect(c.upstream).toEqual(['scope-confirm', 'plan-parse']);
    expect(c.references).toEqual(['atom-graph-spec']);
    expect(c.files).toEqual(['CONTEXT.md', 'docs/adr/']);
    expect(c.errors).toEqual([]);
  });

  it('returns empty contract when section absent', () => {
    const c = parseContextContract('no requirements here');
    expect(c.upstream).toEqual([]);
    expect(c.references).toEqual([]);
    expect(c.files).toEqual([]);
    expect(c.errors).toEqual([]);
  });

  it('rejects placeholder entries', () => {
    const c = parseContextContract(`## Context Requirements

### From upstream

- <configurable — decided at graph authoring>
`);
    expect(c.errors.length).toBeGreaterThan(0);
    expect(c.errors[0]).toContain('placeholder');
  });

  it('stops subsection scan at next ### heading', () => {
    const c = parseContextContract(`## Context Requirements

### From upstream

- a-node

### Reference skills

- a-skill

## Entry

- not-a-reference
`);
    expect(c.upstream).toEqual(['a-node']);
    expect(c.references).toEqual(['a-skill']);
  });

  it('ignores fenced subsection examples — fence content never contributes entries', () => {
    const c = parseContextContract(`## Context Requirements

### From upstream

- real-node

\`\`\`markdown
### From upstream

- fake-node
\`\`\`

### Files

- real-file
`);
    expect(c.upstream).toEqual(['real-node']);
    expect(c.files).toEqual(['real-file']);
  });

  it('treats skill whose only Context Requirements is fenced as contract-less', () => {
    const c = parseContextContract(`## Body

\`\`\`markdown
## Context Requirements

### From upstream

- <nodeId>

### Reference skills

- <skill-name>

### Files

- <glob>
\`\`\`
`);
    expect(c.upstream).toEqual([]);
    expect(c.references).toEqual([]);
    expect(c.files).toEqual([]);
    expect(c.errors).toEqual([]);
  });

  it('fenced placeholder examples produce no placeholder errors', () => {
    const c = parseContextContract(`## Context Requirements

### From upstream

- real-node

\`\`\`
### From upstream

- <configurable — decided at graph authoring>
\`\`\`
`);
    expect(c.upstream).toEqual(['real-node']);
    expect(c.errors).toEqual([]);
  });
});

describe('resolveChannels', () => {
  const contract = parseContextContract(SAMPLE_SKILL);

  it('resolves explicit skill: prefix to reference', () => {
    const r = resolveChannels({ channels: ['skill:atom-graph-spec'], dependsOn: [], contract });
    expect(r.references).toEqual(['atom-graph-spec']);
    expect(r.errors).toEqual([]);
  });

  it('resolves explicit node: prefix to upstream (cross-level allowed)', () => {
    const r = resolveChannels({ channels: ['node:plan-parse'], dependsOn: ['scope-confirm'], contract });
    expect(r.upstream).toEqual(['plan-parse']);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('resolves bare contract upstream match', () => {
    const r = resolveChannels({ channels: ['scope-confirm'], dependsOn: ['scope-confirm'], contract });
    expect(r.upstream).toEqual([]); // implicit coverage — skipped
    expect(r.warnings.join(' ')).toContain('scope-confirm'); // redundant declaration
  });

  it('warns on bare cross-level upstream — node: prefix required', () => {
    const r = resolveChannels({ channels: ['plan-parse'], dependsOn: ['scope-confirm'], contract });
    expect(r.upstream).toEqual(['plan-parse']);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain('node:');
  });

  it('resolves exact contract files match without glob shape', () => {
    const r = resolveChannels({ channels: ['CONTEXT.md'], dependsOn: [], contract });
    expect(r.files).toEqual(['CONTEXT.md']);
  });

  it('resolves bare contract reference match', () => {
    const r = resolveChannels({ channels: ['atom-graph-spec'], dependsOn: [], contract });
    expect(r.references).toEqual(['atom-graph-spec']);
  });

  it('resolves file glob by shape', () => {
    const r = resolveChannels({ channels: ['./CONTEXT.md', 'docs/adr/*.md'], dependsOn: [], contract });
    expect(r.files).toEqual(['./CONTEXT.md', 'docs/adr/*.md']);
    expect(r.errors).toEqual([]);
  });

  it('resolves single-char wildcard and character-class glob shapes', () => {
    const r = resolveChannels({ channels: ['src/file?.ts', 'file-[0-9].md'], dependsOn: [], contract });
    expect(r.files).toEqual(['src/file?.ts', 'file-[0-9].md']);
    expect(r.errors).toEqual([]);
  });

  it('rejects empty channel entry with clear error', () => {
    const r = resolveChannels({ channels: ['', '  '], dependsOn: [], contract });
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toContain('empty channel entry');
  });

  it('warns on dependsOn duplicate and skips implicit-covered upstream', () => {
    const r = resolveChannels({
      channels: ['scope-confirm', 'node:scope-confirm'],
      dependsOn: ['scope-confirm'],
      contract,
    });
    expect(r.upstream).toEqual([]);
    expect(r.warnings.length).toBe(2);
  });

  it('errors on no-match entry — no fallback search', () => {
    const r = resolveChannels({ channels: ['mystery-name'], dependsOn: [], contract });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('mystery-name');
  });

  it('aggregates multiple errors across entries', () => {
    const r = resolveChannels({ channels: ['a', 'b'], dependsOn: [], contract });
    expect(r.errors).toHaveLength(2);
  });

  it('handles undefined channels and dependsOn', () => {
    const r = resolveChannels({ channels: undefined, dependsOn: undefined, contract });
    expect(r.upstream).toEqual([]);
    expect(r.references).toEqual([]);
    expect(r.files).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('run-scoped: node: target outside the current run warns and skips — stale file never resolves', () => {
    const r = resolveChannels({
      channels: ['node:loop-entry'],
      dependsOn: [],
      contract,
      runNodeIds: new Set(['scope-detect', 'arch-review']),
    });
    expect(r.upstream).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain('node:loop-entry');
    expect(r.warnings[0]).toContain('current run');
  });

  it('run-scoped: node: target inside the current run resolves normally', () => {
    const r = resolveChannels({
      channels: ['node:loop-entry'],
      dependsOn: [],
      contract,
      runNodeIds: new Set(['loop-entry', 'arch-review']),
    });
    expect(r.upstream).toEqual(['loop-entry']);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('run-scoped: contract upstream match outside the run warns and skips', () => {
    const r = resolveChannels({
      channels: ['plan-parse'],
      dependsOn: [],
      contract,
      runNodeIds: new Set(['scope-confirm']),
    });
    expect(r.upstream).toEqual([]);
    expect(r.warnings.join(' ')).toContain('plan-parse');
  });

  it('run-scoped: dependsOn-covered target stays implicit — no scope warning', () => {
    const r = resolveChannels({
      channels: ['node:scope-confirm'],
      dependsOn: ['scope-confirm'],
      contract,
      runNodeIds: new Set(['scope-confirm']),
    });
    expect(r.upstream).toEqual([]);
    expect(r.warnings.join(' ')).toContain('redundant declaration');
    expect(r.warnings.join(' ')).not.toContain('current run');
  });

  it('run-scoped: absent runNodeIds keeps legacy behavior (validation paths)', () => {
    const r = resolveChannels({ channels: ['node:plan-parse'], dependsOn: [], contract });
    expect(r.upstream).toEqual(['plan-parse']);
    expect(r.warnings).toEqual([]);
  });

  it('run-scoped: flow-propagated node: channel observes the same scope (in-run resolves, out-of-run warns)', () => {
    // flow input channels propagate to entry children as plain node:
    // entries — the same run-scope gate applies
    const inRun = resolveChannels({
      channels: ['node:loop-entry'],
      dependsOn: [],
      contract,
      runNodeIds: new Set(['loop-entry', 'review/arch-review']),
    });
    expect(inRun.upstream).toEqual(['loop-entry']);
    const outRun = resolveChannels({
      channels: ['node:loop-entry'],
      dependsOn: [],
      contract,
      runNodeIds: new Set(['review/arch-review']),
    });
    expect(outRun.upstream).toEqual([]);
    expect(outRun.warnings.join(' ')).toContain('current run');
  });
});

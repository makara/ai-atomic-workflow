/**
 * Unit tests for the non-interactive compliance scanner (interaction-scan.ts).
 *
 * Machine surface for graph-maintain's audit: tolerant raw-YAML scan of
 * interaction markers per phase; declared-`none` graphs only.
 */
import { describe, expect, it } from 'vitest';
import { interactionMarkers, nonInteractiveCompliance } from '../../src/schemas/interaction-scan.js';

describe('interactionMarkers — per-phase marker scan', () => {
  it('finds task-token markers (Interview:/confirm:)', () => {
    const parsed = {
      name: 'g',
      interaction: 'none',
      phases: [
        { id: 'entry', type: 'main', task: 'Interview: confirm the scope', dependsOn: [], operations: [] },
        { id: 'work', type: 'main', task: 'run the analysis; confirm: proceed', dependsOn: ['entry'], operations: [] },
      ],
    };
    const findings = interactionMarkers(parsed);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ phaseId: 'entry', markers: [{ kind: 'task-token' }] });
    expect(findings[1].markers.some((m) => m.kind === 'task-token')).toBe(true);
  });

  it('finds interaction-skill markers', () => {
    const parsed = {
      name: 'g',
      phases: [
        { id: 'entry', type: 'main', skill: 'atom-scope-interview', task: 'scope', dependsOn: [], operations: [] },
        { id: 'talk', type: 'main', skill: 'grilling', task: 'converse', dependsOn: ['entry'], operations: [] },
      ],
    };
    const findings = interactionMarkers(parsed);
    expect(findings.map((f) => f.phaseId)).toEqual(['entry', 'talk']);
    expect(findings[0].markers).toContainEqual({ kind: 'interaction-skill', evidence: 'skill: atom-scope-interview' });
  });

  it('finds direct-end declarations', () => {
    const parsed = {
      name: 'g',
      phases: [
        { id: 'accept', type: 'main', task: 'confirm\ndirect end: end the round.', dependsOn: [], operations: [] },
      ],
    };
    const findings = interactionMarkers(parsed);
    expect(findings).toHaveLength(1);
    expect(findings[0].markers.some((m) => m.kind === 'direct-end')).toBe(true);
  });

  it('clean phases yield no findings — negative wording not matched', () => {
    const parsed = {
      name: 'g',
      phases: [
        {
          id: 'explore',
          type: 'main',
          task: 'read-only walk, no interview, no user questions',
          dependsOn: [],
          operations: [],
        },
        {
          id: 'apply',
          type: 'main',
          task: 'NEVER ask the user; self-deciding',
          dependsOn: ['explore'],
          operations: [],
        },
      ],
    };
    expect(interactionMarkers(parsed)).toEqual([]);
  });

  it('tolerates non-object and missing phases shapes', () => {
    expect(interactionMarkers(null)).toEqual([]);
    expect(interactionMarkers(42)).toEqual([]);
    expect(interactionMarkers({ name: 'g' })).toEqual([]);
    expect(interactionMarkers({ name: 'g', phases: [{ id: 'x' }] })).toEqual([]);
  });
});

describe('nonInteractiveCompliance — declared-none gating', () => {
  const interactive = {
    name: 'g',
    interaction: 'none',
    phases: [{ id: 'entry', type: 'main', task: 'Interview: confirm', dependsOn: [], operations: [] }],
  };

  it('declared none with markers → findings', () => {
    const result = nonInteractiveCompliance(interactive);
    expect(result.declared).toBe(true);
    expect(result.findings).toHaveLength(1);
  });

  it('declared none with zero markers → clean', () => {
    const result = nonInteractiveCompliance({
      name: 'g',
      interaction: 'none',
      phases: [{ id: 'work', type: 'main', task: 'run', dependsOn: [], operations: [] }],
    });
    expect(result).toEqual({ declared: true, findings: [] });
  });

  it('enabled (explicit) is never scanned', () => {
    const result = nonInteractiveCompliance({
      name: 'g',
      interaction: 'enabled',
      phases: [{ id: 'entry', type: 'main', task: 'Interview: confirm', dependsOn: [], operations: [] }],
    });
    expect(result).toEqual({ declared: false, findings: [] });
  });

  it('absent declaration is never scanned', () => {
    const result = nonInteractiveCompliance({
      name: 'g',
      phases: [{ id: 'entry', type: 'main', task: 'Interview: confirm', dependsOn: [], operations: [] }],
    });
    expect(result).toEqual({ declared: false, findings: [] });
  });
});

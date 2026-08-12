import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findFrameClause, renderDisciplineLine } from '../src/core/discipline.js';

const skillPath = fileURLToPath(new URL('../../graph-workflow/skills/atom-phase-handler/SKILL.md', import.meta.url));

const FRAME = `## Run Frame
Run fa03fd46 · node requirement/arch-review · type main · task: Execute architecture review.
declared operations [locate, read, write, review] · out of scope: <read/write/locate minus declared>
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.
Do not start work outside the node. On completion: report node output, then graph_advance.`;

describe('frame contract pin (echo ↔ handler prose)', () => {
  const skill = readFileSync(skillPath, 'utf8');

  it('handler skill documents the discipline line format the echo parses', () => {
    expect(skill).toMatch(/declared operations \[<node\.operations>\]/);
    expect(skill).toMatch(/out of scope: <read\/write\/locate minus declared>/);
  });

  it('echo clause grammar matches the handler contract', () => {
    const clause = findFrameClause([FRAME])?.clause;
    expect(clause).toMatch(/^declared operations \[[^\]]*\] · out of scope: <[^>]*>$/);
    const line = renderDisciplineLine([FRAME]);
    expect(line).toMatch(/^\[seam\] node [\w\-/]+ declares \[[^\]]*\] · out of scope: <[^>]*> — per run frame$/);
  });

  it('echo never adds facts absent from the frame', () => {
    const line = renderDisciplineLine([FRAME]);
    expect(line).toContain('declares [locate, read, write, review]');
    expect(line).toContain('<read/write/locate minus declared>');
    // The echo contains no operation not present in the frame's declaration.
    expect(line).not.toContain('verify');
  });
});

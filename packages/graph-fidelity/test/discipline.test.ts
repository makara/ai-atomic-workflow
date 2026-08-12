import { describe, expect, it } from 'vitest';
import { applyDisciplineEcho, findFrameClause, renderDisciplineLine, SEAM_MARKER } from '../src/core/discipline.js';

const FRAME = `## Run Frame
Run fa03fd46-5364-4268-893c-144e589f686f · node requirement/arch-review · type main · task: Execute architecture review.
declared operations [locate, read, write, review] · out of scope: <read/write/locate minus declared>
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.
Do not start work outside the node. On completion: report node output, then graph_advance.`;

const USER_TEXT = 'scope 确认: 全链重审。';

describe('findFrameClause', () => {
  it('parses node id and discipline clause from a frame block', () => {
    const found = findFrameClause([USER_TEXT, FRAME]);
    expect(found).toEqual({
      nodeId: 'requirement/arch-review',
      clause: 'declared operations [locate, read, write, review] · out of scope: <read/write/locate minus declared>',
    });
  });

  it('returns undefined when no frame block exists', () => {
    expect(findFrameClause(['plain text', 'more text'])).toBeUndefined();
  });

  it('picks the most recent frame when multiple exist', () => {
    const older = FRAME.replace('requirement/arch-review', 'requirement/scope-entry');
    const newer = FRAME.replace(
      'declared operations [locate, read, write, review]',
      'declared operations [locate, read]',
    );
    const found = findFrameClause([older, USER_TEXT, newer]);
    expect(found?.nodeId).toBe('requirement/arch-review');
    expect(found?.clause).toContain('[locate, read]');
  });
});

describe('renderDisciplineLine', () => {
  it('renders one seam line from the latest frame', () => {
    const line = renderDisciplineLine([USER_TEXT, FRAME]);
    expect(line).toBe(
      '[seam] node requirement/arch-review declares [locate, read, write, review] · out of scope: <read/write/locate minus declared> — per run frame',
    );
  });

  it('returns undefined without a frame', () => {
    expect(renderDisciplineLine(['no frame here'])).toBeUndefined();
  });

  it('is deterministic', () => {
    expect(renderDisciplineLine([USER_TEXT, FRAME])).toBe(renderDisciplineLine([USER_TEXT, FRAME]));
  });
});

describe('applyDisciplineEcho', () => {
  const messages = [
    { role: 'user', text: '开始图运行' },
    { role: 'assistant', text: FRAME },
    { role: 'user', text: USER_TEXT },
  ];

  it('appends the echo to the most recent user message', () => {
    const out = applyDisciplineEcho(messages);
    expect(out).not.toBe(messages);
    expect(out?.[2].text).toContain(SEAM_MARKER);
    expect(out?.[2].text).toContain('node requirement/arch-review');
    expect(out?.[0].text).toBe('开始图运行');
    expect(out?.[1].text).toBe(FRAME);
  });

  it('skips when the user message already carries the seam marker', () => {
    const already = [...messages];
    already[2] = { role: 'user', text: `${USER_TEXT}\n${SEAM_MARKER} node requirement/arch-review declares …` };
    expect(applyDisciplineEcho(already)).toBeUndefined();
  });

  it('returns undefined when no frame exists', () => {
    const noFrame = messages.map((m) => ({ ...m, text: m.text === FRAME ? 'plain' : m.text }));
    expect(applyDisciplineEcho(noFrame)).toBeUndefined();
  });

  it('returns undefined when there is no user message', () => {
    expect(applyDisciplineEcho([{ role: 'system', text: FRAME }])).toBeUndefined();
  });
});

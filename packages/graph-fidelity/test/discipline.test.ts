import { describe, expect, it } from 'vitest';
import { applyDisciplineEcho, SEAM_MARKER, stripSeamLines } from '../src/core/discipline.js';

const LINE = '[seam] node requirement/arch-review · 2 req · 4.2k in';
const messages = (): Array<{ role: string; text: string }> => [
  { role: 'system', text: 'platform' },
  { role: 'user', text: '开始图运行' },
  { role: 'assistant', text: 'node work' },
  { role: 'user', text: 'scope 确认' },
];

describe('applyDisciplineEcho', () => {
  it('appends the rendered line to the most recent user message', () => {
    const out = applyDisciplineEcho(messages(), LINE);
    expect(out?.[3]?.text).toBe(`scope 确认\n${LINE}`);
    expect(out?.[1]?.text).toBe('开始图运行'); // other messages untouched
  });

  it('skips when the user message already carries the exact canonical line', () => {
    const msgs = messages();
    msgs[3] = { role: 'user', text: `scope 确认\n${LINE}` };
    expect(applyDisciplineEcho(msgs, LINE)).toBeUndefined();
  });

  it('replaces a stale seam line in place (in-place refresh — one line only)', () => {
    const msgs = messages();
    msgs[3] = { role: 'user', text: `scope 确认\n${SEAM_MARKER} node requirement/arch-review` };
    const out = applyDisciplineEcho(msgs, LINE);
    const text = out?.[3]?.text ?? '';
    expect(text).toContain(LINE);
    expect(text.match(/\[seam\] node /g)).toHaveLength(1);
    expect(text).not.toContain('⚠');
  });

  it('replaces a non-canonical seam line (self-heal)', () => {
    const msgs = messages();
    msgs[3] = { role: 'user', text: 'scope 确认\n[seam] node garbage declares junk — corrupted doc-text render' };
    const out = applyDisciplineEcho(msgs, LINE);
    expect(out?.[3]?.text).toBe(`scope 确认\n${LINE}`);
  });

  it('returns undefined when there is no user message', () => {
    expect(applyDisciplineEcho([{ role: 'system', text: LINE }], LINE)).toBeUndefined();
  });
});

describe('stripSeamLines', () => {
  it('removes seam-prefixed lines, keeping other content', () => {
    expect(stripSeamLines(`a\n${SEAM_MARKER} node x\nb\n[seam] node y`)).toBe('a\nb');
  });
});

describe('user-like role anchors (D12-1)', () => {
  it('appends the echo to a developer-role message (OMP custom_message delivery shape)', () => {
    const msgs = [
      { role: 'developer', text: 'skill prompt + user invocation' },
      { role: 'assistant', text: 'node work' },
    ];
    const out = applyDisciplineEcho(msgs, LINE);
    expect(out?.[0]?.text).toBe(`skill prompt + user invocation\n${LINE}`);
    expect(out?.[1]?.text).toBe('node work'); // other messages untouched
  });

  it('appends the echo to a custom-role message', () => {
    const msgs = [{ role: 'custom', text: 'user input carrier' }];
    const out = applyDisciplineEcho(msgs, LINE);
    expect(out?.[0]?.text).toBe(`user input carrier\n${LINE}`);
  });

  it('degrades silently when no user-like message exists (fail-open)', () => {
    const msgs = [
      { role: 'system', text: 'platform' },
      { role: 'assistant', text: 'work' },
      { role: 'toolResult', text: 'result' },
    ];
    expect(applyDisciplineEcho(msgs, LINE)).toBeUndefined();
  });
});

describe('echo fallback anchor (frame-only transcripts)', () => {
  const FRAME_TEXT = '## Run Frame\nRun 1e0716d6-19c3-4ad3-8279-e37571b3e1fc · node requirement/arch-review';

  it('appends the echo to the latest anchored frame message when no user-like message exists', () => {
    const msgs = [
      { role: 'system', text: 'platform' },
      { role: 'assistant', text: 'node work' },
      { role: 'assistant', text: FRAME_TEXT },
    ];
    const out = applyDisciplineEcho(msgs, LINE);
    expect(out?.[2]?.text).toBe(`${FRAME_TEXT}\n${LINE}`);
  });

  it('still degrades silently when no user-like message and no frame exist (fail-open)', () => {
    const msgs = [
      { role: 'system', text: 'platform' },
      { role: 'assistant', text: 'work' },
      { role: 'toolResult', text: 'result' },
    ];
    expect(applyDisciplineEcho(msgs, LINE)).toBeUndefined();
  });

  it('prefers the most recent user-like message over the frame fallback', () => {
    const msgs = [
      { role: 'user', text: 'scope 确认' },
      { role: 'assistant', text: FRAME_TEXT },
    ];
    const out = applyDisciplineEcho(msgs, LINE);
    expect(out?.[0]?.text).toBe(`scope 确认\n${LINE}`);
  });
});

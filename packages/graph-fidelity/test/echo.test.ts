import { describe, expect, it } from 'vitest';
import { applyOmpEcho, type OmpAgentMessage } from '../src/adapters/omp.js';
import { applyOpencodeEcho, type OpencodeMessage } from '../src/adapters/opencode.js';
import { SEAM_MARKER } from '../src/core/discipline.js';

const FRAME = `## Run Frame
Run fa03fd46 · node requirement/arch-review · type main · task: Execute architecture review.
declared operations [locate, read, write, review] · out of scope: <read/write/locate minus declared>
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.`;

/** Same semantic transcript in both platform shapes. */
function ompMessages(): OmpAgentMessage[] {
  return [
    { role: 'user', content: '开始图运行' },
    { role: 'assistant', content: [{ type: 'text', text: FRAME }] },
    { role: 'user', content: 'scope 确认: 全链重审。' },
  ];
}

function opencodeMessages(): OpencodeMessage[] {
  return [
    { role: 'user', parts: [{ type: 'text', text: '开始图运行' }] },
    { role: 'assistant', parts: [{ type: 'text', text: FRAME }] },
    { role: 'user', parts: [{ type: 'text', text: 'scope 确认: 全链重审。' }] },
  ];
}

describe('face byte-identity', () => {
  it('appends the same discipline line on both faces', () => {
    const omp = applyOmpEcho(ompMessages());
    const oc = applyOpencodeEcho(opencodeMessages());
    expect(omp).toBeDefined();
    expect(oc).toBeDefined();
    const ompLine = (omp?.[2].content as string).split('\n').at(-1);
    const ocLine = (oc?.[2].parts?.at(-1) as { text: string }).text;
    expect(ocLine).toBe(ompLine);
    expect(ocLine).toContain(SEAM_MARKER);
    expect(ocLine).toContain('node requirement/arch-review');
    expect(ocLine).toContain('[locate, read, write, review]');
  });

  it('targets the most recent user message only', () => {
    const omp = applyOmpEcho(ompMessages());
    const oc = applyOpencodeEcho(opencodeMessages());
    expect(omp?.[0].content).toBe('开始图运行');
    expect(omp?.[1].content).toEqual([{ type: 'text', text: FRAME }]);
    expect(oc?.[0].parts).toEqual([{ type: 'text', text: '开始图运行' }]);
    expect((oc?.[1].parts as Array<{ text: string }>).at(-1)?.text).toBe(FRAME);
  });

  it('skips both faces when the user message already carries the marker', () => {
    const omp = ompMessages();
    omp[2] = { role: 'user', content: `x\n${SEAM_MARKER} node requirement/arch-review …` };
    const oc = opencodeMessages();
    oc[2] = { role: 'user', parts: [{ type: 'text', text: `x\n${SEAM_MARKER} node requirement/arch-review …` }] };
    expect(applyOmpEcho(omp)).toBeUndefined();
    expect(applyOpencodeEcho(oc)).toBeUndefined();
  });

  it('preserves non-text blocks when appending the echo (OMP content array)', () => {
    const imageBlock = { type: 'image', image: 'data:image/png;base64,AAA' } as never;
    const omp: OmpAgentMessage[] = [
      { role: 'user', content: '开始图运行' },
      { role: 'assistant', content: [{ type: 'text', text: FRAME }] },
      { role: 'user', content: [{ type: 'text', text: '带图消息' }, imageBlock] },
    ];
    const out = applyOmpEcho(omp);
    expect(out).toBeDefined();
    const content = out?.[2].content as Array<{ type: string; text?: string }>;
    expect(content).toHaveLength(3);
    expect(content[1]).toBe(imageBlock); // image block survives
    expect(content[2]).toMatchObject({ type: 'text' });
    expect((content[2] as { text: string }).text).toContain(SEAM_MARKER);
  });

  it('returns undefined on both faces without a frame', () => {
    const omp = ompMessages();
    omp[1] = { role: 'assistant', content: 'plain' };
    const oc = opencodeMessages();
    oc[1] = { role: 'assistant', parts: [{ type: 'text', text: 'plain' }] };
    expect(applyOmpEcho(omp)).toBeUndefined();
    expect(applyOpencodeEcho(oc)).toBeUndefined();
  });
});

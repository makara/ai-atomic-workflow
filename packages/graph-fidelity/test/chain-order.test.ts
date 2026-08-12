/**
 * Chain-order pin — the single opencode plugin's transform chain runs
 * context fidelity FIRST, then the discipline echo. The echo line must be
 * absent from a fidelity-only pass and present after the full chain.
 */
import { describe, expect, it } from 'vitest';
import { applyFidelity, applyOpenCodeTransform, type OpencodeMessage } from '../src/adapters/opencode.js';
import { SEAM_MARKER } from '../src/core/discipline.js';

const FRAME = `## Run Frame
Run ebb5c6aa · node requirement/arch-review · type main · task: Execute architecture review.
declared operations [locate, read, write, review] · out of scope: <read/write/locate minus declared>
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.`;

/** Assistant part set: two identical read calls + their result parts. */
function assistantParts() {
  const result = (id: string, content: string) => ({ type: 'tool', toolCallId: id, content, isError: false });
  return [
    { type: 'text', text: 'reading a.ts' },
    {
      type: 'tool-call',
      toolCalls: [
        { id: 'c1', name: 'read', input: { path: 'a.ts' } },
        { id: 'c2', name: 'read', input: { path: 'a.ts' } },
      ],
    },
    result('c1', 'old result'),
    result('c2', 'new result'),
  ] as never[];
}

/** Transcript with a duplicate tool call + the run frame. */
function transcript(): OpencodeMessage[] {
  return [
    { role: 'user', parts: [{ type: 'text', text: '开始' }] },
    { role: 'assistant', parts: [{ type: 'text', text: FRAME }] },
    { role: 'user', parts: [{ type: 'text', text: 'read a.ts' }] },
    { role: 'assistant', parts: assistantParts() },
  ];
}

function allText(messages: OpencodeMessage[]): string {
  return messages.map((m) => (m.parts ?? []).map((p) => ('text' in p ? String(p.text) : '')).join('\n')).join('\n');
}

describe('single-plugin transform chain', () => {
  it('fidelity phase alone appends no echo line', () => {
    const out = applyFidelity(transcript());
    expect(allText(out)).not.toContain(SEAM_MARKER);
  });

  it('full chain appends the echo to the most recent user message after fidelity reduction', () => {
    const out = applyOpenCodeTransform(transcript());
    const user = [...out].reverse().find((m) => m.role === 'user');
    const text = (user?.parts ?? []).map((p) => ('text' in p ? String(p.text) : '')).join('\n');
    expect(text).toContain(SEAM_MARKER);
    expect(text).toContain('node requirement/arch-review');
  });

  it('dedup marker is present after the full chain', () => {
    const out = applyOpenCodeTransform(transcript());
    expect(JSON.stringify(out)).toContain('[superseded');
  });
});

/**
 * Face byte-identity — both platform seams run the SAME single chain
 * (normalize → applyFidelityChain → denormalize), so the echoed line is
 * byte-identical across faces: identity + progress only (the R2
 * value-ratio graphic is suspended — ADR 0175). Drives the real seams:
 * the OMP `context` handler and the opencode `messages.transform` hook.
 */
import type { OmpAgentMessage, OpencodeMessage } from '@ai-atomic-workflow/platform-hooks-sdk/adapters';
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';
import type { PluginInput } from '@opencode-ai/plugin';
import { describe, expect, it } from 'vitest';
import ompExtension from '../src/adapter-omp.js';
import opencodeModule from '../src/adapter-opencode.js';

const RUN = '9e392f79f3c049069ae36fe22021a5ee';
const FRAME = `## Run Frame\nRun ${RUN} · node requirement/arch-review · type main · task: t`;
const LINE = '▣ [seam] node requirement/arch-review';

/** OMP seam driver — registers the extension and fires the context handler. */
function ompSeam() {
  const handlers = new Map<string, (event: never) => unknown>();
  const api = {
    on: (event: string, handler: (event: never) => unknown) => {
      handlers.set(event, handler);
    },
    appendEntry: () => undefined,
  } as never;
  ompExtension(api as unknown as ExtensionAPI);
  return {
    async run(messages: OmpAgentMessage[]): Promise<{ messages: OmpAgentMessage[] } | undefined> {
      const handler = handlers.get('context') as (e: never) => unknown;
      return (await handler({ type: 'context', messages } as never)) as { messages: OmpAgentMessage[] } | undefined;
    },
  };
}

/** opencode seam driver — registers the plugin and fires the transform hook. */
async function opencodeSeam() {
  const plugin = (await opencodeModule.server({} as PluginInput)) as unknown as {
    'experimental.chat.messages.transform': (i: unknown, o: { messages: OpencodeMessage[] }) => Promise<void>;
  };
  return {
    async run(messages: OpencodeMessage[]): Promise<{ messages: OpencodeMessage[] } | undefined> {
      const output = { messages: JSON.parse(JSON.stringify(messages)) as OpencodeMessage[] };
      // Canonical contract (ADR 0193): the transform input carries the
      // messages surface; the SDK mutates the output array IN PLACE.
      await plugin['experimental.chat.messages.transform']({ messages: output.messages }, output);
      return output;
    },
  };
}

function ompMessages(): OmpAgentMessage[] {
  return [
    { role: 'user', content: '开始图运行' },
    { role: 'assistant', content: [{ type: 'text', text: 'node work' }] },
    { role: 'user', content: 'scope 确认: 全链重审。' },
  ];
}

function opencodeMessages(): OpencodeMessage[] {
  return [
    { role: 'user', parts: [{ type: 'text', text: '开始图运行' }] },
    { role: 'assistant', parts: [{ type: 'text', text: 'node work' }] },
    { role: 'user', parts: [{ type: 'text', text: 'scope 确认: 全链重审。' }] },
  ];
}

/** The run frame lands on the last user message of both transcripts. */
function withFrame(messages: unknown[]): unknown[] {
  messages[messages.length - 1] = { ...(messages.at(-1) as object), ...frameFor(messages) };
  return messages;
}

function frameFor(messages: unknown[]): { content?: string; parts?: Array<{ type: string; text: string }> } {
  const last = messages.at(-1) as { content?: unknown; parts?: unknown };
  if (typeof last?.content === 'string') return { content: `${last.content}\n${FRAME}` };
  if (Array.isArray(last?.parts)) {
    return { parts: [...(last.parts as Array<{ type: string; text: string }>), { type: 'text', text: FRAME }] };
  }
  return {};
}

describe('face byte-identity', () => {
  it('appends the same identity-only line on both faces (no benefit graphic)', async () => {
    const omp = ompSeam();
    const oc = await opencodeSeam();
    const ompOut = await omp.run(withFrame(ompMessages()) as OmpAgentMessage[]);
    const ocOut = await oc.run(withFrame(opencodeMessages()) as OpencodeMessage[]);
    expect(ompOut).toBeDefined();
    expect(ocOut).toBeDefined();
    const ompLine = String(ompOut?.messages[2]?.content).split('\n').at(-1);
    const ocLine = (ocOut?.messages[2]?.parts?.at(-1) as { text: string }).text;
    // Identity + progress segments are byte-identical; no value-ratio
    // graphic on either face (R2 suspended).
    expect(ompLine).toBe(LINE);
    expect(ocLine).toBe(LINE);
    expect(ocLine).toContain('[seam]');
    expect(ocLine).toContain('node requirement/arch-review');
    expect(ocLine).not.toContain('│');
    expect(ocLine).not.toContain('declares');
    expect(ocLine).not.toContain('out of scope');
  });

  it('targets the most recent user message only', async () => {
    const omp = ompSeam();
    const ompOut = await omp.run(withFrame(ompMessages()) as OmpAgentMessage[]);
    expect(String(ompOut?.messages[2]?.content)).toContain(LINE);
    expect(String(ompOut?.messages[0]?.content)).not.toContain('[seam]');
  });

  it('preserves non-text blocks when appending the echo (OMP content array)', async () => {
    const omp = ompSeam();
    const msgs: OmpAgentMessage[] = [
      {
        role: 'user',
        content: [{ type: 'tool-result', toolCallId: 'c1', content: 'result' } as never, { type: 'text', text: FRAME }],
      },
    ];
    const out = await omp.run(msgs);
    const blocks = out?.messages[0]?.content as Array<{ type: string; text?: string; toolCallId?: string }>;
    expect(blocks?.[0]?.toolCallId).toBe('c1'); // tool-result block preserved
    expect(blocks?.at(-1)?.text).toBe(LINE); // echo appended as a text block
  });
});

describe('OMP developer-role anchor (D12-1)', () => {
  it('appends the echo to a developer-role content-array message (custom_message delivery shape)', async () => {
    const omp = ompSeam();
    const msgs: OmpAgentMessage[] = [{ role: 'developer', content: [{ type: 'text', text: `invocation\n${FRAME}` }] }];
    const out = await omp.run(msgs);
    const blocks = out?.messages[0]?.content as Array<{ type?: string; text?: string }>;
    expect(blocks?.map((b) => b.text ?? '').join('\n')).toContain(LINE);
  });
});

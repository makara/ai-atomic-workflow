/**
 * F1 — opencode `server` plugin end-to-end (deploy-path closure).
 *
 * The real deployment path is the `server` default export: its transform
 * hook owns the echo-only chain and the graceful no-op guard. Pure
 * function tests never exercise that closure — a broken plugin wiring
 * would pass the suite. This file drives the hook through a mock
 * PluginInput and asserts the R1 surface (identity echo, no mode segment,
 * no elision/compression markers, immutability). The R2 fidelity stage
 * and compression engines were disconnected (ADR 0175).
 */
import type { PluginInput } from '@opencode-ai/plugin';
import { describe, expect, it } from 'vitest';
import server from '../src/adapter-opencode.js';

const RUN = '9e392f79f3c049069ae36fe22021a5ee';
const frame = (nodeId: string) =>
  `## Run Frame\nRun ${RUN} · node ${nodeId} · type main · task: t\ndeclared operations [read] · out of scope: write`;

type Message = { role: string; content?: string; parts?: Array<Record<string, unknown>> };

function textMsg(role: string, text: string): Message {
  return { role, parts: [{ type: 'text', text }] };
}

function makeMessages(nodeId: string): Message[] {
  return [textMsg('user', frame(nodeId)), textMsg('user', 'probe body')];
}

describe('F1 · opencode server plugin end-to-end (transform hook)', () => {
  it('invokes the transform hook with the echo-only chain', async () => {
    const plugin = (await server.server({} as unknown as PluginInput)) as Record<
      string,
      (i: unknown, o: Record<string, unknown>) => Promise<void>
    >;
    const hook = plugin['experimental.chat.messages.transform']!;
    expect(typeof hook).toBe('function');

    const transcript: Message[] = [
      textMsg('user', frame('n1')),
      {
        role: 'user',
        parts: [{ type: 'tool', toolCallId: 'tc-1', content: 'boom: no such file', isError: true }],
      },
      textMsg('user', 'probe body'),
    ];
    const out: { messages: Message[] } = { messages: JSON.parse(JSON.stringify(transcript)) };
    await hook({ messages: out.messages }, out as never);

    const serialized = JSON.stringify(out.messages);
    // Echo appended (identity pointer from the anchored frame).
    expect(serialized).toContain('[seam] node n1');
    // No reduction markers — the R2 fidelity/compress stages are gone.
    expect(serialized).not.toContain('[input removed due to failed tool call]');
    expect(serialized).not.toContain('[compressed — hash=');
    // The errored result stays verbatim (no error reduction on R1 path).
    expect(serialized).toContain('boom: no such file');
  });

  it('echo never renders a mode segment (mode knob removed) or status flags', async () => {
    const plugin = (await server.server({} as unknown as PluginInput)) as Record<
      string,
      (i: unknown, o: Record<string, unknown>) => Promise<void>
    >;
    const hook = plugin['experimental.chat.messages.transform']!;
    const out: { messages: Message[] } = { messages: makeMessages('n2') };
    await hook({ messages: out.messages }, out as never);
    const serialized = JSON.stringify(out.messages);
    expect(serialized).toContain('[seam] node n2');
    expect(serialized).not.toContain('mode manual');
    expect(serialized).not.toContain('⚠');
    expect(serialized).not.toContain('│');
  });

  it('long assistant loops render no flag — line stays identity + progress only', async () => {
    const plugin = (await server.server({} as unknown as PluginInput)) as Record<
      string,
      (i: unknown, o: Record<string, unknown>) => Promise<void>
    >;
    const hook = plugin['experimental.chat.messages.transform']!;
    // 20 assistant turns without user input — the old iter flag is pruned.
    const many: Message[] = [textMsg('user', frame('n3'))];
    for (let i = 0; i < 20; i++) many.push(textMsg('assistant', `turn ${i}`));
    const out1: { messages: Message[] } = { messages: JSON.parse(JSON.stringify(many)) };
    await hook({ messages: out1.messages }, out1 as never);
    const s1 = JSON.stringify(out1.messages);
    expect(s1).toContain('[seam] node n3');
    expect(s1).not.toContain('iter');
    expect(s1).not.toContain('⚠');
    const out2: { messages: Message[] } = { messages: JSON.parse(JSON.stringify(many)) };
    await hook({ messages: out2.messages }, out2 as never);
    const s2 = JSON.stringify(out2.messages);
    // Canonical dedup keeps at most one seam line.
    expect((s2.match(/\[seam\]/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('consumed spans are never elided — context lifecycle is platform-owned', async () => {
    const plugin = (await server.server({} as unknown as PluginInput)) as Record<
      string,
      (i: unknown, o: Record<string, unknown>) => Promise<void>
    >;
    const hook = plugin['experimental.chat.messages.transform']!;
    const consumed: Message[] = [
      textMsg('user', frame('n4a')),
      textMsg('assistant', 'producer output text'),
      textMsg('user', frame('n4b')),
      textMsg('assistant', 'intermediate output'),
      textMsg('user', frame('n4c')),
      textMsg('user', 'probe body'),
    ];
    const out: { messages: Message[] } = { messages: JSON.parse(JSON.stringify(consumed)) };
    await hook({ messages: out.messages }, out as never);
    const serialized = JSON.stringify(out.messages);
    // No elision markers, no compression markers.
    expect(serialized).not.toContain('[elided');
    expect(serialized).not.toContain('[compressed');
  });

  it('graceful no-op: non-array or empty messages never throw', async () => {
    const plugin = (await server.server({} as unknown as PluginInput)) as Record<
      string,
      (i: unknown, o: Record<string, unknown>) => Promise<void>
    >;
    const hook = plugin['experimental.chat.messages.transform']!;
    await expect(hook({ messages: null }, { messages: null } as never)).resolves.toBeUndefined();
    await expect(hook({ messages: [] }, { messages: [] } as never)).resolves.toBeUndefined();
    await expect(hook({}, {} as never)).resolves.toBeUndefined();
  });

  it('input immutability: frozen message array passes through untouched', async () => {
    const plugin = (await server.server({} as unknown as PluginInput)) as Record<
      string,
      (i: unknown, o: Record<string, unknown>) => Promise<void>
    >;
    const hook = plugin['experimental.chat.messages.transform']!;
    const messages = makeMessages('n5');
    const frozen = Object.freeze(messages.map((m) => Object.freeze({ ...m, parts: Object.freeze([...m.parts!]) })));
    const out: { messages: Message[] } = { messages: [...frozen] as unknown as Message[] };
    await hook({ messages: out.messages }, out as never);
    expect(frozen[1].parts![0].text).toBe('probe body');
  });
});

describe('F1 · echo format (identity-only)', () => {
  it('opencode echo never renders a metering/benefit segment', async () => {
    const plugin = (await server.server({} as unknown as PluginInput)) as Record<
      string,
      (i: unknown, o: Record<string, unknown>) => Promise<void>
    >;
    const hook = plugin['experimental.chat.messages.transform']!;
    const out: { messages: Message[] } = { messages: makeMessages('n6') };
    await hook({ messages: out.messages }, out as never);
    const serialized = JSON.stringify(out.messages);
    expect(serialized).toContain('[seam] node n6');
    expect(serialized).not.toContain('· in ');
    expect(serialized).not.toContain('│');
  });
});

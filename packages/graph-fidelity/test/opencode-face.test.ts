/**
 * opencode-face pins — the platform-faithful shapes behind the opencode
 * face (R1 surface; the R2 metering/settlement/retention/landing wiring
 * was disconnected with the R2/R1 decoupling — ADR 0175):
 * - module load shape: default export is `{ id, server }` (v1 module
 *   record) — never a bare function (the legacy loader iterates every
 *   module export as a plugin instance; live-log-confirmed failure);
 * - message role source: `info.role` (platform shape `{ info, parts }`)
 *   with top-level fallback — the echo append consumes it;
 * - compaction: the platform owns compaction — no
 *   `experimental.session.compacting` handler;
 * - PCL detection: `chat.message` mark-only;
 * - in-place write-back: the caller-held array reference sees the echo.
 */

import { describe, expect, it } from 'vitest';
import opencodeModule, { messageRole, type OpencodeMessage } from '../src/adapters/opencode.js';

/** Minimal plugin input — the server factory reads only options here. */
const pluginInput = {
  client: {},
  project: {},
  directory: '/tmp',
  worktree: '/tmp',
  experimental_workspace: { register() {} },
  serverUrl: new URL('http://localhost:4096'),
} as never;

/** Hook surface produced by the server factory. */
type Hooks = {
  'experimental.chat.messages.transform': (i: unknown, o: { messages: OpencodeMessage[] }) => Promise<void>;
  'chat.message': (i: unknown, o: { message?: unknown; parts?: Array<Record<string, unknown>> }) => Promise<void>;
  'experimental.session.compacting': (i: unknown, o: unknown) => Promise<void>;
  'experimental.chat.system.transform': (i: unknown, o: { system: string[] }) => Promise<void>;
};

/** True when any message part carries a seam line. */
function hasSeam(messages: readonly OpencodeMessage[]): boolean {
  return messages.some((m) => (m.parts ?? []).some((p) => (p.text ?? '').includes('▣ [seam]')));
}

/** Platform-faithful message builder — `{ info: { role }, parts }`. */
function platformMessage(role: string, text: string): OpencodeMessage {
  return { info: { role }, parts: [{ type: 'text', text }] };
}

const FRAME = (runId: string, nodeId: string): string =>
  `## Run Frame\nRun ${runId} · node ${nodeId} · 1/3 · type main · task: work`;

describe('load shape (T1)', () => {
  it('default export is a v1 module record { id, server }', () => {
    const mod = opencodeModule as { id?: unknown; server?: unknown };
    expect(typeof mod).toBe('object');
    expect(typeof mod.id).toBe('string');
    expect(mod.id).toBe('graph-fidelity');
    expect(typeof mod.server).toBe('function');
  });

  it('default export record carries id + server (named helpers stay named)', () => {
    const mod = opencodeModule as { id?: unknown; server?: unknown };
    expect(typeof mod).toBe('object');
    expect(typeof mod.id).toBe('string');
    expect(mod.id).toBe('graph-fidelity');
    expect(typeof mod.server).toBe('function');
  });
});

describe('message role source (T2)', () => {
  it('reads info.role (platform shape)', () => {
    expect(messageRole({ info: { role: 'user' }, parts: [] })).toBe('user');
    expect(messageRole({ info: { role: 'assistant' }, parts: [] })).toBe('assistant');
  });

  it('falls back to top-level role (degraded shape)', () => {
    expect(messageRole({ role: 'user', parts: [] })).toBe('user');
  });

  it('echo appends to the platform-shaped user message', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    const messages: OpencodeMessage[] = [
      platformMessage('user', 'start'),
      platformMessage('assistant', FRAME('abc123', 'requirement/arch-review')),
      platformMessage('user', 'scope 确认'),
    ];
    const output = { messages };
    await hooks['experimental.chat.messages.transform']({}, output);
    // The echo appends to the LAST USER message (platform-shaped role source).
    expect(hasSeam(output.messages)).toBe(true);
    const userText = (output.messages.at(-1)?.parts ?? []).map((p) => p.text ?? '').join('\n');
    expect(userText).toContain('scope 确认');
    expect(userText).toContain('▣ [seam]');
  });

  it('echo appends when frame lives in a platform-shaped assistant message', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    const messages: OpencodeMessage[] = [
      platformMessage('user', 'start'),
      platformMessage('assistant', FRAME('abc123', 'adopt/adopting')),
    ];
    const output = { messages };
    await hooks['experimental.chat.messages.transform']({}, output);
    expect(hasSeam(output.messages)).toBe(true);
  });

  it('identity-only line — no value-ratio graphic, no metering segment', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    const output = {
      messages: [
        platformMessage('user', 'start'),
        platformMessage('assistant', FRAME('abc123', 'requirement/arch-review')),
        platformMessage('user', 'probe body'),
      ],
    };
    await hooks['experimental.chat.messages.transform']({}, output);
    const echoed = output.messages.map((m) => (m.parts ?? []).map((p) => p.text ?? '').join('\n')).join('\n');
    expect(echoed).toContain('▣ [seam] node requirement/arch-review');
    expect(echoed).not.toContain('│');
    expect(echoed).not.toContain('1.0k');
    expect(echoed).not.toContain('· in ');
  });
});

describe('compaction-boundary ownership (T5)', () => {
  it('registers no compaction hook; consumed spans are never elided or compressed', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    const output = {
      messages: [
        platformMessage('user', FRAME('abc123', 'requirement/arch-review')),
        platformMessage('assistant', 'node output'.repeat(20)),
        platformMessage('user', FRAME('abc123', 'adopt/adopting')),
        platformMessage('user', FRAME('abc123', 'adopt/adopt-accept')),
      ],
    };
    await hooks['experimental.chat.messages.transform']({}, output);
    // No elision markers, no compression markers, no archive calls.
    const texts = output.messages.flatMap((m) => (m.parts ?? []).map((p) => p.text ?? '').join('\n')).join('\n');
    expect(texts.includes('[elided')).toBe(false);
    expect(texts.includes('[compressed — hash=')).toBe(false);
    expect((hooks as Record<string, unknown>)['experimental.session.compacting']).toBeUndefined();
  });
});

describe('PCL detection via chat.message (mark-only)', () => {
  it('detects vocabulary hits over the user text parts; text unchanged, no routing, mark surfaced via the debug callback', async () => {
    const marks: Array<{ text: string; matched: string }> = [];
    const hooks = (await opencodeModule.server(pluginInput, {
      onPclDetected: (r: { text: string; matched: string }) => marks.push(r),
    })) as unknown as Hooks;
    const parts = [
      { type: 'text', text: 'status' },
      { type: 'text', text: 'what is happening' },
    ];
    const output = { message: {}, parts };
    await hooks['chat.message']({ sessionID: 's1' }, output);
    // Detection recorded (joined text parts), the matched keyword surfaced.
    expect(marks).toEqual([{ text: 'status\nwhat is happening', matched: 'status' }]);
    // Mark-only — the parts array is never touched (same reference), and
    // the hook resolves undefined (no routing, no handled semantics).
    expect(output.parts).toBe(parts);
    await expect(hooks['chat.message']({ sessionID: 's1' }, output)).resolves.toBeUndefined();
  });

  it('ignores non-PCL text and empty parts — no mark, no mutation', async () => {
    const marks: Array<{ text: string; matched: string }> = [];
    const hooks = (await opencodeModule.server(pluginInput, {
      onPclDetected: (r: { text: string; matched: string }) => marks.push(r),
    })) as unknown as Hooks;
    const ordinary = { type: 'text', text: 'ordinary chat about the plan' };
    await hooks['chat.message']({ sessionID: 's1' }, { message: {}, parts: [ordinary] });
    await hooks['chat.message']({ sessionID: 's1' }, { message: {}, parts: [] });
    expect(marks).toEqual([]);
  });
});

describe('in-place output write-back (L1-B double-prime)', () => {
  it('messages.transform writes back in place — the caller-held array reference sees the echo', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    // The platform keeps using the ORIGINAL array reference after the hook
    // returns (its trigger return value is ignored) — a reassigned
    // output.messages is silently discarded. The echo must be visible on
    // the caller-held array itself.
    const callerHeld = [
      platformMessage('user', 'start'),
      platformMessage('assistant', FRAME('abc123', 'requirement/arch-review')),
    ];
    const output = { messages: callerHeld };
    await hooks['experimental.chat.messages.transform']({}, output);
    expect(hasSeam(callerHeld)).toBe(true);
    expect(output.messages).toBe(callerHeld);
  });

  it('system.transform writes back in place — the caller-held system array sees the resident block', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    const callerHeld = ['AGENTS.md instructions'];
    const output = { system: callerHeld };
    await hooks['experimental.chat.system.transform']({}, output);
    expect(output.system).toBe(callerHeld);
    expect(callerHeld.some((entry) => entry.includes('HLT core requirement'))).toBe(true);
  });

  it('empty/non-array payloads pass through — zero-deny no-op', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    await expect(hooks['experimental.chat.messages.transform']({}, { messages: [] })).resolves.toBeUndefined();
    await expect(hooks['experimental.chat.system.transform']({}, { system: [] })).resolves.toBeUndefined();
  });
});

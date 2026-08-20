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

import { DeliveryContext, bind, createHooks } from '@ai-atomic-workflow/platform-hooks-sdk';
import {
  opencodeAdapter,
  opencodeMessageRole,
  type OpencodeMessage,
} from '@ai-atomic-workflow/platform-hooks-sdk/adapters';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import opencodeModule from '../src/adapter-opencode.js';

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
    expect(opencodeMessageRole({ info: { role: 'user' }, parts: [] })).toBe('user');
    expect(opencodeMessageRole({ info: { role: 'assistant' }, parts: [] })).toBe('assistant');
  });

  it('falls back to top-level role (degraded shape)', () => {
    expect(opencodeMessageRole({ role: 'user', parts: [] })).toBe('user');
  });

  it('echo appends to the platform-shaped user message', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    const messages: OpencodeMessage[] = [
      platformMessage('user', 'start'),
      platformMessage('assistant', FRAME('abc123', 'requirement/arch-review')),
      platformMessage('user', 'scope 确认'),
    ];
    const output = { messages };
    await hooks['experimental.chat.messages.transform']({ messages: output.messages }, output);
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
    await hooks['experimental.chat.messages.transform']({ messages: output.messages }, output);
    expect(hasSeam(output.messages)).toBe(true);
  });

  it('malformed (non-record) message element fails open — transcript untouched', async () => {
    // Round-2 pin (sdk-consumer-adapter-minimal): the whole-hook fail-open
    // contract — a non-record element aborts the transform untouched,
    // never splices a filtered array into the live transcript.
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    const messages = [
      platformMessage('user', 'start'),
      null,
      platformMessage('user', 'scope 确认'),
    ] as unknown as OpencodeMessage[];
    const output = { messages };
    await hooks['experimental.chat.messages.transform']({ messages: output.messages }, output);
    // Fail-open: no seam injected, array untouched (null element preserved).
    const echoed = output.messages
      .filter((m): m is OpencodeMessage => m !== null)
      .map((m) => (m.parts ?? []).map((p) => p.text ?? '').join('\n'))
      .join('\n');
    expect(echoed).not.toContain('▣ [seam]');
    expect(output.messages).toHaveLength(3);
    expect(output.messages[1]).toBeNull();
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
    await hooks['experimental.chat.messages.transform']({ messages: output.messages }, output);
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
    await hooks['experimental.chat.messages.transform']({ messages: output.messages }, output);
    // No elision markers, no compression markers, no archive calls.
    const texts = output.messages.flatMap((m) => (m.parts ?? []).map((p) => p.text ?? '').join('\n')).join('\n');
    expect(texts.includes('[elided')).toBe(false);
    expect(texts.includes('[compressed — hash=')).toBe(false);
    expect((hooks as Record<string, unknown>)['experimental.session.compacting']).toBeUndefined();
  });
});

describe('PCL detection via chat.message (mark-only)', () => {
  it('detects vocabulary hits over the canonical message parts; text unchanged, no routing, mark surfaced via the debug callback', async () => {
    const marks: Array<{ text: string; matched: string }> = [];
    const hooks = (await opencodeModule.server(pluginInput, {
      onPclDetected: (r: { text: string; matched: string }) => marks.push(r),
    })) as unknown as Hooks;
    const parts = [
      { type: 'text', text: 'status' },
      { type: 'text', text: 'what is happening' },
    ];
    const output = { message: { parts }, parts };
    // Canonical contract (ADR 0193): the chat.message hook carries the
    // message on the OUTPUT surface (pinned refs — input has identity
    // fields only); the handler reads the canonical {message} payload.
    const input = { sessionID: 's1' };
    await hooks['chat.message'](input as never, output);
    // Detection recorded (joined message parts), the matched keyword surfaced.
    expect(marks).toEqual([{ text: 'status\nwhat is happening', matched: 'status' }]);
    // Mark-only — the output parts array is never touched (same reference),
    // and the hook resolves undefined (no routing, no handled semantics).
    expect(output.parts).toBe(parts);
    await expect(hooks['chat.message'](input as never, output)).resolves.toBeUndefined();
  });

  it('ignores non-PCL text and empty parts — no mark, no mutation', async () => {
    const marks: Array<{ text: string; matched: string }> = [];
    const hooks = (await opencodeModule.server(pluginInput, {
      onPclDetected: (r: { text: string; matched: string }) => marks.push(r),
    })) as unknown as Hooks;
    const ordinary = { type: 'text', text: 'ordinary chat about the plan' };
    await hooks['chat.message']({ sessionID: 's1', message: { parts: [ordinary] } } as never, {
      message: {},
      parts: [ordinary],
    });
    await hooks['chat.message']({ sessionID: 's1', message: {} } as never, { message: {}, parts: [] });
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
    await hooks['experimental.chat.messages.transform']({ messages: callerHeld }, output);
    expect(hasSeam(callerHeld)).toBe(true);
    expect(output.messages).toBe(callerHeld);
  });

  it('system.transform writes back in place — the caller-held system array sees the resident block', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    const callerHeld = ['AGENTS.md instructions'];
    const output = { system: callerHeld };
    await hooks['experimental.chat.system.transform']({ system: callerHeld }, output);
    expect(output.system).toBe(callerHeld);
    expect(callerHeld.some((entry) => entry.includes('search_symbols') && entry.includes('register_edit'))).toBe(true);
  });

  it('does not register the session-end dispose hook — session-end seam removed (round 14 R6)', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    expect(typeof (hooks as { dispose?: unknown }).dispose).toBe('undefined');
  });

  it('empty/non-array payloads pass through — zero-deny no-op', async () => {
    const hooks = (await opencodeModule.server(pluginInput, undefined)) as unknown as Hooks;
    await expect(
      hooks['experimental.chat.messages.transform']({ messages: [] }, { messages: [] }),
    ).resolves.toBeUndefined();
    await expect(hooks['experimental.chat.system.transform']({ system: [] }, { system: [] })).resolves.toBeUndefined();
  });
});

describe('settlement/display delivery — SDK-owned (ADR 0193)', () => {
  it('ctx.notify without a toast surface enqueues the transcript fallback, flushed by the transform pass IN PLACE', async () => {
    // Consumer-side contract: a handler calling ctx.notify(text) delivers
    // through the SDK adapter — toast when present, else an adapter-owned
    // chat-transform flush hook appends the line to the transcript
    // (never silent).
    const wired = createHooks();
    wired.context.use((self) =>
      Effect.gen(function* () {
        const ctx = yield* DeliveryContext;
        ctx.notify('ctx managed: trim 1 · saved 1k');
        return yield* self;
      }),
    );
    const { value: bound } = bind(opencodeAdapter, wired);
    const hooks = await bound.server({ client: {} }); // no toast surface
    const callerHeld: OpencodeMessage[] = [platformMessage('user', 'start')];
    const output = { messages: callerHeld };
    await hooks['experimental.chat.messages.transform']({ messages: callerHeld }, output);
    // The flush appends the line as a text PART on the last real user
    // message, IN PLACE (round 14 R7 — never a fabricated user-role
    // message). Same array reference; same message count.
    const appended = callerHeld.at(-1) as unknown as {
      info?: { role?: string };
      parts?: Array<{ type?: string; text?: string }>;
    };
    expect(appended.info?.role).toBe('user');
    expect(appended.parts?.at(-1)?.text).toContain('ctx managed: trim 1 · saved 1k');
    expect(callerHeld).toHaveLength(1);
    expect(output.messages).toBe(callerHeld);
  });

  it('ctx.notify delivers toasts when the toast surface is reachable (no transcript queue)', async () => {
    const showToast = vi.fn();
    const wired = createHooks();
    wired.chat_message.use((self) =>
      Effect.gen(function* () {
        const ctx = yield* DeliveryContext;
        ctx.notify('cache read 9 · cache write 4');
        return yield* self;
      }),
    );
    const { value: bound } = bind(opencodeAdapter, wired);
    const hooks = await bound.server({ client: { tui: { showToast } } });
    await hooks['chat.message']({ message: {} }, { message: {}, parts: [] });
    expect(showToast).toHaveBeenCalledWith('cache read 9 · cache write 4');
  });
});

import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { ompAdapter } from '../src/adapters/omp.js';
import { opencodeAdapter, writeBackInPlace } from '../src/adapters/opencode.js';
import { bind } from '../src/core/bind.js';
import { ompEventName, opencodeEventName } from '../src/core/events.js';
import {
  CanonicalEventService,
  DeliveryContext,
  assertCanonicalHook,
  createHooks,
  type DeliveryContextService,
  type HandlerResult,
  type HookEvent,
  type Middleware,
} from '../src/index.js';

/** Minimal ExtensionAPI-like surface for OMP factory tests. */
interface OmpApi {
  entries: Array<{ name: string; handler: (event: unknown, ctx: unknown) => unknown }>;
  calls: Array<{ channel: string; payload: unknown }>;
}

function makeApi(): OmpApi {
  const api: OmpApi = { entries: [], calls: [] };
  (api as unknown as { on(name: string, handler: (event: unknown, ctx: unknown) => unknown): void }).on = (
    name,
    handler,
  ) => {
    api.entries.push({ name, handler });
  };
  (api as unknown as { appendEntry(channel: string, payload: unknown): void }).appendEntry = (channel, payload) => {
    api.calls.push({ channel, payload });
  };
  return api;
}

/** Opencode server shape under test. */
type ServerShape = (
  input: unknown,
) => Promise<Record<string, (i: unknown, o: Record<string, unknown>) => Promise<void>>>;

/**
 * Middleware from a handler-style body — the canonical event and the
 * delivery context come from the effect environment (sdk-hooks-middleware:
 * never positional, never closure-threaded). The body's return value is
 * the chain result (undefined = side-effect only).
 */
function handlerMw(body: (event: HookEvent, ctx: DeliveryContextService) => unknown): Middleware {
  return (self) =>
    Effect.gen(function* () {
      const event = yield* CanonicalEventService;
      const ctx = yield* DeliveryContext;
      const value = body(event, ctx);
      return yield* self.pipe(Effect.map(() => value as HandlerResult));
    });
}

describe('omp translation table', () => {
  it('maps canonical events to snake_case OMP names', () => {
    expect(ompEventName('tool_result')).toBe('tool_result');
    expect(ompEventName('user_input')).toBe('input');
  });

  it('normalizes payloads to canonical shapes and delivers a DeliveryContext', async () => {
    const api = makeApi();
    let seen: { name: string; payload: unknown } | undefined;
    const notifies: string[] = [];
    const hooks = createHooks();
    hooks.tool_result.use(
      handlerMw((event, ctx) => {
        seen = { name: event.name, payload: event.payload };
        ctx.notify('settled');
        ctx.appendEntry('ch', { a: 1 });
        return { content: 'merged' };
      }),
    );
    const factory = bind(ompAdapter, hooks).value as (pi: unknown) => void;
    factory(api);
    const reg = api.entries.find((e) => e.name === 'tool_result')!;
    const result = await reg.handler(
      { type: 'tool_result', toolName: 'read', content: 'x', input: { path: '/a' }, toolCallId: 'tc1' },
      { ui: { notify: (t: string) => notifies.push(t) } },
    );
    expect(seen).toEqual({
      name: 'tool_result',
      // decoded through the canonical Schema — undefined optional keys and
      // non-schema excess keys (isError/toolCallId) are dropped at the
      // adapter boundary (R-SDK2 single validation point)
      payload: { toolName: 'read', content: 'x', args: { path: '/a' }, errorShaped: false },
    });
    expect(notifies).toEqual(['settled']);
    expect(api.calls).toEqual([{ channel: 'ch', payload: { a: 1 } }]);
    expect(result).toEqual({ content: 'merged' });
  });

  it('async chains deliver on the OMP face (production-error regression — LoudExecutionError deleted)', async () => {
    const api = makeApi();
    const hooks = createHooks();
    // The round-1 production failure: an async tool_result chain (e.g.
    // an MCP round-trip) threw LoudExecutionError on the OMP face.
    hooks.tool_result.use((self) =>
      Effect.flatMap(self, () => Effect.promise(() => Promise.resolve({ content: ['compressed'] }))),
    );
    const factory = bind(ompAdapter, hooks).value as (pi: unknown) => void;
    factory(api);
    const reg = api.entries.find((e) => e.name === 'tool_result')!;
    const handler = reg.handler as (event: unknown, ctx: unknown) => unknown | Promise<unknown>;
    await expect(
      handler({ type: 'tool_result', toolName: 'read', content: 'x', input: {}, toolCallId: 'tc1' }, {}),
    ).resolves.toEqual({ content: ['compressed'] });
  });

  it('notify degrades to appendEntry when the ctx.ui surface is absent (round 12)', () => {
    const api = makeApi();
    const hooks = createHooks();
    hooks.message_end.use(
      handlerMw((_event, ctx) => {
        ctx.notify('x');
        return undefined;
      }),
    );
    const factory = bind(ompAdapter, hooks).value as (pi: unknown) => void;
    factory(api);
    const reg = api.entries.find((e) => e.name === 'message_end')!;
    expect(() => reg.handler({ type: 'message_end', message: { usage: {} } }, null)).not.toThrow();
    // ctx surface absent → notify degraded to the transcript appendEntry
    const appends = api.calls.filter((c) => c.channel === 'transcript');
    expect(appends.length).toBe(1);
    expect(appends[0]!.payload).toEqual({ type: 'text', text: 'x' });
  });

  it('notify still routes through ctx.ui.notify when the surface exists', () => {
    const api = makeApi();
    const hooks = createHooks();
    hooks.message_end.use(
      handlerMw((_event, ctx) => {
        ctx.notify('x');
        return undefined;
      }),
    );
    const factory = bind(ompAdapter, hooks).value as (pi: unknown) => void;
    factory(api);
    const reg = api.entries.find((e) => e.name === 'message_end')!;
    const notifies: string[] = [];
    expect(() =>
      reg.handler({ type: 'message_end', message: { usage: {} } }, { ui: { notify: (t: string) => notifies.push(t) } }),
    ).not.toThrow();
    expect(notifies).toEqual(['x']);
    expect(api.calls.filter((c) => c.channel === 'transcript').length).toBe(0);
  });

  it('notify with both surfaces absent records an undelivered marker (fail-open, round 12)', () => {
    // api without appendEntry — ctx.ui and appendEntry both absent
    const api: OmpApi = { entries: [], calls: [] };
    (api as unknown as { on(name: string, handler: (event: unknown, ctx: unknown) => unknown): void }).on = (
      name,
      handler,
    ) => {
      api.entries.push({ name, handler });
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const hooks = createHooks();
      hooks.message_end.use(
        handlerMw((_event, ctx) => {
          ctx.notify('x');
          return undefined;
        }),
      );
      const factory = bind(ompAdapter, hooks).value as (pi: unknown) => void;
      factory(api);
      const reg = api.entries.find((e) => e.name === 'message_end')!;
      expect(() => reg.handler({ type: 'message_end', message: { usage: {} } }, null)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]![0]).toContain('notify undelivered');
      expect(api.calls.length).toBe(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('mutate is a no-op on the OMP face (return-style surface)', () => {
    const api = makeApi();
    const hooks = createHooks();
    hooks.context.use(
      handlerMw((_event, ctx) => {
        ctx.mutate('output', 'messages', [1]);
        return undefined;
      }),
    );
    const factory = bind(ompAdapter, hooks).value as (pi: unknown) => void;
    factory(api);
    const reg = api.entries.find((e) => e.name === 'context')!;
    expect(() => reg.handler({ type: 'context', messages: [] }, {})).not.toThrow();
  });

  it('skips canonical events with no OMP hook (validation passes — canonical keys only)', () => {
    const api = makeApi();
    // `chat_message` is a canonical event with no OMP v1 hook (the OMP
    // input seam is `user_input`) — the translation table skips it.
    const hooks = createHooks();
    hooks.chat_message.use(handlerMw(() => undefined));
    const factory = bind(ompAdapter, hooks).value as (pi: unknown) => void;
    factory(api);
    expect(api.entries.length).toBe(0);
  });
});

describe('opencode v1 translation table', () => {
  it('maps canonical events to real dotted opencode names', () => {
    expect(opencodeEventName('tool_call')).toBe('tool.execute.before');
  });

  it('normalizes tool.execute.after input and mutates the output surface', async () => {
    let seen: { payload: unknown } | undefined;
    const hooks = createHooks();
    hooks.tool_result.use(
      handlerMw((event, ctx) => {
        seen = { payload: event.payload };
        ctx.mutate('output', 'output', 'replaced');
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    // pinned refs: input {tool, sessionID, callID, args}; content lives on
    // the output surface {title, output, metadata}
    const output: Record<string, unknown> = { title: 't', output: 'orig', metadata: { m: 1 } };
    await serverHooks['tool.execute.after']!({ tool: 'read', sessionID: 's', callID: 'c', args: {} }, output);
    expect(seen).toEqual({
      payload: { toolName: 'read', args: {}, content: 'orig', metadata: { m: 1 }, errorShaped: false },
    });
    expect(output.output).toBe('replaced');
  });

  it('denormalizes the canonical tool_result partial per face (opencode: content blocks → output string)', async () => {
    const hooks = createHooks();
    hooks.tool_result.use(handlerMw(() => ({ content: [{ type: 'text', text: 'returned' }] })));
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    const output = { output: 'x' };
    await serverHooks['tool.execute.after']!({ tool: 'read' }, output);
    // The canonical partial's content BLOCKS are joined to the platform
    // result STRING (ADR 0199 face denormalization — consumers return the
    // partial uniformly).
    expect(output.output).toEqual('returned');
  });

  it('passes a string-content partial through the outKey write as-is', async () => {
    const hooks = createHooks();
    hooks.tool_result.use(handlerMw(() => ({ content: 'plain string' })));
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    const output = { output: 'x' };
    await serverHooks['tool.execute.after']!({ tool: 'read' }, output);
    expect(output.output).toEqual('plain string');
  });

  it('normalizes tool.execute.before args from the output surface', async () => {
    let seen: { payload: unknown } | undefined;
    const hooks = createHooks();
    hooks.tool_call.use(
      handlerMw((event) => {
        seen = { payload: event.payload };
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    const output = { args: { path: '/x' } };
    await serverHooks['tool.execute.before']!({ tool: 'read', sessionID: 's', callID: 'c' }, output);
    expect(seen).toEqual({ payload: { toolName: 'read', args: { path: '/x' } } });
  });

  it('mutate replaces arrays IN PLACE (law L4 — original reference preserved)', async () => {
    const hooks = createHooks();
    hooks.context.use(
      handlerMw((_event, ctx) => {
        ctx.mutate('output', 'messages', [{ m: 1 }]);
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    const original: unknown[] = [{ m: 0 }];
    const output = { messages: original };
    // pinned refs: transform input is {} — messages live on the output
    await serverHooks['experimental.chat.messages.transform']!({}, output);
    expect(output.messages).toBe(original); // same reference
    expect(original).toEqual([{ m: 1 }]);
  });

  it('normalizes transform messages from the output surface', async () => {
    let seen: { payload: unknown } | undefined;
    const hooks = createHooks();
    hooks.context.use(
      handlerMw((event) => {
        seen = { payload: event.payload };
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    const messages = [{ info: { role: 'user', content: 'hi' }, parts: [] }];
    await serverHooks['experimental.chat.messages.transform']!({}, { messages });
    expect(seen).toEqual({ payload: { messages } });
  });

  it('normalizes chat.message from the output surface', async () => {
    let seen: { payload: unknown } | undefined;
    const hooks = createHooks();
    hooks.chat_message.use(
      handlerMw((event) => {
        seen = { payload: event.payload };
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    const message = { role: 'user', content: 'hi' };
    await serverHooks['chat.message']!({ sessionID: 's', messageID: 'm' }, { message, parts: [] });
    expect(seen).toEqual({ payload: { message } });
  });

  it('normalizes nested event stream payloads (input.event)', async () => {
    let seen: { payload: unknown } | undefined;
    const hooks = createHooks();
    hooks.event.use(
      handlerMw((event) => {
        seen = { payload: event.payload };
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    await serverHooks['event']!({ event: { type: 'message.updated', properties: { usage: {} } } }, {});
    expect(seen).toEqual({ payload: { type: 'message.updated', properties: { usage: {} } } });
  });

  it('notify falls back to the transcript queue and flushes IN PLACE into the user message (round 14 R7)', async () => {
    const hooks = createHooks();
    hooks.chat_message.use(
      handlerMw((_event, ctx) => {
        ctx.notify('settled line');
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} }); // no toast
    const userMessage = { info: { role: 'user', content: 'hi' }, parts: [] as unknown[] };
    const original: unknown[] = [userMessage];
    const output = { messages: original };
    await serverHooks['experimental.chat.messages.transform']!({}, output);
    expect(original.length).toBe(1); // nothing queued yet — untouched
    await serverHooks['chat.message']!({ sessionID: 's' }, output);
    await serverHooks['experimental.chat.messages.transform']!({}, output);
    expect(output.messages).toBe(original); // in place
    expect(original.length).toBe(1); // no fabricated user-role message
    expect((original[0] as { parts: Array<{ text: string }> }).parts?.[0]?.text).toBe('settled line');
  });

  it('notify delivers toasts when the toast surface exists (no transcript queue)', async () => {
    const toasts: string[] = [];
    const hooks = createHooks();
    hooks.chat_message.use(
      handlerMw((_event, ctx) => {
        ctx.notify('toast line');
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: { tui: { showToast: (t: string) => toasts.push(t) } } });
    const output = { messages: [] };
    await serverHooks['chat.message']!({ sessionID: 's' }, output);
    expect(toasts).toEqual(['toast line']);
    // toast path registers no transcript flush hook — the queue is never used
    expect(serverHooks['experimental.chat.messages.transform']).toBeUndefined();
  });

  it('side-effect-only handlers leave output untouched', async () => {
    const hooks = createHooks();
    hooks.tool_call.use(handlerMw(() => undefined));
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    const output = {};
    await serverHooks['tool.execute.before']!({ tool: 'read', args: {} }, output);
    expect(output).toEqual({});
  });

  it('chains multiple handlers per hook in registration order', async () => {
    const order: string[] = [];
    const hooks = createHooks();
    hooks.tool_call
      .use(
        handlerMw(() => {
          order.push('a');
        }),
      )
      .use(
        handlerMw(() => {
          order.push('b');
        }),
      );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    await serverHooks['tool.execute.before']!({ tool: 'read' }, {});
    expect(order).toEqual(['a', 'b']);
  });

  it('single-face rule: one canonical per platform hook (dual canonical removed)', async () => {
    const seen: string[] = [];
    const hooks = createHooks();
    hooks.context.use(
      handlerMw(() => {
        seen.push('context');
        return undefined;
      }),
    );
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    await serverHooks['experimental.chat.messages.transform']!({ messages: [] }, { messages: [] });
    expect(seen).toEqual(['context']);
  });

  it('unknown handler keys fail loudly (round 14 R7 — no silent skip)', () => {
    // `chat_transform` was renamed to `context` (ADR 0196) — the old key
    // is no longer canonical and must throw, never silently no-op. Chains
    // come from createHooks (canonical keys only); the loud guard lives
    // on the hook surface (MiddlewareHookError).
    expect(() => assertCanonicalHook('chat_transform')).toThrow(/Unknown canonical event: chat_transform/);
    expect(() => assertCanonicalHook('bogus_key')).toThrow(/Unknown canonical event: bogus_key/);
  });

  it('skips canonical events with no opencode v1 hook (flush hook still present)', async () => {
    const hooks = createHooks();
    hooks.user_input.use(handlerMw(() => undefined));
    const server = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    const serverHooks = await server.server({ client: {} });
    // no-toast fallback adds the (no-op) flush hook only
    expect(Object.keys(serverHooks)).toEqual(['experimental.chat.messages.transform']);
  });

  it('writeBackInPlace preserves the original array reference', () => {
    const target = [1, 2, 3];
    const original = target;
    writeBackInPlace(target, [4, 5]);
    expect(target).toBe(original);
    expect(target).toEqual([4, 5]);
  });
});

describe('transcript fallback — real-message append (round 14 R7)', () => {
  async function serverWithNotify() {
    const hooks = createHooks();
    hooks.tool_result.use(
      handlerMw((_event, ctx) => {
        ctx.notify('settled line');
        return undefined;
      }),
    );
    const bound = bind(opencodeAdapter, hooks).value as unknown as { server: ServerShape };
    return bound.server({ client: {} });
  }

  it('appends settlement lines to the LAST user message parts — never fabricates a user-role message', async () => {
    const serverHooks = await serverWithNotify();
    // enqueue via the notify path (no toast surface)
    const after = serverHooks['tool.execute.after']!;
    await after({ tool: 'read', sessionID: 's', callID: 'c', args: {} }, { output: 'x' });
    // flush through the transform hook
    const user = { info: { role: 'user', content: 'original input' }, parts: [] as unknown[] };
    const assistant = { info: { role: 'assistant', content: 'work' }, parts: [] as unknown[] };
    const messages = [user, assistant];
    await serverHooks['experimental.chat.messages.transform']!({}, { messages });
    expect(messages).toHaveLength(2); // no fabricated third message
    expect(messages[0]?.parts).toEqual([{ type: 'text', text: 'settled line' }]);
    expect(messages[1]?.parts).toEqual([]);
  });

  it('no user-role message degrades to a documented no-op', async () => {
    const serverHooks = await serverWithNotify();
    const after = serverHooks['tool.execute.after']!;
    await after({ tool: 'read', sessionID: 's', callID: 'c', args: {} }, { output: 'x' });
    const assistant = { info: { role: 'assistant', content: 'work' }, parts: [] as unknown[] };
    const messages = [assistant];
    await serverHooks['experimental.chat.messages.transform']!({}, { messages });
    expect(messages).toEqual([assistant]); // untouched — no fabrication
  });
});

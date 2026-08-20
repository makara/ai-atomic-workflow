/**
 * Lifecycle capability tests (sdk-hooks-capabilities) — the `lifecycle`
 * capability is exercised through dispatch: the echo middleware runs
 * assembly → echo → restore as ONE pass, consuming the canonical
 * `context` payload + the adapter-provided FaceShapeService. Pins both
 * platform faces' frame-selection contracts (OMP all-roles, opencode
 * user-like-first — role-order parameterization, ADR 0176 F2).
 *
 * @module
 */

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { OMP_SHAPE, type OmpAgentMessage } from '../src/adapters/omp.js';
import { OPENCODE_SHAPE, type OpencodeMessage } from '../src/adapters/opencode.js';
import { FaceShapeService } from '../src/core/face-shape.js';
import type { DenormalizeShape } from '../src/core/shapes.js';
import {
  BASE_HANDLER,
  CanonicalEventService,
  createCapabilities,
  createHooks,
  DeliveryContext,
  foldMiddleware,
  OpencodeOptionsService,
  type DeliveryContextService,
  type HookEvent,
} from '../src/index.js';
import { spyDelivery } from './helpers/dispatch.js';

const FRAME = '## Run Frame\nRun abc · node n1 · 1/3';

function ompMessage(role: string, text: string): OmpAgentMessage {
  return { role, content: text };
}

function opencodeMessage(role: string, text: string): OpencodeMessage {
  return { role, parts: [{ type: 'text', text }] };
}

/** Dispatch a canonical context event through the wired lifecycle capability. */
function dispatchContext(
  shape: DenormalizeShape<unknown>,
  messages: readonly unknown[],
  ctx: DeliveryContextService,
): unknown {
  const hooks = createHooks();
  const { lifecycle } = createCapabilities(hooks);
  lifecycle.echo();
  const program = foldMiddleware(hooks.context.chain)(BASE_HANDLER);
  const delivered = Effect.provideService(
    OpencodeOptionsService,
    undefined,
  )(
    Effect.provideService(
      FaceShapeService,
      shape as DenormalizeShape<unknown>,
    )(
      Effect.provideService(CanonicalEventService, {
        name: 'context',
        payload: { messages },
      } as unknown as HookEvent)(Effect.provideService(DeliveryContext, ctx)(program)),
    ),
  );
  return Effect.runSync(delivered);
}

describe('lifecycle capability — OMP face (all-roles latest frame)', () => {
  it('normalizes and echoes over the OMP message surface (canonical partial { messages })', () => {
    const { ctx } = spyDelivery();
    const messages = [ompMessage('user', FRAME), ompMessage('assistant', 'work')];
    const result = dispatchContext(OMP_SHAPE as DenormalizeShape<unknown>, messages, ctx);
    expect(result !== null && typeof result === 'object' && 'messages' in result).toBe(true);
    const out = (result as { messages: OmpAgentMessage[] }).messages;
    expect(out).toHaveLength(2);
    // The echo line is appended to the frame-bearing user message.
    expect(String(out[0]?.content)).toContain('[seam]');
    expect(String(out[0]?.content)).toContain('node n1');
    expect(out[1]?.content).toBe('work');
  });

  it('is a no-op without an anchored frame (changed false, passthrough)', () => {
    const { ctx } = spyDelivery();
    const messages = [ompMessage('user', 'no frame here')];
    const result = dispatchContext(OMP_SHAPE as DenormalizeShape<unknown>, messages, ctx);
    expect(result).toBeUndefined();
  });

  it('dedups the canonical line (second pass changed false)', () => {
    const { ctx } = spyDelivery();
    const first = dispatchContext(OMP_SHAPE as DenormalizeShape<unknown>, [ompMessage('user', FRAME)], ctx);
    const echoed = (first as { messages: OmpAgentMessage[] }).messages;
    const second = dispatchContext(OMP_SHAPE as DenormalizeShape<unknown>, echoed, ctx);
    expect(second).toBeUndefined();
  });
});

describe('lifecycle capability — opencode face (user-like roles first)', () => {
  it('normalizes and echoes over the opencode message surface (in-place mutation)', () => {
    const { ctx, mutate } = spyDelivery();
    const messages = [opencodeMessage('user', FRAME), opencodeMessage('assistant', 'work')];
    dispatchContext(OPENCODE_SHAPE as DenormalizeShape<unknown>, messages, ctx);
    expect(mutate).toHaveBeenCalledTimes(1);
    const [target, key, value] = mutate.mock.calls[0]!;
    expect(target).toBe('output');
    expect(key).toBe('messages');
    // The echo line is appended as a new text part on the user message.
    expect(String(value[0]?.parts?.at(-1)?.text)).toContain('[seam]');
    expect(value[1]?.parts?.[0]?.text).toBe('work');
  });

  it('role ordering selects the user-like frame over the all-roles latest', () => {
    const { ctx, mutate } = spyDelivery();
    // Latest frame belongs to assistant; an earlier frame belongs to user.
    const messages = [
      opencodeMessage('user', '## Run Frame\nRun a · node earlier'),
      opencodeMessage('assistant', FRAME),
    ];
    dispatchContext(OPENCODE_SHAPE as DenormalizeShape<unknown>, messages, ctx);
    expect(mutate).toHaveBeenCalledTimes(1);
    const value = mutate.mock.calls[0]![2] as OpencodeMessage[];
    // The echo lands on the user message (preferred role), not the assistant's latest frame.
    expect(value[0]?.parts?.[0]?.text).toBe('## Run Frame\nRun a · node earlier');
    expect(String(value[0]?.parts?.at(-1)?.text)).toContain('[seam]');
    expect(value[1]?.parts?.[0]?.text).toBe(FRAME);
  });
});

describe('lifecycle capability — surface', () => {
  it('self-wires the default context seam; unknown hook fails loudly', () => {
    const hooks = createHooks();
    const { lifecycle } = createCapabilities(hooks);
    lifecycle.echo();
    expect(hooks.context.chain).toHaveLength(1);
    expect(() => lifecycle.echo({}, 'not-a-hook' as never)).toThrow(/Unknown canonical event: not-a-hook/);
  });

  it('unwire detaches the echo wiring', () => {
    const hooks = createHooks();
    const { lifecycle } = createCapabilities(hooks);
    const unwire = lifecycle.echo();
    unwire();
    expect(hooks.context.chain).toHaveLength(0);
  });

  it('degrades to pass-through without a face shape (fail-open)', () => {
    const hooks = createHooks();
    const { lifecycle } = createCapabilities(hooks);
    lifecycle.echo();
    const program = foldMiddleware(hooks.context.chain)(BASE_HANDLER);
    const delivered = Effect.provideService(
      OpencodeOptionsService,
      undefined,
    )(
      Effect.provideService(CanonicalEventService, {
        name: 'context',
        payload: { messages: [ompMessage('user', FRAME)] },
      } as unknown as HookEvent)(
        Effect.provideService(DeliveryContext, {
          notify: () => undefined,
          appendEntry: () => undefined,
          mutate: () => undefined,
        })(program),
      ),
    );
    expect(Effect.runSync(delivered)).toBeUndefined();
  });

  it('the capability object carries no injection member (injection lives in the adapters)', () => {
    const hooks = createHooks();
    const { lifecycle } = createCapabilities(hooks);
    expect('injection' in lifecycle).toBe(false);
  });
});

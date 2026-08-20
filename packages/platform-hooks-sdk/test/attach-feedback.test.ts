/**
 * Proactive feedback on hint attachment (hints capability) —
 * `hints.use(fn)` every successful attachment emits a notify
 * FeedbackLine through the unified feedback channel; the per-attach
 * feedback option is removed (notify is the only emission kind);
 * fail-open holds. Pure — no I/O.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import {
  SCENARIO_IDS,
  createCapabilities,
  createHooks,
  type DeliveryContextService,
  type HintDisplayFn,
  type HookEvent,
  type ScenarioHintBlock,
} from '../src/index.js';
import { dispatchSync, spyDelivery } from './helpers/dispatch.js';

const entries: readonly ScenarioHintBlock[] = SCENARIO_IDS.map((id) => ({
  id,
  body: `hint block for ${id}`,
}));

/** Display fn returning the read block body (null when no coverage). */
function readDisplay(): HintDisplayFn {
  return (ctx) => (ctx.scenario === 'read' ? (entries.find((b) => b.id === 'read')?.body ?? null) : null);
}

/** Run a successful read tool_result through the hints capability with the given ctx. */
function dispatchRead(
  ctx: DeliveryContextService,
  payload: Record<string, unknown> = { toolName: 'read', args: { path: 'a.ts' }, content: [] },
  options?: { unwire?: boolean },
): unknown {
  const hooks = createHooks();
  const { hints } = createCapabilities(hooks);
  const unwire = hints.use(readDisplay());
  if (options?.unwire === true) unwire();
  return dispatchSync(hooks.tool_result.chain, { name: 'tool_result', payload } as unknown as HookEvent, ctx);
}

describe('proactive feedback on hint attachment', () => {
  it('emits a notify FeedbackLine by default on successful attachment', () => {
    const { ctx, notify } = spyDelivery();
    dispatchRead(ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('hint block for read');
  });

  it('a multi-group attachment emits ONE notify line with the joined text', () => {
    const { ctx, notify } = spyDelivery();
    const hooks = createHooks();
    const { hints } = createCapabilities(hooks);
    hints.use(() => ['group one', 'group two']);
    dispatchSync(
      hooks.tool_result.chain,
      {
        name: 'tool_result',
        payload: { toolName: 'read', args: { path: 'a.ts' }, content: [] },
      } as unknown as HookEvent,
      ctx,
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('group one\ngroup two');
  });

  it('no scenario coverage emits nothing', () => {
    const { ctx, notify } = spyDelivery();
    dispatchRead(ctx, { toolName: 'task', args: {}, content: [] });
    expect(notify).not.toHaveBeenCalled();
  });

  it('errorShaped executions emit nothing', () => {
    const { ctx, notify } = spyDelivery();
    dispatchRead(ctx, { toolName: 'read', args: { path: 'a.ts' }, content: [], errorShaped: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('a throwing delivery never throws into the dispatch (fail-open)', () => {
    const ctx = {
      notify: () => {
        throw new Error('delivery exploded');
      },
      appendEntry: () => undefined,
      mutate: () => undefined,
    } as unknown as DeliveryContextService;
    expect(() => dispatchRead(ctx)).not.toThrow();
  });

  it('unwire stops both attachment and emission', () => {
    const { ctx, notify } = spyDelivery();
    const result = dispatchRead(
      ctx,
      { toolName: 'read', args: { path: 'a.ts' }, content: [] },
      {
        unwire: true,
      },
    );
    expect(notify).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});

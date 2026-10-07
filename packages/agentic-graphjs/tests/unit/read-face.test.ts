import { describe, expect, it } from 'vitest';

import { createRuntime, type RuntimeDeps } from '../../src/internal.js';
import { fresh } from '../support/runtime-face.js';

/**
 * The silent paths the read and persist faces closed: a read answers its empty view only when the
 * chain itself is unreadable, a fault in the call's own arguments raises instead, and the work a
 * rewind names has to be work the chain carries.
 */
describe('the silent paths the read faces closed', () => {
  it('raises on every read face when the runtime carries no capability at all', async () => {
    const bare = createRuntime({} as unknown as RuntimeDeps);

    await expect(bare.history({ graph: 'chain' })).rejects.toThrow(/CAPABILITY_MISSING/);
    await expect(bare.getState({ graph: 'chain' })).rejects.toThrow(/CAPABILITY_MISSING/);
    await expect(bare.status({ graph: 'chain' })).rejects.toThrow(/CAPABILITY_MISSING/);
  });

  it('binds the chain read to the graph it names instead of the thread it rides', async () => {
    const runtime = createRuntime(fresh());
    await runtime.take({ graph: 'chain' });

    // Assertion: the thread's own chain answers under its own name, and a name the module cannot
    // load answers no chain at all — never the thread's own under a name it does not belong to.
    expect(await runtime.history({ graph: 'chain' })).toHaveLength(0);
    expect(await runtime.history({ graph: 'nope' })).toEqual([]);
  });

  it('refuses a rewind that names work the chain does not carry', async () => {
    const runtime = createRuntime(fresh());
    await runtime.take({ graph: 'chain' });
    await runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    const [oldest] = (await runtime.history({ graph: 'chain' })).slice(-1);

    // Assertion: a retained id the chain never recorded is refused by name, so a rewind can no
    // longer report success while silently keeping work nothing had settled.
    const refused = await runtime.rewind({ to: oldest?.id ?? '', retained: ['ghost#0'] });
    expect(refused.kind === 'rejected' && refused.refusal.code).toBe('BAD_CALL');
    expect(refused.kind === 'rejected' && refused.refusal.note).toContain('ghost#0');
  });

  it('keeps the retry ask out of the window it moves no state for', async () => {
    const runtime = createRuntime(fresh());
    await runtime.take({ graph: 'chain' });
    await runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'retry', reason: 'ask again' });

    // Assertion: the ask rides the chain alone — no settlement and no superstep reaches the view.
    const view = await runtime.status({ graph: 'chain' });
    expect(view.settlements).toEqual([]);
    expect(view.liveness.progress).toEqual([]);
  });
});

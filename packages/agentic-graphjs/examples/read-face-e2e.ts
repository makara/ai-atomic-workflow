/**
 * The read faces over a driven chain: `boundGraph` names the thread's binding, `history` lists
 * the chain, `getState` folds it, and `status` rebuilds the window — the same run the other
 * routes transcribe, then the ledger read back. `bun run example` prints both.
 */

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createRuntime, type Runtime } from 'agentic-graphjs';
import { chain, drive, graphSource, memorySaver } from './memory-e2e.js';

/** The read route: drive the chain to its terminal, then read the ledger back. */
export async function run(): Promise<string[]> {
  const runtime: Runtime = createRuntime({
    checkpointer: memorySaver(),
    context: { threadId: 'e2e' },
    graphs: graphSource(chain()),
  });
  const lines = await drive(runtime);
  lines.push(`boundGraph -> ${String(await runtime.boundGraph())}`);
  const chainView = await runtime.history({ graph: 'e2e' });
  lines.push(`history -> ${String(chainView.length)} checkpoints (${chainView.map(({ id }) => id).join(', ')})`);
  const state = await runtime.getState({ graph: 'e2e' });
  lines.push(`getState -> ${String(state.next.length)} next (${state.next.join(', ')})`);
  const view = await runtime.status({ graph: 'e2e' });
  lines.push(
    `status -> ${String(view.settlements.length)} settlements, ${String(view.liveness.progress.length)} steps`,
  );
  return lines;
}

// The real path, not the invoked one: a symlinked or wrapped entry must still answer as the entry.
const IS_ENTRY = process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (IS_ENTRY) {
  process.stdout.write(`${(await run()).join('\n')}\n`);
}

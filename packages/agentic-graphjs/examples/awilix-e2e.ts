/**
 * The Awilix convenience route: the same capabilities, registered through
 * `runtimeContainer` and read off a scope's cradle. Same graph, same drive,
 * same transcript as the memory variant — only the registration face differs.
 */

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createRuntime, runtimeContainer } from 'agentic-graphjs';
import { chain, drive, graphSource, memorySaver } from './memory-e2e.js';

/** The convenience route: one container, one scope, the cradle as the deps object. */
export async function run(): Promise<string[]> {
  const container = runtimeContainer({
    checkpointer: () => memorySaver(),
    context: () => ({ threadId: 'e2e' }),
    graphs: () => graphSource(chain()),
  });
  const scope = container.createScope();
  try {
    return await drive(createRuntime(scope.cradle));
  } finally {
    await scope.dispose();
  }
}

// The real path, not the invoked one: a symlinked or wrapped entry must still answer as the entry.
const IS_ENTRY = process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (IS_ENTRY) {
  process.stdout.write(`${(await run()).join('\n')}\n`);
}

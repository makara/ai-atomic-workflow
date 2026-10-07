/**
 * The declared-node resolution — the one place a name becomes a node declaration.
 *
 * `plan` and `run` carried the same resolution twice; the resolution now stands
 * here as one helper and both faces consult it. An unknown name keeps answering
 * through `run`'s own fault class, with the same code and the same message — the
 * helper folds the place the fault was built, never the fact it states.
 *
 * @module
 */

import { ownValue } from '../fold/reducers.js';
import type { CompiledGraph, NodeSpec } from '../ir.js';
import { RuntimeError } from './run.js';

/** The declared node one name resolves to. */
export function nodeSpecOf(graph: CompiledGraph, node: string): NodeSpec {
  const spec = ownValue(graph.nodes, node);
  if (spec === undefined) throw new RuntimeError('unknown-node', `no node is declared as '${node}'`);
  return spec;
}

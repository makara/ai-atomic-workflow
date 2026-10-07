/**
 * The plan step — the frontier of one super-step as tasks.
 *
 * The frontier arrives on the state: the entry sentinel seeds it, and every
 * settled step routes it on (static hops and the key the router carries).
 * Planning projects that frontier into the work face the host executes: one
 * task per active node, each carrying the channel values its node reads and
 * the judgment material the host needs to run it: the task text,
 * its result spec, and the declared key set.
 *
 * @module
 */

import type { ChannelState } from '../contract/channels.js';
import { defineOwn, ownValue } from '../fold/reducers.js';
import { type CompiledGraph, type Json } from '../ir.js';
import { type RunState } from './run.js';
import { nodeSpecOf } from './spec.js';

/**
 * One unit of work inside a super-step. The id is the node's occurrence —
 * `node#k`, the k-th settlement of that node in this run — and the input is
 * the value of each channel the node reads. The judgment material rides the
 * task: `task` (the node's task text), `resultSpec` (the result-spec section
 * when the text carries one), and `keys` (the declared key names).
 */
export type Task = {
  readonly id: string;
  readonly node: string;
  readonly input: Json;
  readonly task: string;
  readonly resultSpec: string;
  readonly keys: readonly string[];
};

/** The marker the atom texts use to separate the task from its result spec. */
const RESULT_SPEC_MARKER = "Result spec (what this node's result must satisfy):";

/** The value one read names: the held value, or `null` while no write reached the channel. */
function readValue(channels: ChannelState, name: string): Json {
  const held = ownValue(channels, name);
  return held === undefined ? null : held.value;
}

/** Split the task text into its task body and the result-spec section it carries. */
function splitResultSpec(text: string): { readonly task: string; readonly resultSpec: string } {
  const at = text.indexOf(RESULT_SPEC_MARKER);
  if (at === -1) return { task: text.trim(), resultSpec: '' };
  return { task: text.slice(0, at).trim(), resultSpec: text.slice(at + RESULT_SPEC_MARKER.length).trim() };
}

/** Project the frontier of one state into the task face, in frontier order. */
export function plan(graph: CompiledGraph, state: RunState): readonly Task[] {
  const tasks: Task[] = [];
  for (const node of state.active) {
    const spec = nodeSpecOf(graph, node);
    const input: Record<string, Json> = {};
    for (const name of spec.read) defineOwn(input, name, readValue(state.channels, name));
    const split = splitResultSpec(spec.task);
    // The identity is the occurrence, never the position: the k-th settlement of this node
    // mints `node#k`, so a revisited node never collides with its earlier self.
    tasks.push({
      id: `${node}#${ownValue(state.visits, node) ?? 0}`,
      node,
      input,
      task: split.task,
      resultSpec: split.resultSpec,
      keys: spec.keys.map((key) => key.name),
    });
  }
  return tasks;
}

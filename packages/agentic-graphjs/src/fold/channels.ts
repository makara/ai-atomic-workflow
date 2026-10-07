/**
 * The channel layer — folding a write chain into a state.
 *
 * A state is a pure function of the chain: fold from the initial state and the
 * same chain always lands on the same state. That is what lets a restored
 * prefix continue as a run and what keeps an earlier state readable after a
 * later one is reached — the fold is re-run, never cached.
 *
 * @module
 */

import type { ChannelState, ChannelValue, ChannelWrite } from '../contract/channels.js';
import type { ChannelSpec, Json } from '../ir.js';
import { REDUCER_EMPTY, defineOwn, ownValue, reduce } from './reducers.js';

/** The closed set of faults the channel layer raises. */
export type ChannelFaultCode = 'unknown-channel';

/** A fault raised where a write names a channel the graph does not declare. */
export class ChannelError extends Error {
  readonly code: ChannelFaultCode;

  constructor(code: ChannelFaultCode, message: string) {
    super(message);
    this.name = 'ChannelError';
    this.code = code;
  }
}

/** The empty value one fresh channel starts at: a copy per channel, so two channels never share a
 *  mutable empty and a fold into one cannot show up in the other. */
function emptyFor(reducer: keyof typeof REDUCER_EMPTY): Json {
  const empty = REDUCER_EMPTY[reducer];
  if (Array.isArray(empty)) return [];
  return typeof empty === 'object' && empty !== null ? {} : empty;
}

/** The state a fresh chain starts from: every channel at its reducer's empty value, version zero. */
export function initialState(channels: readonly ChannelSpec[]): ChannelState {
  const state: Record<string, ChannelValue> = {};
  for (const spec of channels) defineOwn(state, spec.name, { value: emptyFor(spec.reducer), version: 0 });
  return state;
}

/** Fold one write into one channel, advancing that channel's version. */
export function applyWrite(
  channels: readonly ChannelSpec[],
  state: ChannelState,
  name: string,
  write: Json,
): ChannelState {
  return applyNamed(indexOf(channels), state, name, write);
}

/** Fold one write map over the state — a channel the map omits keeps its value and its version.
 *  The declared set is indexed once per map, so the per-write lookup is the index's own, not a
 *  scan of the declaration. */
export function applyWrites(channels: readonly ChannelSpec[], state: ChannelState, writes: ChannelWrite): ChannelState {
  const byName = indexOf(channels);
  let next = state;
  for (const [name, write] of Object.entries(writes)) next = applyNamed(byName, next, name, write);
  return next;
}

/** The declared set by name: the one index every write path reads. */
function indexOf(channels: readonly ChannelSpec[]): ReadonlyMap<string, ChannelSpec> {
  return new Map(channels.map((spec) => [spec.name, spec] as const));
}

/** Fold one write through an indexed declared set: the one body `applyWrite` and `applyWrites`
 *  share. */
function applyNamed(
  byName: ReadonlyMap<string, ChannelSpec>,
  state: ChannelState,
  name: string,
  write: Json,
): ChannelState {
  const spec = byName.get(name);
  if (spec === undefined) throw new ChannelError('unknown-channel', `no channel is declared as '${name}'`);
  const held = ownValue(state, name);
  const current: ChannelValue = held ?? { value: REDUCER_EMPTY[spec.reducer], version: 0 };
  return { ...state, [name]: { value: reduce(spec.reducer, current.value, write), version: current.version + 1 } };
}

/**
 * Fold a whole write chain from the initial state. A chain prefix is a state of
 * its own: folding it and appending the rest lands on the same state as folding
 * the whole chain at once.
 */
export function foldWrites(channels: readonly ChannelSpec[], chain: readonly ChannelWrite[]): ChannelState {
  let state = initialState(channels);
  for (const writes of chain) state = applyWrites(channels, state, writes);
  return state;
}

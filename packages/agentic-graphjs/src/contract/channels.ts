/**
 * The channel value shapes — one channel's folded value, the state those values
 * form, and the write maps that change them.
 *
 * The shapes are contract, not mechanism: the fold that reads them lives in the
 * fold module, while the port table, the log, and the checkpoint store all speak
 * these same three names. They live here so no implementation file has to
 * name another implementation file to speak them.
 *
 * @module
 */

import type { Json } from '../ir.js';

/** One channel's folded value plus the count of writes folded into it. */
export interface ChannelValue {
  readonly value: Json;
  readonly version: number;
}

/** A state: one entry per declared channel. */
export type ChannelState = Readonly<Record<string, ChannelValue>>;

/** One write map — the channels one step writes. */
export type ChannelWrite = Readonly<Record<string, Json>>;

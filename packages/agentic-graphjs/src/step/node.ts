/**
 * The node stub — what a node body is once the runtime owns execution.
 *
 * A stub decides nothing and reads nothing outside its own declaration: it
 * either reports the writes its settlement carries, or suspends with the
 * payload it was declared with. Every fact a node needs therefore reaches the
 * runtime as data, and a settled node is never asked again.
 *
 * @module
 */

import type { ChannelWrite } from '../contract/channels.js';
import type { NodeSpec } from '../ir.js';
import { interrupt } from './interrupt.js';

/**
 * One settlement: the node it answers, the key it records, and the writes it
 * fans out. The writes arrive from the caller — the runtime owns no mapping
 * from a key to a channel.
 */
export interface Settlement {
  readonly node: string;
  readonly key: string;
  readonly writes?: ChannelWrite;
}

/**
 * Run one node's stub: a settled node reports its writes, an unsettled node
 * suspends with its payload. The call is pure — it reads no clock, no
 * environment, and no channel.
 */
export function runNode(node: string, spec: NodeSpec, settlement: Settlement | undefined): ChannelWrite {
  if (settlement === undefined) return interrupt(node, spec.task);
  return settlement.writes ?? {};
}

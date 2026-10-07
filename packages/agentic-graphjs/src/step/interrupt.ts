/**
 * The suspension call — the one way a node hands control back to its host.
 *
 * A node that carries no settlement cannot decide anything, so it stops the
 * step and names the payload its host needs. The step function catches the
 * marker and answers with an interrupt result; nothing else in the runtime
 * reads it.
 *
 * @module
 */

import type { Json } from '../ir.js';

/** What a suspension carries out of the node that raised it. */
export interface Suspension {
  readonly node: string;
  readonly payload: Json;
}

/** The marker a suspended node throws, caught by the step function. */
export class Suspended extends Error {
  readonly node: string;
  readonly payload: Json;

  constructor(suspension: Suspension) {
    super(`node '${suspension.node}' carries no settlement`);
    this.name = 'Suspended';
    this.node = suspension.node;
    this.payload = suspension.payload;
  }
}

/** Suspend the current node: hand its payload to the host and stop the step. */
export function interrupt(node: string, payload: Json): never {
  throw new Suspended({ node, payload });
}

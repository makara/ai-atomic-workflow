/**
 * The frozen report face — what one settle's caller delivers.
 *
 * The shape is contract, not mechanism: the five steps a report lands through
 * belong to `../settle/settle.ts`, while this shape is what the judge port reads and
 * the settle normalizes. It lives here so neither side has to name the other.
 *
 * @module
 */

import type { ArtifactRef, Receipt } from './log.js';

/** What the host delivers to one settle — the frozen report face. */
export type ReportInput = {
  /** The graph the order belongs to — the call's own binding, never the instance's memory,
   *  a fresh instance settles without a prior `take` on the same process. */
  readonly graph: string;
  readonly taskId: string;
  readonly outcome: 'succeeded' | 'failed' | 'retry';
  readonly key?: string;
  readonly result?: string;
  /** The artifacts this task produced, each either a bare reference (the string shorthand) or
   *  the object form `{ref, mediaType?, bytes?, sha256?}` the host may enrich with metadata. A
   *  `succeeded` whose object form carries no `ref` answers as `failed`; the shorthand is the
   *  same reference, told short. */
  readonly outputs?: readonly (string | ArtifactRef)[];
  readonly reason?: string;
  /** The receipts for the external actions this task recorded, one per action: its reference
   *  and its state (`reserved | settled | ambiguous`). A node whose capabilities reach outside
   *  itself (`tool` or `command`) is done only when the receipts say it is: a `succeeded` that
   *  brings no receipts, or a state outside that closed vocabulary, answers as `failed`. For
   *  every other node the receipts are inert evidence beside the work. */
  readonly receipts?: readonly Receipt[];
};

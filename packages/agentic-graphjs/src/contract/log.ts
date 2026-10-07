/**
 * The logged value shapes — what one settle journals and what one replay folds.
 *
 * The entry forms ride beside the work, the receipts and artifact refs carry the
 * evidence a host can read back, and the two host-supplied faces (identity and
 * clock) keep the package free of minted ids and read clocks. The log itself, and
 * the state view over it, live in the implementation files.
 *
 * @module
 */

import type { ChannelWrite } from './channels.js';

/** One receipt the host hands in beside one external action a node recorded: the reference the
 *  host can read back (a call id, a log anchor, a journal key — never a path guess) and the
 *  state the action left behind. The state rides as written; the vocabulary is closed —
 *  `reserved`, `settled`, `ambiguous` — and anything outside it answers as the node's failure. */
export interface Receipt {
  readonly ref: string;
  readonly state: string;
}

/** One artifact a task produced, in the object form the ledger and the view carry: the reference
 *  itself (an id or a locator the host can resolve — never a path guess), plus the metadata the
 *  host may enrich it with — media type, byte size, digest. A report may hand the reference in as
 *  a bare string shorthand instead; the settle normalizes it to `{ ref }`. */
export interface ArtifactRef {
  readonly ref: string;
  readonly mediaType?: string;
  readonly bytes?: number;
  readonly sha256?: string;
}

/** The writes one settled task applied: its id, the write maps it contributed, the routing key
 *  the settlement answered, the attempt ordinal, and the evidence the report carried — the
 *  receipts for the external actions the task recorded, and the artifact refs it produced. The
 *  key lands with the writes so a cold replay never recomputes it (a multi-key node's key is the
 *  report's own answer, not derivable), and the evidence rides beside the work so the replay and
 *  the view read it back, moving no state on its own. */
export interface LogEntry {
  readonly taskId: string;
  readonly writes: readonly ChannelWrite[];
  readonly key?: string;
  /** The attempt ordinal the fact was journaled at, sourced from the task id's `#k`
   *  (`node#k` carries `k + 1`): the replay reads the number off the fact and cross-checks
   *  the chain's own counter, so an edited attempt surfaces as a refusal, never as a
   *  silently different replay. The counter itself stays the chain's, never a second one. */
  readonly attempt?: number;
  /** The receipts, one per external action the task recorded — inert on state, readable on
   *  the fact, and shown as `unsettled` in the view while a state has not reached `settled`. */
  readonly receipts?: readonly Receipt[];
  /** The artifact refs the report handed in, normalized to the object form — metadata the host
   *  may have enriched them with, readable on the fact and presented by the view. */
  readonly outputs?: readonly ArtifactRef[];
}

/** One report's non-success outcome, journaled beside the work: `retry` is the ask to re-mint
 *  the task, `failed` the terminal failure (its reason rides it). A `failed` that carries a key
 *  routes on it like a success and carries its writes, so the replay reads the key from the fact
 *  and never recomputes it; a keyless outcome moves no state and rides the chain alone. */
export interface OutcomeEntry {
  readonly taskId: string;
  readonly outcome: 'failed' | 'retry';
  readonly reason?: string;
  readonly key?: string;
  readonly writes?: ChannelWrite;
  /** The attempt ordinal, carried the same way `LogEntry` carries it. */
  readonly attempt?: number;
  /** The receipts, carried the same way `LogEntry` carries them — the failure's own evidence
   *  rides beside the failure, readable on replay. */
  readonly receipts?: readonly Receipt[];
  /** The artifact refs, carried the same way `LogEntry` carries them. */
  readonly outputs?: readonly ArtifactRef[];
}

/** One marker the host writes beside the chain: what a node was doing and where the chain
 *  stood while it did it. The engine writes none and reads it as inert — it moves no state,
 *  so a replay that carries markers folds byte-identically to one without them. */
export interface ProgressEntry {
  readonly node: string;
  readonly detail: string;
  /** The position the marker names — the chain's position, or the attempt's own mark. */
  readonly at?: string;
}

/** The identity face: ids arrive from the host, so a replay mints the same ones. */
export interface IdentityPort {
  nextId(): string;
}

/** The clock face: timestamps arrive from the host, so the package reads no clock. */
export interface ClockPort {
  now(): string;
}

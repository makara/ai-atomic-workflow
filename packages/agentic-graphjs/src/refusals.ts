/**
 * The refuse face: the face-side vocabulary — the ten design codes the call face
 * answers with, plus the single infra channel (non-design) and the dashed take-face
 * code (`input-missing`, mechanism prose). The same input always produces the same
 * payload — codes and notes are frozen here, candidate keys arrive with the report
 * that failed to match.
 *
 * @module
 */

/** The twelve codes of the refuse table: the ten design codes, the infra channel, the take-face code. */
export const REFUSAL_CODES = [
  'BAD_CALL',
  'CAPABILITY_MISSING',
  'GRAPH_UNREADABLE',
  'STRUCTURE_DRIFT',
  'NO_OUTSTANDING_TASK',
  'KEY_UNDECLARED',
  'KEY_UNMATCHED',
  'SETTLEMENT_UNANCHORED',
  'TASK_AMBIGUOUS',
  'CHECKPOINT_UNKNOWN',
  'infra',
  'input-missing',
] as const;

/** One of the twelve refusal codes. */
export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** The single infra channel (non-design): engine-side conditions the caller cannot act on. */
export const INFRA = 'infra';

/** The payload a refusal carries: its code, the note that made it, and the candidate keys when it has them. */
export type RefusalPayload = {
  readonly code: RefusalCode;
  readonly note: string;
  readonly keys?: readonly string[];
};

/** What each code means and the next step it names — the frozen refuse rows. */
export type RefusalInfo = {
  readonly meaning: string;
  readonly next: string;
};

/** The twelve-row table, one entry per code. */
export const REFUSALS: Readonly<Record<RefusalCode, RefusalInfo>> = {
  BAD_CALL: {
    meaning: 'the call does not fit the tool single shape',
    next: 're-issue the call against the tool one shape (the schema is the shape)',
  },
  CAPABILITY_MISSING: {
    meaning: 'the runtime carries no such capability — the port a read face needs was never registered',
    next: 'register the ports the runtime requires, then re-issue the same call',
  },
  GRAPH_UNREADABLE: {
    meaning: 'the graph name loads as no document',
    next: 'pick a name from the available graph-name table the answer carries',
  },
  STRUCTURE_DRIFT: {
    meaning: 'the bound graph structure no longer matches the ledger (asset axis)',
    next: 'rebind on a new thread or restore the asset',
  },
  NO_OUTSTANDING_TASK: { meaning: 'no task is outstanding on the lane', next: 'take first' },
  KEY_UNDECLARED: {
    meaning: 'the reported key is not in the node declared set',
    next: 'pick one of the declared candidate keys',
  },
  KEY_UNMATCHED: {
    meaning: 'the reported key matches no route the answered node declares',
    next: 'pick one of the candidate keys the answer carries',
  },
  SETTLEMENT_UNANCHORED: {
    meaning: 'the report carries neither a result text nor a resolving pointer',
    next: 're-report with the result and the pointers that back it',
  },
  TASK_AMBIGUOUS: {
    meaning: 'several orders are in flight and no taskId was given',
    next: 'name the order in taskId and report again',
  },
  CHECKPOINT_UNKNOWN: {
    meaning: 'the checkpoint id is not on the current chain',
    next: 'read a legal id from the checkpoint table the answer carries',
  },
  infra: {
    meaning: 'an engine-side condition the caller cannot act on (missing port, key-set drift, fold failure)',
    next: 'fix the engine side, then re-issue the same call',
  },
  'input-missing': {
    meaning: 'take input omits a key the graph-level input declares',
    next: 'supply the omitted keys or declare none on the graph',
  },
};

/** The codes whose payload carries the candidate key set. */
const KEY_BEARING: readonly RefusalCode[] = ['KEY_UNDECLARED', 'KEY_UNMATCHED'];

/** Assemble one payload; the key-bearing codes keep their candidates, the others stay two-field. */
export function refuse(code: RefusalCode, note: string, keys?: readonly string[]): RefusalPayload {
  if (KEY_BEARING.includes(code) && keys !== undefined) return { code, note, keys };
  return { code, note };
}

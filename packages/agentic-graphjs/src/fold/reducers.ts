/**
 * The reducer library — one pure fold per channel.
 *
 * A reducer folds a channel's current value with one write into the next value.
 * Purity is the load-bearing property: the whole chain is folded again on every
 * re-entry, so a reducer that read a clock, an identity, or module state would
 * make replay non-deterministic and a restored prefix would disagree with the
 * original run.
 *
 * @module
 */

import type { Json, ReducerId } from '../ir.js';

/** A reducer folds one channel's current value with one write into the next value. */
export type Reducer = (current: Json, write: Json) => Json;

/** The closed set of faults a fold raises. */
export type ReducerFaultCode = 'not-a-list' | 'not-a-record' | 'unknown-reducer';

/** A fault raised where the write does not fit the channel's reducer. */
export class ReducerError extends Error {
  readonly code: ReducerFaultCode;

  constructor(code: ReducerFaultCode, message: string) {
    super(message);
    this.name = 'ReducerError';
    this.code = code;
  }
}

/** The record a record-valued channel folds into, if it is one. */
function isRecord(value: Json): value is Readonly<Record<string, Json>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** How a value reads in a fault message. */
function describe(value: Json): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'a list' : typeof value;
}

/** The list a list-valued channel folds into, if it is one. */
function isList(value: Json): value is readonly Json[] {
  return Array.isArray(value);
}

/** The list a list-valued channel folds into. */
function asList(value: Json): readonly Json[] {
  if (!isList(value)) throw new ReducerError('not-a-list', `a list-valued channel holds ${describe(value)}`);
  return value;
}

/** The record a record-valued channel folds into. */
function asRecord(value: Json): Readonly<Record<string, Json>> {
  if (!isRecord(value)) throw new ReducerError('not-a-record', `a record-valued channel holds ${describe(value)}`);
  return value;
}

/** The own value a name holds on one container, or `undefined` when the container carries no such
 *  own property: a name like `__proto__` resolves through `[[Get]]` to the prototype accessor, so
 *  an unguarded index answers a value the container never held — and a shape comparison reading it
 *  answers `true` for two records that share no key. */
export function ownValue<T>(container: Readonly<Record<string, T>>, name: string): T | undefined {
  return Object.hasOwn(container, name) ? container[name] : undefined;
}

/** Write one own data property, whatever the name spells: `container[name] = value` routes a
 *  `__proto__` name through the inherited setter and replaces the container's prototype instead of
 *  holding the key, while `defineProperty` lands the own enumerable slot every later read counts on
 *  — the one a spread copy, `Object.entries`, and the canonical bytes all see. */
export function defineOwn<T>(target: Record<string, T>, name: string, value: T): void {
  Object.defineProperty(target, name, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * Structural equality over the value domain — a parsed value carries no
 * identity, so uniqueness is decided by shape rather than by reference.
 */
export function sameValue(left: Json, right: Json): boolean {
  if (isList(left) || isList(right)) {
    if (!isList(left) || !isList(right) || left.length !== right.length) return false;
    return left.every((item, index) => {
      const held = right[index];
      return held !== undefined && sameValue(item, held);
    });
  }
  if (!isRecord(left) || !isRecord(right)) return left === right;
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([name, value]) => {
    const held = ownValue(right, name);
    return held !== undefined && sameValue(value, held);
  });
}

/** Nested-key-preserving merge: a key both sides hold as a record folds in place, any other key takes the write. */
function mergeRecords(current: Readonly<Record<string, Json>>, write: Readonly<Record<string, Json>>): Json {
  const out: Record<string, Json> = { ...current };
  for (const [name, value] of Object.entries(write)) {
    const held = ownValue(out, name);
    const folded = held !== undefined && isRecord(held) && isRecord(value) ? mergeRecords(held, value) : value;
    defineOwn(out, name, folded);
  }
  return out;
}

/**
 * The reducer table: one fold per channel id. Every fold returns a fresh value
 * and never touches its arguments.
 */
export const REDUCERS: Readonly<Record<ReducerId, Reducer>> = {
  append: (current, write) => {
    const held = [...asList(current)];
    for (const item of isList(write) ? write : [write]) {
      // The identity check short-circuits the deep one: the same reference is the same value.
      if (!held.some((entry) => entry === item || sameValue(entry, item))) held.push(item);
    }
    return held;
  },
  merge: (current, write) => mergeRecords(asRecord(current), asRecord(write)),
  replace: (_current, write) => write,
};

/**
 * The value an untouched channel of each family holds: the identity the fold
 * starts from, so a first write lands on the write itself. `append` starts as an
 * empty list, `merge` as an empty record, `replace` at `null`.
 */
export const REDUCER_EMPTY: Readonly<Record<ReducerId, Json>> = Object.freeze({
  append: Object.freeze([]),
  merge: Object.freeze({}),
  replace: null,
});

/** Fold one write into one channel by reducer id. */
export function reduce(id: ReducerId, current: Json, write: Json): Json {
  const reducer = REDUCERS[id];
  if (reducer === undefined) throw new ReducerError('unknown-reducer', `no fold is declared for '${id}'`);
  return reducer(current, write);
}

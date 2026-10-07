/**
 * The canonical bytes of a value.
 *
 * Two readings of the same value must produce the same string, because the
 * replay assertions compare bytes: the order a record lists its keys in is the
 * only thing a plain stringifier lets drift, so the keys are emitted in
 * ascending order and everything else follows the value itself.
 *
 * @module
 */

import type { Json } from '../ir.js';

/** The canonical bytes of one value: keys ascending, arrays in index order, no whitespace. */
export function serialize(value: Json): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    // The canonical bytes are JSON, and JSON has no `NaN`/`Infinity`: `String` would answer a
    // token no parser reads back. `-0` is the one form `String` spells outside JSON, and `0` is
    // the byte JSON keeps for it.
    if (!Number.isFinite(value)) {
      throw new Error(`serialize: '${String(value)}' has no JSON form — the canonical bytes are JSON`);
    }
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  const entries = Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1));
  return `{${entries.map(([name, item]) => `${JSON.stringify(name)}:${serialize(item)}`).join(',')}}`;
}

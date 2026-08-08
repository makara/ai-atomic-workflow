/**
 * High-Level Tool (HLT) operation classes — the closed set referenced by
 * phase `operations:` declarations. Single source for schema validation; the
 * authoritative registry (contract/chain/enforcement views) lives in the
 * atom-kernel skill (§High-Level Tool Registry). A test pins this constant
 * against the skill document to prevent drift.
 */
export const HLT_OPERATION_CLASSES = [
  'locate',
  'read',
  'write',
  'verify',
  'compress',
  'review',
  'run',
  'archive',
  'graph-ops',
  'register_edit',
] as const;

export type HltOperationClass = (typeof HLT_OPERATION_CLASSES)[number];

export function isHltOperationClass(value: string): value is HltOperationClass {
  return (HLT_OPERATION_CLASSES as readonly string[]).includes(value);
}

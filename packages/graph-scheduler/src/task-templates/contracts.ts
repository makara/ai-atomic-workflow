/**
 * Contract-prose single sources — the canonical text of graph contracts
 * that were previously re-encoded in multiple builtin graphs (byte-duplicated
 * contract prose = drift surface). The task-template directory is the
 * compile-time content home: these constants are the ONE place the contract
 * body appears; graph task text references them by pointer, never
 * re-encoding the body.
 *
 * Consumers: adopting.ts (embeds GRILLING_ENCAPSULATION_CONTRACT in
 * the adopting node text); graphs whose nodes resolve a change name
 * (openspec-apply / openspec-engineer / adopt-with-docs / spec-implement)
 * reference CHANGE_NAME_RESOLUTION_RULE by pointer.
 */

/**
 * Grilling graph-dispatch encapsulation contract — the canonical wording
 * the adopting (grilling) node needs. Single home; a graph task text that
 * dispatches grilling SHALL reference this pointer, never re-encode the
 * body.
 */
export const GRILLING_ENCAPSULATION_CONTRACT = `Execute grilling per grilling skill. Graph dispatch encapsulation
contract: mandatory rounds — whole frontier per round, never
zero-question, never auto-gated; output shape
{ decisions: [{ decision, rationale }], shared_understanding: boolean }
— never 'consensus'; mandatory closing question "Anything to add?"
(recommended: no/complete) — shared_understanding only after the user
confirms the frontier is empty.`;

/**
 * Change-name blocked-resolution rule — the canonical resolution wording
 * for any node consuming a change name from a launching router
 * ({args.changeName}). Single home; graphs reference it by pointer, never
 * re-encode the rule text.
 */
export const CHANGE_NAME_RESOLUTION_RULE = `Change name resolution — NEVER ask: {args.changeName} → openspec list
--json single active → blocked + candidates. Never fabricate a name.`;

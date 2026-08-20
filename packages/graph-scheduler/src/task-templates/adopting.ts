import { GRILLING_ENCAPSULATION_CONTRACT } from './contracts.js';
import type { TemplateArgs } from './index.js';

/**
 * Adopting node task template — the framework-graph grilling adoption
 * node (arch-review-loop / first-principles-dev shared chain, single
 * source). One template per file. Embeds the grilling
 * encapsulation contract from the contracts single source.
 */
/** Adopting template function — the grilling adoption task text. */
export const adoptingTaskTemplate = (_args?: TemplateArgs): string => `${GRILLING_ENCAPSULATION_CONTRACT}

Input document (from the requirement router's reported report path /
session): present → record appends to it (appended_to set); absent →
record_path grilling-derived — never asked.
No-content rule: the adoption goal confirms nothing to adopt (idea_goal:
none — user confirmed nothing to adopt) → append NO record (no appendix
section), change_name empty, adr_created false — zero side effects.
Nothing to adopt (change_name empty) → direct end (per atom-kernel
§Direct end); the adopt stage never activates.
direct end: end the round.
Domain-modeling side effects (user-confirmed, never autonomous):
the project glossary file term updates; ADR decision — always asked,
three-condition
test shapes the recommendation, never the decision.

Output contract: decisions, shared_understanding, change_name,
adr_created, adr_path, input_document, appended_to, record_path,
direct_end (true | false).`;

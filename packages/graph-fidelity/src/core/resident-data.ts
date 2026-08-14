/**
 * Resident prompt texts — the P0 prompt-class content as DATA:
 * resident text lives outside logic; text changes never touch code.
 *
 * Sources (attributed, hash-pinned where applicable):
 * - PCL vocabulary — compressed from atom-pilot SKILL.md
 *   §Process-Control Language (atom-pilot stays the source of truth);
 * - HLT core requirement — compressed from atom-kernel
 *   §High-Level Tool Registry (atom-kernel stays the source of truth;
 *   byte-equality pinned by test/resident-hlt-pin.test.ts).
 *
 * R2 style prompts (caveman / rtk / ponytail) were removed with the
 * R2/R1 decoupling (ADR 0175) — the resident block is now the
 * unconditional correctness set (PCL + HLT) only.
 *
 * Pure data — no logic, no imports.
 *
 * @module
 */

/** PCL vocabulary — compressed from atom-pilot SKILL.md §Process-Control Language. */
export const PCL_VOCABULARY = `Process-control utterances during an active run (classified BEFORE node input; routing executed by the pilot):
- back / return to X → jump to X
- jump to X → jump to X
- re-review / re-run → jump (named phase; default current phase chain head)
- end / finish this round → complete run
- terminate / abort run → force-end run
- skip → continue (no branch)
- status / progress → run status
- history → run list`;

/** HLT core requirement — compressed copy of the atom-kernel Core Requirement box. */
export const HLT_CORE_REQUIREMENT = `HLT core requirement (must-follow on every call):
- State-changing work executes as registered calls {intent, tool, args, bound} — declared scope, no overreach
- In-project code → serena (locate may route through jcodemunch); single engine, no fallback
- Verify after every write (verify-after-write)
- Code cells fail loudly — never silent degrade
- Registered tool capability is never restricted (deny covers redundant platform paths only)
- Detail: HLT-REGISTRY.md (cold-read)`;

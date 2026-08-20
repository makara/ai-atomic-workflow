/**
 * Resident prompt texts — the P0 prompt-class content as DATA:
 * resident text lives outside logic; text changes never touch code.
 *
 * Sources (attributed, hash-pinned where applicable):
 * - PCL vocabulary — compressed from atom-pilot SKILL.md
 *   §Process-Control Language (atom-pilot stays the source of truth);
 * - scenario enumeration — DERIVED from the scenario hint blocks
 *   (hints.ts single source; see deriveScenarioEnumeration), wording
 *   single-sourced with the hint-block data;
 * - jcodemunch resident — DERIVED from the tool-name arrays
 *   (hints.ts single representation; see JCM_GUIDANCE_GROUPS /
 *   deriveJcmGuidance), never a parallel literal;
 *
 * The resident block is the unconditional decision-time set (PCL +
 * full five-scenario enumeration + independent jcodemunch entry —
 * 3 surfaces, no meta entries).
 * The activate guidance entry and the code-exploration entry are
 * REMOVED (ADR 0208): activation guidance stays platform-native at
 * the platform seam; the compressed posture is superseded by the
 * full enumeration.
 *
 * Consumer content home (ADR 0211; sdk-hooks-capabilities): the three
 * constants pass directly as `{ id, title, text }` entries through the
 * `resident.use({ content })` capability wiring (captured at bind
 * time — the built-in `resident` capability consumes them). A resident
 * content change lands in exactly this module.
 *
 * @module
 */

/** PCL vocabulary — compressed from atom-pilot SKILL.md §Process-Control Language (atom-pilot stays the source of truth); no intro prose (prompt-native-tool-chains minimization) — the slash alternatives are functional detection keywords, kept inline; `:` mapping (hints-dont-use-format de-arrow — no `→` in the resident set). */
export const PCL_VOCABULARY = `- start graph: graph_start (entry procedure: load atom-kernel + atom-phase-handler skills, run jcodemunch index_folder + serena activate_project)
- back / return to X: jump to X
- jump to X: jump to X
- re-review / re-run: jump (named phase; default current phase chain head)
- end / finish this round: complete run
- terminate / abort run: force-end run
- skip: continue (no branch)
- status / progress: run status
- history: run list`;

import type { ScenarioId } from '@ai-atomic-workflow/platform-hooks-sdk';
import { resolveToolName, SCENARIO_CHAINS } from './hints.js';

/**
 * Derive the five-scenario enumeration from the chain data source
 * (prompt-native-tool-chains single-source): one line per closed-set
 * scenario, naming the DO-NOT subject (the exact native trigger tool)
 * and the unique definite operation chain with numbered steps
 * (`1) … 2) …`, no `→` symbol — hints-dont-use-format) — the same data
 * that feeds the block bodies, no parallel hand-written wording. The
 * run scenario has no adapter steps — its line names the platform shell
 * posture (`rtk` prefix).
 */
export function deriveScenarioEnumeration(): string {
  const lines = (Object.keys(SCENARIO_CHAINS) as ScenarioId[]).map((id) => {
    const { trigger, steps } = SCENARIO_CHAINS[id];
    const chain = steps.length > 0 ? steps.map((step, index) => `${index + 1}) ${step}`).join(' ') : 'rtk prefix';
    return `- ${id} — DO NOT use ${trigger}; use ${chain}`;
  });
  return `Tool discipline by scenario — act before selecting tools:\n${lines.join('\n')}`;
}

/**
 * Full five-scenario enumeration — decision-time guidance (ADR 0208 +
 * hint-tool-context; chain form prompt-native-tool-chains, DO-NOT
 * numbered rendering hints-dont-use-format): each scenario states its
 * DO-NOT subject (the exact native trigger tool) and unique definite
 * operation chain once, DERIVED from the chain data source (hints.ts —
 * the enumeration is a derivation over the chain table, never a
 * parallel copy). Replaces the former activate guidance entry
 * (platform-native at the platform seam) and the code-exploration
 * posture entry (superseded by the full enumeration). The DO-NOT
 * subject names the native trigger exactly; chain steps are numbered
 * (no `→` symbol in the resident set).
 */
export const SCENARIO_ENUMERATION_GUIDANCE: string = deriveScenarioEnumeration();

/**
 * Independent jcodemunch resident — compressed full-coverage enumeration
 * of the jcodemunch prompt-policy tool set, one line per use-case group
 * ("use-case: tool names"), every source tool name retained, session-
 * start sequence order preserved. Decision-time injection before any
 * tool selection (jcodemunch-resident-hints).
 *
 * DERIVED from the tool-name arrays (hints.ts single representation):
 * the group table below is the reference-source extraction table
 * (hint-tool-context) — every item name resolves against the arrays via
 * `resolveToolName` (an unknown name throws at module load, so no
 * parallel literal can drift), exactly like the scenario enumeration
 * derives from the hint-block data source. The `(index_folder if
 * missing)` session-start condition is prose — index_folder has no
 * scenario coverage by design (index-mutation tools are fail-open).
 */
export interface JcmGuidanceGroup {
  readonly label: string;
  /** Inter-item separator; default ' / '. */
  readonly separator?: string;
  readonly items: ReadonlyArray<{
    /** Array-backed bare tool name (resolved against the hints.ts registry). */
    readonly name: string;
    /** Exact rendered suffix (parenthesized note or trailing prose). */
    readonly suffix?: string;
  }>;
}

/** The reference-source extraction table — one use-case group per line, names array-backed. */
export const JCM_GUIDANCE_GROUPS: readonly JcmGuidanceGroup[] = [
  {
    label: 'start session',
    separator: ' then ',
    items: [{ name: 'resolve_repo', suffix: '(index_folder if missing)' }, { name: 'suggest_queries' }],
  },
  {
    label: 'find code',
    items: [
      { name: 'search_symbols', suffix: '(kind/language/file_pattern)' },
      { name: 'search_text', suffix: '(is_regex, context_lines)' },
      { name: 'search_columns' },
    ],
  },
  {
    label: 'read code',
    separator: ', ',
    items: [
      { name: 'get_file_outline', suffix: 'first' },
      { name: 'get_symbol_source', suffix: '(symbol_ids batch)' },
      { name: 'get_context_bundle', suffix: '(symbol + imports)' },
      { name: 'get_file_content', suffix: '(line range, last resort)' },
    ],
  },
  {
    label: 'repo structure',
    items: [{ name: 'get_repo_outline' }, { name: 'get_file_tree', suffix: '(path_prefix)' }],
  },
  {
    label: 'relationships',
    items: [
      { name: 'find_importers' },
      { name: 'find_references' },
      { name: 'check_references' },
      { name: 'get_dependency_graph' },
      { name: 'get_blast_radius', suffix: '(include_depth_scores)' },
      { name: 'get_changed_symbols' },
      { name: 'find_dead_code' },
      { name: 'get_symbol_importance' },
      { name: 'get_class_hierarchy' },
      { name: 'get_call_hierarchy' },
      { name: 'get_hotspots' },
      { name: 'get_dependency_cycles' },
    ],
  },
  {
    label: 'session awareness',
    items: [
      { name: 'plan_turn' },
      { name: 'get_session_context' },
      { name: 'register_edit', suffix: '(after editing, invalidates caches)' },
    ],
  },
  {
    label: 'token budget',
    items: [
      { name: 'get_ranked_context', suffix: '(query + token_budget)' },
      { name: 'get_context_bundle', suffix: '(token_budget cap)' },
    ],
  },
  {
    label: 'keep index fresh',
    items: [{ name: 'index_file', suffix: 'after editing a file' }],
  },
];

/** Derive the jcodemunch resident guidance from the group table — every tool name resolves against the hints.ts arrays (single representation; unknown names throw at module load). */
function deriveJcmGuidance(groups: readonly JcmGuidanceGroup[] = JCM_GUIDANCE_GROUPS): string {
  const lines = groups.map((group) => {
    const rendered = group.items
      .map((item) => `${resolveToolName(item.name)}${item.suffix !== undefined ? ` ${item.suffix}` : ''}`)
      .join(group.separator ?? ' / ');
    return `- ${group.label}: ${rendered}`;
  });
  return `jCodemunch — use it instead of native file tools for code exploration:\n${lines.join('\n')}`;
}

/**
 * Independent jcodemunch resident — compressed full-coverage enumeration
 * of the jcodemunch prompt-policy tool set, one line per use-case group
 * ("use-case: tool names"), every source tool name retained, session-
 * start sequence order preserved. Decision-time injection before any
 * tool selection (jcodemunch-resident-hints). Wording is single-sourced
 * with the scenario hint blocks (hints.ts) — the same reference-source
 * extraction table drives both surfaces; the guidance is a derivation
 * over the tool-name arrays, never a parallel literal.
 */
export const JCM_RESIDENT_GUIDANCE: string = deriveJcmGuidance();

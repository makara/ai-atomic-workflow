/**
 * Scenario hint content + the display-decision function (scenario-tool-hints).
 * Five blocks keyed by the closed scenario set {find, read, write, verify, run} —
 * review is role-triggered (graph review nodes carry their own review
 * standards), never tool-triggered, and is NOT a member
 * (scenario-interface-redesign). Each block is native-tool-keyed
 * (prompt-native-tool-chains): the common native tool trigger fires the
 * hint and the body states ONE unique definite operation chain (jcm
 * step → serena step, requirement-fixed order) with verbatim parameter
 * shapes from the `.refs` tool definitions — never parallel alternative
 * samples. Prompt text never references the retired registry acronym.
 *
 * Single representation (fidelity single-source): the tool-name arrays
 * below are the ONE home for every promoted tool name. The chain-step
 * names resolve against the array registry at module load (unknown name
 * throws — no drift), the resident enumeration derives from the chain
 * data (resident-data.ts), and the block bodies are static prose
 * (verbatim shapes + family names) whose tool names stay registry-backed
 * via the chain-step guard plus the pin suite — not a per-literal
 * The `Hint: DO NOT use <tool>; use 1) …` copy stays static explicit: the
 * DO-NOT subject names the exact native trigger instruction (write /
 * edit / ast_edit / read / grep / glob / bash / lsp / CLI-locate token —
 * never a generic class), chain steps are numbered (`1) … 2) …`, no `→`
 * symbol — its dual meaning, trigger mapping vs step connector, is
 * removed), adapter annotations keep the recommending source
 * (hint-tool-context compliant suppression — a promoted tool used
 * correctly attaches nothing).
 *
 * The promoted tool→scenario extension table (PROMOTED_TOOL_MAP) is
 * DELETED (hints-structure-simplify): the display function judges
 * compliance inline — a used tool matching its scenario's inline set
 * (both serena surface forms + jcodemunch names, derived from the
…
 * zero third-party vocabulary; native platform rules always take
 * priority. Tools omitted from the arrays have no scenario coverage
 * (fail-open).
 *
 * @module
 */

import type { HintDisplayFn, ScenarioHintBlock, ScenarioId } from '@ai-atomic-workflow/platform-hooks-sdk';

/** Serena tool names (both surface forms) — write class. */
export const SERENA_WRITE_TOOLS = [
  'replace_content',
  'replace_in_files',
  'replace_symbol_body',
  'rename_symbol',
  'insert_before_symbol',
  'insert_after_symbol',
  'create_text_file',
  'safe_delete_symbol',
] as const;

/** Serena tool names (both surface forms) — verify class (diagnostics-backed evidence). */
export const SERENA_VERIFY_TOOLS = ['get_diagnostics_for_file'] as const;

/** Indexed diagnostic tool names — verify class (evidence over the prior write). */
export const JCM_VERIFY_TOOLS = ['find_dead_code', 'get_untested_symbols', 'check_references'] as const;

/** Serena tool names (both surface forms) — read class (symbol/FS reads, LSP + config surfaces). State-changing setup tools (activate_project / onboarding / open_dashboard) are NOT reads — excluded, no scenario coverage. find_implementations stays in the query-plane find class (single home, no double enumeration). */
export const SERENA_READ_TOOLS = [
  'get_current_config',
  'find_symbol',
  'find_declaration',
  'find_referencing_symbols',
  'get_symbols_overview',
  'read_file',
  'search_for_pattern',
  'find_file',
  'list_dir',
] as const;

/** Indexed query-plane tool names — find class (locate/query/impact). Repo-structure reads (get_repo_outline / get_file_tree) live in the read class — their source semantics are repo-structure reads, not locating. The relationships/impact trio (get_changed_symbols / get_symbol_importance / get_hotspots) lives here too — their source semantics are query-plane impact analysis (single home with the resident relationships group). */
export const JCM_QUERY_TOOLS = [
  'search_symbols',
  'search_text',
  'find_references',
  'find_importers',
  'search_ast',
  'search_columns',
  'find_similar_symbols',
  'find_implementations',
  'get_blast_radius',
  'get_impact_preview',
  'get_call_hierarchy',
  'get_class_hierarchy',
  'get_dependency_graph',
  'get_dependency_cycles',
  'get_coupling_metrics',
  'get_related_symbols',
  'get_endpoint_impact',
  'suggest_queries',
  'resolve_repo',
  'plan_turn',
  'winnow_symbols',
  'get_changed_symbols',
  'get_symbol_importance',
  'get_hotspots',
] as const;

/** Indexed content-read tool names — read class (content + repo-structure reads). */
export const JCM_READ_TOOLS = [
  'get_file_outline',
  'get_symbol_source',
  'get_context_bundle',
  'get_file_content',
  'get_ranked_context',
  'get_repo_map',
  'get_repo_outline',
  'get_file_tree',
  'digest',
  'get_session_context',
] as const;

/** Write-class index-registration obligations (jcodemunch-resident-hints) — single home for the two obligation names (register_edit / index_file) referenced by the write hint body and the jcodemunch resident guidance. */
export const WRITE_INDEX_OBLIGATION_TOOLS = ['register_edit', 'index_file'] as const;

/**
 * Every array-backed bare tool name — the single-name registry the
 * chain-step and resident-guidance derivations resolve against
 * (drift-proof: an unknown name throws at module load). Static
 * membership table built from the tool-name arrays (single source).
 * Block bodies are static prose (verbatim shapes) — their tool names
 * stay registry-backed by the pin suite, not by this table.
 */
export const PROMOTED_TOOL_NAMES: Readonly<Record<string, true>> = Object.fromEntries(
  [
    ...SERENA_WRITE_TOOLS,
    ...SERENA_VERIFY_TOOLS,
    ...JCM_VERIFY_TOOLS,
    ...SERENA_READ_TOOLS,
    ...JCM_QUERY_TOOLS,
    ...JCM_READ_TOOLS,
    ...WRITE_INDEX_OBLIGATION_TOOLS,
  ].map((name) => [name, true]),
) as Record<string, true>;

/**
 * Resolve a bare tool name against the array registry — the single
 * representation gate: a name not backed by a tool-name array is a
 * programming error (fails loud at module load, never a silent drift).
 */
export function resolveToolName(name: string): string {
  if (PROMOTED_TOOL_NAMES[name] !== true) {
    throw new Error(`Unknown promoted tool name in hint copy: ${name}`);
  }
  return name;
}

/** One hint-block segment — static prose (DO-NOT subject + unique numbered chain with verbatim shapes). */
type HintSegment = { readonly prose: string };

/** Build a scenario block body from ordered prose segments (DO-NOT form — hints-dont-use-format). */
function hintBodyOf(segments: readonly HintSegment[]): string {
  return `Hint: ${segments.map((segment) => segment.prose).join('; ')}`;
}

/**
 * Tool-name arrays grouped by scenario — the consumer's promoted tool data (single source: feeds the inline display sets and the resident derivation). Memory tools (write_memory / edit_memory / delete_memory / rename_memory / read_memory / list_memories) and the remaining index-mutation tools (index_folder / embed_repo / summarize_repo / invalidate_cache / import_runtime_signal) are intentionally omitted — no scenario coverage (fail-open); `register_edit` IS mapped (write: the index-registration obligation is part of the write scenario) and `index_file` IS mapped (write: the source-policy post-edit index freshness obligation, jcodemunch-resident-hints). */
export const SCENARIO_TOOL_NAMES: Readonly<Record<ScenarioId, readonly string[]>> = {
  find: JCM_QUERY_TOOLS.map((name) => `mcp__jcodemunch_${name}`),
  read: [
    ...JCM_READ_TOOLS.map((name) => `mcp__jcodemunch_${name}`),
    ...SERENA_READ_TOOLS.map((name) => `mcp__serena_${name}`),
    ...SERENA_READ_TOOLS.map((name) => `serena_${name}`),
  ],
  write: [
    ...SERENA_WRITE_TOOLS.map((name) => `mcp__serena_${name}`),
    ...WRITE_INDEX_OBLIGATION_TOOLS.map((name) => `mcp__jcodemunch_${name}`),
    ...SERENA_WRITE_TOOLS.map((name) => `serena_${name}`),
  ],
  verify: [
    ...SERENA_VERIFY_TOOLS.map((name) => `mcp__serena_${name}`),
    ...JCM_VERIFY_TOOLS.map((name) => `mcp__jcodemunch_${name}`),
    ...SERENA_VERIFY_TOOLS.map((name) => `serena_${name}`),
  ],
  run: [],
};

/**
 * Native-tool-keyed unique operation chains (prompt-native-tool-chains) —
 * the reverse map consumed by the resident enumeration and the chain-step
 * guard (drift-proof: every step name resolves against the promoted
 * registry at module load). `trigger` = the common native tool whose
 * appearance fires the hint (native tools are not in the promoted
 * registry — plain labels, the platform instruction names); `steps` = the
 * unique definite recommended operations in requirement-fixed order
 * (jcm first → serena → jcm when the workflow requires it), name-level.
 * The block bodies render the same chains as static prose in the DO-NOT
 * form (`DO NOT use <trigger>; use 1) …`) with verbatim parameter shapes
 * from the `.refs` tool definitions (kept in sync by the pin suite).
 */
export const SCENARIO_CHAINS: Readonly<
  Record<ScenarioId, { readonly trigger: string; readonly steps: readonly string[] }>
> = {
  find: { trigger: 'grep/glob', steps: ['search_text', 'search_for_pattern'] },
  read: {
    trigger: 'read',
    steps: ['get_file_outline', 'get_symbol_source', 'get_context_bundle', 'get_file_content'],
  },
  write: { trigger: 'write/edit', steps: ['get_blast_radius', 'replace_content', 'register_edit'] },
  verify: {
    trigger: 'bash',
    steps: ['get_diagnostics_for_file', 'find_dead_code', 'get_untested_symbols', 'check_references'],
  },
  run: { trigger: 'bash', steps: [] },
};

// Module-load guard — every chain step name is array-backed (no drift).
for (const { steps } of Object.values(SCENARIO_CHAINS)) {
  for (const step of steps) resolveToolName(step);
}

/**
 * Scenario hint blocks — one per closed-set scenario, interface-bound.
 * Body-only posture: no title field, one terminology across blocks.
 * Bodies are native-tool-keyed (prompt-native-tool-chains +
 * hints-dont-use-format): each block leads with the explicit
 * `DO NOT use <tool>; use 1) …` subject naming the exact native trigger
 * instruction (never a generic class), chain steps numbered (no `→`
 * symbol — its dual meaning is removed), verbatim parameter shapes
 * extracted from the `.refs` tool definitions (no placeholders, no
 * invented params); never parallel alternative samples for the same
 * native tool. Bodies are static prose; the chain-step names stay
 * registry-backed via the module-load guard on SCENARIO_CHAINS plus the
 * pin suite (not a per-literal derivation). The promoted tool-name
 * arrays (`SCENARIO_TOOL_NAMES`) and the consumer `HintDisplayFn`
 * inline sets stay the single compliance-judgment source.
 */
export const SCENARIO_HINT_BLOCKS: readonly ScenarioHintBlock[] = [
  {
    id: 'find',
    body: hintBodyOf([
      {
        prose:
          'DO NOT use grep/glob; use 1) search_text {repo: "owner/name", query: "TODO|FIXME", is_regex: True, context_lines: 2} (jcm, query plane: search_symbols / find_references / find_importers) 2) search_for_pattern {substring_pattern: "parse_config", paths_include_glob: "src/**/*.ts"} (serena, ground truth)',
      },
      {
        prose:
          'DO NOT use lsp; use 1) search_symbols {repo: "owner/name", query: "parse config", kind: "function"} (jcm) 2) find_symbol {name_path_pattern: "parse_config", depth: 0} (serena, LSP truth)',
      },
      {
        prose:
          'DO NOT use find / ls / fd / rg / ag / tree; use 1) get_file_tree {repo: "owner/name", path_prefix: "src"} (jcm) 2) find_file {file_mask: "*.ts", relative_path: "src"} (serena)',
      },
      { prose: 'out-of-project: platform-native locate' },
    ]),
  },
  {
    id: 'read',
    body: hintBodyOf([
      {
        prose:
          'DO NOT use read; use 1) get_file_outline {repo: "owner/name", file_path: "src/app.py"} (jcm, outline first) 2) get_symbol_source {repo: "owner/name", symbol_id: "src/app.py::parse_config#function"} (jcm, symbols) 3) get_context_bundle {repo: "owner/name", symbol_id: "src/app.py::Loader#class"} / get_file_content {repo: "owner/name", file_path: "src/app.py", start_line: 10, end_line: 20} / read_file {relative_path: "src/foo.ts", start_line: 0, end_line: None, max_answer_chars: -1} (content read — jcm indexed / serena non-indexed ground truth)',
      },
    ]),
  },
  {
    id: 'write',
    body: hintBodyOf([
      {
        prose:
          'DO NOT use write/edit; use 1) get_blast_radius {repo: "owner/name", symbol: "parse_config", depth: 1} (jcm, consult first: find_references / search_text / get_symbol_source / get_file_outline) 2) replace_content {relative_path: "src/foo.ts", needle: "...", repl: "...", mode: "literal"} (serena, sole mutation engine) 3) register_edit {repo: "owner/name", file_paths: ["src/foo.ts"]} (jcm, while index in use; n/a if not indexed or jcodemunch not mounted); verify after write (get_diagnostics_for_file); index_file after editing (freshness)',
      },
      {
        prose:
          'DO NOT use ast_edit; use 1) get_blast_radius {repo: "owner/name", symbol: "parse_config", depth: 1} (jcm, consult first) 2) replace_symbol_body / rename_symbol (serena) 3) register_edit (jcm); verify after write; index_file after editing',
      },
    ]),
  },
  {
    id: 'verify',
    body: hintBodyOf([
      {
        prose:
          'DO NOT use bash (bare test run); use 1) get_diagnostics_for_file {relative_path: "src/foo.ts"} (serena, evidence) 2) check_references {repo: "owner/name", identifier: "parse_config"} (jcm, diagnostics: find_dead_code / get_untested_symbols / check_references); rerun with the rtk prefix',
      },
    ]),
  },
  {
    id: 'run',
    body: hintBodyOf([
      {
        prose:
          'DO NOT use bash (raw); use rtk prefix (unique operation, e.g. rtk yarn test); serena execute_shell_command not recommended (duplicate face)',
      },
      {
        prose:
          'use npm/yarn/pnpm/cargo/go/pytest/jest/vitest/rspec/mvn/gradle/git/docker/kubectl/uv/pip/brew/jcodemunch for SAFE command examples',
      },
      { prose: 'raw debugging bypasses the wrapper' },
      { prose: 'post-run index registration while the index is in use.' },
    ]),
  },
];

/** Scenario id → block body lookup — one keyed table (no switch, no linear find). */
const BLOCK_BODY_BY_ID: Readonly<Record<ScenarioId, string>> = Object.fromEntries(
  SCENARIO_HINT_BLOCKS.map((block) => [block.id, block.body]),
) as Record<ScenarioId, string>;

/** Display-decision middleware — returns the block body for the classified scenario, or `null` when the caller already used a promoted tool (compliant — silent). */
export const hintDisplay: HintDisplayFn = (ctx) => {
  if (ctx.scenario === undefined || ctx.compliant === true) return null;
  if (ctx.usedTool !== undefined && SCENARIO_TOOL_NAMES[ctx.scenario].includes(ctx.usedTool)) return null;
  return BLOCK_BODY_BY_ID[ctx.scenario] ?? null;
};

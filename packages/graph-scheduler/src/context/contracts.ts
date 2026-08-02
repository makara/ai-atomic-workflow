/**
 * Graph contract checks — dispatch, approval routing, guard hygiene,
 * entry-skill bidirectional alignment.
 *
 * Extracted from the retired CLI validate command so the checks can run in
 * the runtime graph-loading path — no bin coupling. Pure functions
 * (validateGraphContracts) plus fs-backed entry-skill alignment
 * (validateEntrySkillContracts) shared by load-time mounting and tests.
 *
 * @module
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileChannelCoveredBy, isGlobShape, parseContextContract, resolveChannels } from './resolve-channels.js';

/** safe string coercion — never String(object) (schema-validated in production path) */
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Transitive closure of upstream phase ids (stack traversal over dependsOn).
 * Used by the redundant-dependency check. Traversal order irrelevant — reachability only.
 */
function upstreamClosure(id: string, byId: Map<string, Record<string, unknown>>): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    const phase = byId.get(cur);
    if (!phase) continue;
    for (const dep of (phase.dependsOn ?? []) as string[]) {
      if (dep && !seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  seen.delete(id);
  return seen;
}

/** sibling-output-existence guard pattern: e.g. "no <node> output present" */
const SIBLING_OUTPUT_EXISTENCE_RE = /no\s+[\w-]+\s+output\s+present/i;
/** hardcoded runtime output path in guards */
const HARDCODED_OUTPUT_PATH_RE = /\.taskflow\/outputs\//;
/** injection claim patterns in task text — 'injected via <id>' / 'injected via node:<id>' */
const INJECTION_CLAIM_RE = /injected\s+via\s+(?:node:)?([\w-]+)/gi;
/** read-output claim pattern in task text — 'Read <id> output' */
const READ_OUTPUT_CLAIM_RE = /Read\s+([\w-]+)\s+output/gi;
/** 'injected via dependsOn …' wording refers to the implicit DAG mechanism, not a node claim */
const IMPLICIT_MECHANISM_WORDS = new Set(['dependsOn', 'implicit', 'upstream']);

/** contract checks beyond TaskflowSchema — dispatch, routing, guard hygiene */
export function validateGraphContracts(
  graph: Record<string, unknown>,
  filePath: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
  const byId = new Map(phases.map((p) => [str(p.id, ''), p]));

  for (const phase of phases) {
    const id = str(phase.id, '?');
    const type = str(phase.type, '');
    const deps = (phase.dependsOn ?? []) as string[];
    const prefix = `${filePath}: phases.${id}`;

    // 2.0 — enabled type set: unregistered type fails at load via
    // toTaskflowGraph (resolvePhaseHandler → UnknownPhaseTypeError →
    // GraphDefinitionError). No separate static gate — one enforcement path.

    // Field-type contract enforced by PhaseSchema superRefine only
    // (single enforcement point — schema rejects before this layer runs).

    // declared-inputs contract: task text input references must be covered
    // by dependsOn (implicit) or node: channels (explicit). Hardcoded output paths
    // error (mirror of the when-guard check); undeclared injection claims warn.
    const taskText = str(phase.task, '');
    if (taskText && HARDCODED_OUTPUT_PATH_RE.test(taskText)) {
      errors.push(
        `${prefix} — task text hardcodes runtime output path '.taskflow/outputs/'; reference the upstream node output by nodeId name instead (declared inputs)`,
      );
    }
    const effectiveInputs = new Set<string>(deps);
    for (const c of (phase.channels ?? []) as string[]) {
      if (typeof c === 'string' && c.startsWith('node:')) effectiveInputs.add(c.slice('node:'.length));
    }
    if (taskText) {
      const claimed: string[] = [];
      for (const m of taskText.matchAll(INJECTION_CLAIM_RE)) claimed.push(m[1]);
      for (const m of taskText.matchAll(READ_OUTPUT_CLAIM_RE)) claimed.push(m[1]);
      for (const nodeId of claimed) {
        if (IMPLICIT_MECHANISM_WORDS.has(nodeId) || effectiveInputs.has(nodeId)) continue;
        // merge-at-load prefixes child node ids ('<parent>/<child>') while task text
        // keeps the bare child id — a claim is covered when it suffixes a declared input.
        const suffixCovered = [...effectiveInputs].some((id) => id.endsWith(`/${nodeId}`));
        if (suffixCovered) continue;
        warnings.push(
          `${prefix} — task text claims injection of '${nodeId}' not declared in dependsOn or node: channels; declare the channel or remove the claim (declared inputs)`,
        );
      }
    }

    // 2.2 — approval dependsOn converges on a single review node; routing targets explicit
    if (type === 'approval') {
      if (deps.length !== 1) {
        errors.push(
          `${prefix} — approval dependsOn must contain exactly the review-convergence node (found ${deps.length}: ${deps.join(', ') || '(none)'}). Writer phases are transitive deps of review — list review only.`,
        );
      }
      const actions = ((phase.routing as Record<string, unknown> | undefined)?.actions ?? []) as Array<
        Record<string, unknown>
      >;
      for (const action of actions) {
        const actionType = str(action.action, '');
        if ((actionType === 'retry' || actionType === 'jump') && !action.target) {
          warnings.push(
            actionType === 'jump'
              ? `${prefix} — routing action 'jump' (${str(action.label, '')}) lacks explicit target; snapshot.nodes runtime expansion applies (M2) — declare explicit target per atom-graph-spec §Approval Routing.`
              : `${prefix} — routing action 'retry' (${str(action.label, '')}) lacks explicit target; dependsOn[0] fallback is deprecated.`,
          );
        }
      }
      for (const evalRule of (phase.eval ?? []) as Array<Record<string, unknown>>) {
        const actionType = str(evalRule.action, '');
        if ((actionType === 'retry' || actionType === 'jump') && !evalRule.target) {
          warnings.push(
            actionType === 'jump'
              ? `${prefix} — eval condition action 'jump' lacks explicit target; snapshot.nodes runtime expansion applies (M2) — declare explicit target per atom-graph-spec §Approval Routing.`
              : `${prefix} — eval condition action 'retry' lacks explicit target; dependsOn[0] fallback is deprecated.`,
          );
        }
        // Auto-rework hygiene — atom-graph-spec §Auto-Rework (eval) Rules
        const whenText = str(evalRule.when, '');
        if (actionType === 'retry' && whenText && !/retryAttempt/i.test(whenText)) {
          warnings.push(
            `${prefix} — eval condition is unbounded (no retryAttempt bound); auto-rework risks an infinite loop — add 'AND retryAttempt < N' per atom-graph-spec §Auto-Rework (eval) Rules.`,
          );
        }
        if (actionType === 'retry' && evalRule.target) {
          const targetId = str(evalRule.target, '');
          const depends = (phase.dependsOn ?? []) as string[];
          const targetPhase = byId.get(targetId);
          // Reviewer = code-review dispatch or review-named node. Retrying it
          // re-runs unchanged artifacts — same verdict, wasted cycle. Integrity
          // gates (scope-confirm/spec-scope style writers) are not reviewers.
          const isReviewNode =
            targetPhase !== undefined &&
            (str((targetPhase as Record<string, unknown>).skill, '') === 'code-review' || targetId.includes('review'));
          if (isReviewNode && depends.includes(targetId)) {
            warnings.push(
              `${prefix} — eval retry targets reviewer node '${targetId}' (the approval's direct dependency); re-running the reviewer over unchanged artifacts reproduces the same verdict — target the writer node instead per atom-graph-spec §Auto-Rework (eval) Rules.`,
            );
          }
        }
      }
      // target existence: every routing/eval target must resolve
      // in the flattened graph. Pre-flatten graphs may reference flow phase ids
      // (remapped to the flow's entry node at flatten) or flattened-style
      // '<flow>/<child>' ids — both valid; anything else unresolved is an error,
      // never a silent no-op jump.
      const flowIds = new Set(phases.filter((p) => str(p.type, '') === 'flow').map((p) => str(p.id, '')));
      const targetResolvable = (t: string): boolean =>
        byId.has(t) || flowIds.has(t) || [...flowIds].some((f) => t.startsWith(`${f}/`));
      for (const action of actions) {
        const actionTarget = str(action.target, '');
        if (actionTarget && !targetResolvable(actionTarget)) {
          errors.push(
            `${prefix} — routing action '${str(action.label, '')}' targets missing phase '${actionTarget}'; declare an existing phase id (flow ids remap to the flow's flattened entry)`,
          );
        }
      }
      for (const evalRule of (phase.eval ?? []) as Array<Record<string, unknown>>) {
        const evalTarget = str(evalRule.target, '');
        if (evalTarget && !targetResolvable(evalTarget)) {
          errors.push(
            `${prefix} — eval condition targets missing phase '${evalTarget}'; declare an existing phase id (flow ids remap to the flow's flattened entry)`,
          );
        }
      }
    }

    // 2.2b — redundant transitive dependencies rejected for ALL phases (graph-scheduling §DependsOn #3)
    for (let i = 0; i < deps.length; i++) {
      for (let j = 0; j < deps.length; j++) {
        if (i === j) continue;
        const a = deps[i];
        const b = deps[j];
        if (upstreamClosure(a, byId).has(b)) {
          errors.push(
            `${prefix} — redundant transitive dependency: '${a}' depends on '${b}' (directly or transitively); declare only leaf deps per §DependsOn Rules #3.`,
          );
        }
      }
    }

    // 2.3 — when guards reference observable upstream fields only
    const when = str(phase.when, '');
    if (when) {
      if (HARDCODED_OUTPUT_PATH_RE.test(when)) {
        errors.push(
          `${prefix} — when guard hardcodes runtime output path '.taskflow/outputs/'; reference the upstream node output instead (e.g. '<nodeId> output shows …').`,
        );
      }
      if (SIBLING_OUTPUT_EXISTENCE_RE.test(when)) {
        errors.push(
          `${prefix} — when guard depends on sibling output existence ('no … output present'); guards must reference observable fields of direct upstream outputs.`,
        );
      }
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// D6 — entry skill contract alignment (bidirectional channel validation)
// ---------------------------------------------------------------------------

/** parsed entry skill contract — frontmatter name + Context Requirements three subsections */
export interface IEntrySkillContract {
  readonly name: string;
  readonly upstream: string[];
  readonly references: string[];
  readonly files: string[];
  readonly contractErrors: string[];
  readonly path: string;
}

/** extract frontmatter `name:` field from SKILL.md content */
function parseFrontmatterName(content: string): string | null {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!m) return null;
  const nameMatch = /^name:\s*(.+)$/m.exec(m[1]);
  return nameMatch ? nameMatch[1].trim() : null;
}

/**
 * Entry skill contract alignment — bidirectional:
 * 1. Contract machine-parseability: placeholder entries → error; contract errors reported.
 * 2. Orphan detection: entry skill declaring graph-callable requirements but dispatched by zero graph phases → error.
 *    Single-graph loads MUST pass checkOrphans: false — orphanhood is a repo-wide property.
 * 3. Forward coverage: every contract Reference skill / Files entry must appear in a dispatching phase's channels → error.
 * 4. Reverse checks per phase: unresolvable channel → error (phantom bare name → warning); `node:` target must exist in graph → error;
 *    dependsOn-duplicate channel → warning (redundant declaration — repeal of silent-ignore rule); bare cross-level name → warning suggesting `node:` prefix.
 */
export async function validateEntrySkillContracts(
  graphs: ReadonlyArray<{ filePath: string; graph: Record<string, unknown> }>,
  skillsDir: string,
  opts?: { checkOrphans?: boolean },
): Promise<{ errors: string[]; warnings: string[] }> {
  const checkOrphans = opts?.checkOrphans ?? true;
  const errors: string[] = [];
  const warnings: string[] = [];

  const dispatched = new Set<string>();
  for (const { graph } of graphs) {
    for (const phase of (graph.phases ?? []) as Array<Record<string, unknown>>) {
      if (typeof phase.skill === 'string') dispatched.add(phase.skill);
    }
  }

  let skillDirs: string[];
  try {
    skillDirs = (await readdir(skillsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    warnings.push(`${skillsDir}: skills directory unreadable — D6 contract checks skipped silently (permissions?)`);
    return { errors, warnings };
  }

  const skills: IEntrySkillContract[] = [];
  for (const dir of skillDirs) {
    const path = join(skillsDir, dir, 'SKILL.md');
    let content: string;
    try {
      content = await readFile(path, 'utf-8');
    } catch {
      continue;
    }
    const contract = parseContextContract(content);
    if (contract.upstream.length === 0 && contract.references.length === 0 && contract.files.length === 0) {
      continue; // not graph-callable per contract — skip
    }
    skills.push({
      name: parseFrontmatterName(content) ?? dir,
      upstream: contract.upstream,
      references: contract.references,
      files: contract.files,
      contractErrors: contract.errors,
      path,
    });
  }

  checkContractErrors(skills, errors);
  if (checkOrphans) detectOrphans(skills, dispatched, errors);

  for (const { filePath, graph } of graphs) {
    const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
    checkUpstreamCoverage(phases, skills, filePath, errors);
    checkPhaseChannels(phases, skills, filePath, errors, warnings);
  }

  return { errors, warnings };
}

/** 1 — contract parse errors (placeholders) for all graph-callable skills.
 *  Fence-aware parsing keeps doc examples inert — a surviving placeholder is a real
 *  contract defect, reported regardless of dispatch — no escape hatch. */
function checkContractErrors(skills: readonly IEntrySkillContract[], errors: string[]): void {
  for (const skill of skills) {
    for (const e of skill.contractErrors) {
      errors.push(`${skill.path}: ${e}`);
    }
  }
}

/** 2 — orphan detection (graph-callable but never dispatched).
 *  Fence-aware parsing keeps doc examples inert — every non-empty contract is
 *  judgeable; no contractErrors skip — no escape hatch. */
function detectOrphans(
  skills: readonly IEntrySkillContract[],
  dispatched: ReadonlySet<string>,
  errors: string[],
): void {
  for (const skill of skills) {
    if (!dispatched.has(skill.name)) {
      errors.push(
        `${skill.path}: orphan entry skill '${skill.name}' — declares graph-callable Context Requirements (upstream: ${skill.upstream.join(', ') || '(none)'}, references: ${skill.references.join(', ') || '(none)'}, files: ${skill.files.join(', ') || '(none)'}) but no graph phase dispatches it`,
      );
    }
  }
}

/**
 * 3a — upstream coverage at GRAPH level (union across dispatching phases).
 * Create/edit split paths share one contract — per-phase injection would
 * false-fail (e.g. atom-skill-writer declares scope-confirm + skill-select;
 * create path injects scope-confirm only). Declared upstreams are required
 * only when the node EXISTS in the graph.
 */
function checkUpstreamCoverage(
  phases: ReadonlyArray<Record<string, unknown>>,
  skills: readonly IEntrySkillContract[],
  filePath: string,
  errors: string[],
): void {
  const nodeIds = new Set(phases.map((p) => str(p.id, '')));
  const injectedBySkill = new Map<string, Set<string>>();
  for (const phase of phases) {
    // Agent AND main phases inject upstream context — conversion to main must
    // not empty the effective coverage set (spec: Validation covers main channels).
    const type = str(phase.type, '');
    if (type !== 'main' || typeof phase.skill !== 'string') continue;
    const effective = injectedBySkill.get(phase.skill) ?? new Set<string>();
    for (const dep of (phase.dependsOn ?? []) as string[]) effective.add(dep);
    for (const c of (phase.channels ?? []) as string[]) {
      if (typeof c === 'string') effective.add(c.replace(/^node:/, ''));
    }
    injectedBySkill.set(phase.skill, effective);
  }
  for (const skill of skills) {
    const effective = injectedBySkill.get(skill.name);
    if (!effective) continue; // orphan already reported
    const missing = skill.upstream.filter((u) => nodeIds.has(u) && !effective.has(u));
    for (const u of missing) {
      errors.push(
        `${filePath}: entry skill '${skill.name}' declares upstream '${u}' not injected by any dispatching phase (dependsOn or node: channel); contract mismatch`,
      );
    }
  }
}

/** 3b — per-phase forward (references/files ⊆ channels) + reverse (channel resolution) */
function checkPhaseChannels(
  phases: ReadonlyArray<Record<string, unknown>>,
  skills: readonly IEntrySkillContract[],
  filePath: string,
  errors: string[],
  warnings: string[],
): void {
  const nodeIds = new Set(phases.map((p) => str(p.id, '')));
  for (const phase of phases) {
    const type = str(phase.type, '');
    const skillName = str(phase.skill, '');
    // Channel validation covers main phases (agent type removed).
    // Other types (approval/flow) never carry channels.
    if (type !== 'main') continue;
    const prefix = `${filePath}: phases.${str(phase.id, '?')}`;
    const channels = (phase.channels ?? []) as string[];
    const dependsOn = (phase.dependsOn ?? []) as string[];

    if (!skillName) {
      // Contract-less phase — dual-track rule: every channels entry must be an
      // explicit skill:/node: prefix or a file glob; bare name → error.
      for (const c of channels) {
        if (c.startsWith('skill:') || c.startsWith('node:') || isGlobShape(c)) continue;
        errors.push(
          `${prefix} — channel "${c}" is a bare name; phase declares no entry skill contract — contract-less channels require an explicit skill:/node: prefix or a file glob`,
        );
      }
      continue;
    }

    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      // Skill not in package, or contract-less (review-type — contract graph-decided):
      // every channels entry must be an explicit skill:/node: prefix or a file glob; bare name → error.
      for (const c of channels) {
        if (c.startsWith('skill:') || c.startsWith('node:') || isGlobShape(c)) continue;
        errors.push(
          `${prefix} — channel "${c}" is a bare name; entry skill '${skillName}' has no machine-parseable contract (review-type — contract graph-decided); channels require an explicit skill:/node: prefix or a file glob`,
        );
      }
      continue;
    }

    checkForwardCoverage(skill, channels, prefix, errors);
    checkReverseResolution(skill, channels, dependsOn, nodeIds, prefix, errors, warnings);
  }
}

/** forward — contract references/files ⊆ channels (per-phase: deletion is never silent) */
function checkForwardCoverage(
  skill: IEntrySkillContract,
  channels: readonly string[],
  prefix: string,
  errors: string[],
): void {
  for (const ref of skill.references) {
    const covered = channels.some((c) => c === `skill:${ref}` || c === ref);
    if (!covered) {
      errors.push(
        `${prefix} — entry skill '${skill.name}' declares reference '${ref}' not declared in channels (missing → channel deletion is never silent; add "skill:${ref}")`,
      );
    }
  }
  for (const f of skill.files) {
    // Coverage matching delegates to resolve-channels' shared primitive —
    // forward and reverse observe identical path/glob semantics.
    const covered = channels.some((c) => fileChannelCoveredBy(c, f));
    if (!covered) {
      errors.push(
        `${prefix} — entry skill '${skill.name}' declares file '${f}' not covered by channels (missing → channel deletion is never silent; add a matching file glob)`,
      );
    }
  }
}

/** reverse — channel-level resolution via shared resolver + node: target existence */
function checkReverseResolution(
  skill: IEntrySkillContract,
  channels: readonly string[],
  dependsOn: readonly string[],
  nodeIds: ReadonlySet<string>,
  prefix: string,
  errors: string[],
  warnings: string[],
): void {
  const resolved = resolveChannels({
    channels,
    dependsOn,
    contract: { upstream: skill.upstream, references: skill.references, files: skill.files, errors: [] },
  });
  for (const e of resolved.errors) {
    // phantom bare name that IS a graph node → warning suggesting node: prefix; else hard error
    const bare = e.match(/unresolvable channel "([^"]+)"/)?.[1];
    if (bare && nodeIds.has(bare)) {
      warnings.push(
        `${prefix} — channel "${bare}" is a graph node outside dependsOn; use "node:${bare}" for explicit cross-level reference`,
      );
    } else {
      errors.push(`${prefix} — ${e}`);
    }
  }
  for (const w of resolved.warnings) {
    warnings.push(`${prefix} — ${w}`);
  }
  // `node:` target existence — cross-level target must exist in graph
  for (const c of channels) {
    if (c.startsWith('node:')) {
      const target = c.slice('node:'.length);
      if (!nodeIds.has(target)) {
        errors.push(`${prefix} — node: channel "${c}" targets missing phase '${target}'`);
      }
    }
  }
}

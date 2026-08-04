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
 * Load-time twin of the runtime reachability helpers — kept local because it
 * runs against the flattened graph (post-flatten validation).
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

    // target existence: every routing/jump target must resolve in the graph.
    // Pre-flatten graphs may reference flow phase ids (remapped at flatten) or
    // flattened-style '<flow>/<child>' ids — both valid; route ids (declared
    // `route:` values and flow ids as routes) resolve for approval targets.
    const flowIds = new Set(phases.filter((p) => str(p.type, '') === 'flow').map((p) => str(p.id, '')));
    const routeIds = new Set(
      phases
        .map((p) => str(p.route, ''))
        .filter((r) => r !== '')
        .concat([...flowIds]),
    );
    function targetResolvable(t: string): boolean {
      return byId.has(t) || routeIds.has(t) || [...flowIds].some((f) => t.startsWith(`${f}/`));
    }

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

    // 2.2 — approval: declared branch-route/retry targets resolvable; retry/jump
    // targets may be absent (AI dynamic options — no written actions needed)
    if (type === 'approval') {
      const actions = ((phase.routing as Record<string, unknown> | undefined)?.actions ?? []) as Array<
        Record<string, unknown>
      >;
      for (const action of actions) {
        const actionType = str(action.action, '');
        const target = str(action.target, '');
        if (target && !targetResolvable(target)) {
          errors.push(
            `${prefix} — routing action '${actionType}' (${str(action.label, '')}) targets missing phase/route '${target}'; declare an existing phase id or route id`,
          );
        }
        if ((actionType === 'retry' || actionType === 'jump') && !target) {
          warnings.push(
            `${prefix} — routing action '${actionType}' (${str(action.label, '')}) lacks explicit target; re-run target is resolved at runtime from context`,
          );
        }
      }
    }

    // 2.2 — gate jump hygiene (route-first): jumps are backward-only rework —
    // target must sit upstream of the gate; bounded by target retryCount
    if (type === 'gate') {
      const jumps = (phase.jumps ?? []) as Array<Record<string, unknown>>;
      const gateUpstream = upstreamClosure(str(phase.id, ''), byId);
      for (const jump of jumps) {
        const jumpTarget = str(jump.to, '');
        const whenText = str(jump.when, '');
        const targetPhase = byId.get(jumpTarget);
        // Jump semantics: the target sits upstream of the gate — routing back
        // re-executes the target + downstream (JUMP). Forward targets are a
        // graph-definition error (approval decides forward routing).
        const isUpstream = targetPhase !== undefined && gateUpstream.has(jumpTarget);
        if (!isUpstream && jumpTarget !== '') {
          errors.push(
            `${prefix} — gate jump targets '${jumpTarget}' which is NOT upstream of the gate; gates are backward-only rework nodes — forward routing is an approval branch-route decision`,
          );
        }
        if (isUpstream && whenText && !/retryCount/i.test(whenText)) {
          warnings.push(
            `${prefix} — jump is unbounded (no retryCount bound); auto-rework risks an infinite loop — add 'AND <target> retryCount < N' per atom-graph-spec §Auto-Rework (gate) Rules.`,
          );
        }
        if (isUpstream && targetPhase) {
          const depends = (phase.dependsOn ?? []) as string[];
          // Reviewer = code-review dispatch or review-named node. Jumping it
          // re-runs unchanged artifacts — same verdict, wasted cycle. Integrity
          // gates (scope-confirm/spec-scope style writers) are not reviewers.
          const isReviewNode = str(targetPhase.skill, '') === 'code-review' || jumpTarget.includes('review');
          if (isReviewNode && depends.includes(jumpTarget)) {
            warnings.push(
              `${prefix} — jump targets reviewer node '${jumpTarget}' (the gate's direct dependency); re-running the reviewer over unchanged artifacts reproduces the same verdict — target the writer node instead per atom-graph-spec §Auto-Rework (gate) Rules.`,
            );
          }
        }
      }
    }

    if (type === 'gate') {
      for (const jump of (phase.jumps ?? []) as Array<Record<string, unknown>>) {
        const jumpTarget = str(jump.to, '');
        if (jumpTarget && !targetResolvable(jumpTarget)) {
          errors.push(
            `${prefix} — gate jump targets missing phase '${jumpTarget}'; declare an existing phase id (flow ids remap to the flow's flattened entry)`,
          );
        }
      }
    }

    // 2.2b — redundant transitive dependencies rejected for ALL phases
    // (graph-scheduling §DependsOn #3). The gate exemption is removed —
    // judgment context declares via channels node: entries, never by padding
    // dependsOn with transitive nodes.
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

    // 2.3 — gate jump conditions reference observable declared-context fields
    // only. Scope = direct dependsOn ∪ channels node: targets ∪ jump targets
    // (the rework target's retryCount bound is part of the condition contract).
    if (type === 'gate') {
      const contextScope = new Set<string>(deps);
      for (const ch of (phase.channels ?? []) as string[]) {
        if (ch.startsWith('node:')) contextScope.add(ch.slice('node:'.length));
      }
      for (const jump of (phase.jumps ?? []) as Array<Record<string, unknown>>) {
        const jumpTarget = str(jump.to, '');
        if (jumpTarget) contextScope.add(jumpTarget);
        const jumpWhen = str(jump.when, '');
        if (jumpWhen) {
          if (HARDCODED_OUTPUT_PATH_RE.test(jumpWhen)) {
            errors.push(
              `${prefix} — gate jump condition hardcodes runtime output path '.taskflow/outputs/'; reference the upstream node output instead (e.g. '<nodeId> output shows …').`,
            );
          }
          if (SIBLING_OUTPUT_EXISTENCE_RE.test(jumpWhen)) {
            errors.push(
              `${prefix} — gate jump condition depends on sibling output existence ('no … output present'); conditions must reference observable fields of the declared judgment context (direct dependsOn ∪ channels node: targets ∪ jump targets).`,
            );
          }
          for (const id of byId.keys()) {
            const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const mentioned = new RegExp(`(?<![\\w/-])${esc}(?![\\w/-])`).test(jumpWhen);
            if (mentioned && !contextScope.has(id)) {
              errors.push(
                `${prefix} — gate jump condition references '${id}' which is outside the declared judgment context (direct dependsOn ∪ channels node: targets ∪ jump targets); declare it via channels: [node:${id}] or drop the reference`,
              );
            }
          }
        }
      }
    }

    // 2.3b — gate/approval channels are node:-only judgment context. The
    // schema enforces this per file; this post-flatten re-check catches
    // merged flow-input channels that bypassed the per-file schema pass
    // (flow channels propagate into entry children, which may be gates).
    if ((type === 'gate' || type === 'approval') && phase.channels !== undefined) {
      for (const entry of phase.channels as string[]) {
        if (!entry.startsWith('node:')) {
          errors.push(
            `${prefix} — '${type}' phase channels entries must be 'node:<id>' references (judgment context = node outputs); '${entry}' is not a node: entry`,
          );
        }
      }
    }

    // 2.4 — join:any is the branch-route convergence pattern: direct upstreams
    // must span at least two distinct routes (a single-route any-join has
    // nothing to converge and hides a deadlock-prone mistake).
    if (phase.join === 'any') {
      const upstreamRoutes = new Set(deps.map((d) => str(byId.get(d)?.route, '') || '__default__'));
      if (upstreamRoutes.size < 2) {
        errors.push(
          `${prefix} — join: any requires direct upstreams spanning at least 2 distinct routes (branch-route convergence); upstreams sit on: ${[...upstreamRoutes].join(', ')}`,
        );
      }
    }
  }

  // Route hygiene (route-first): a declared route unreferenced by any written
  // routing action has a soft activation path — only an AI-dynamic approval
  // recommendation can activate it (approval branchTo with a route id). That
  // is legal but fragile (a missed target silently leaves the route dormant),
  // so it surfaces as a warning: declare a routing action or delete the route.
  const routeIds = new Set(phases.map((p) => str(p.route, '')).filter((r) => r !== ''));
  const referencedRoutes = new Set<string>();
  for (const phase of phases) {
    if (str(phase.type, '') !== 'approval') continue;
    const actions = ((phase.routing as Record<string, unknown> | undefined)?.actions ?? []) as Array<
      Record<string, unknown>
    >;
    for (const action of actions) {
      if (str(action.action, '') === 'continue' && str(action.target, '') !== '') {
        referencedRoutes.add(str(action.target, ''));
      }
    }
  }
  for (const routeId of routeIds) {
    if (!referencedRoutes.has(routeId)) {
      warnings.push(
        `${filePath}: route '${routeId}' is declared but no written routing action targets it — activation depends on AI-dynamic judgment (soft path); declare a routing action or delete the route`,
      );
    }
  }

  // Run Mode — decided per activation by the built-in $run-mode-confirm
  // prologue node (args.mode or a question); graphs declare nothing. The
  // entry-topic heuristic was removed with the topic blocks themselves.

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
    // Channel validation covers main phases. Approval/gate channels are
    // node:-only judgment context — enforced by the schema superRefine and
    // re-checked post-flatten below (merged flow channels must not bypass it).
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
    runNodeIds: nodeIds,
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

/**
 * Graph contract checks — dispatch, approval routing, guard hygiene,
 * user-supplement layer existence validation.
 *
 * Pure functions (validateGraphContracts) plus config-layer existence
 * validation (validateProjectContext) shared by load-time mounting and
 * tests. The engine validates only machine-owned facts: graph YAML
 * declarations, channel shape, run scope. Skill `## Context Requirements`
 * contracts are agent-side knowledge — entry-skill alignment and orphan
 * detection run in estate-maintain's consistency gate, never here.
 *
 * @module
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  isConventionFile,
  isGlobShape,
  isWorkflowArtifactGlob,
  mergeChannelScopes,
  normFile,
  stripPrefix,
} from './resolve-channels.js';

/** safe string coercion — never String(object) (schema-validated in production path) */
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Judgment-domain node scope — ONE formula shared by the gate condition
 * check, task-text injection claims, and (via mergeChannelScopes) the
 * dispatch path: direct dependsOn outputs ∪ node: targets of the effective
 * channels (global channel = graph `context:` entries + phase `channels:`).
 */
function nodeScope(
  deps: readonly string[],
  graphContext: readonly string[] | undefined,
  phaseChannels: readonly string[] | undefined,
): Set<string> {
  const out = new Set(deps);
  const effective = mergeChannelScopes(undefined, graphContext, phaseChannels) ?? [];
  for (const c of effective) {
    if (typeof c === 'string' && c.startsWith('node:')) out.add(c.slice('node:'.length));
  }
  return out;
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

/** contract checks beyond WorkflowSchema — dispatch, routing, guard hygiene */
export function validateGraphContracts(
  graph: Record<string, unknown>,
  filePath: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
  const byId = new Map(phases.map((p) => [str(p.id, ''), p]));

  // Dependency-edge acyclicity — load-time loud failure (spec contract: cycles fail
  // loudly at load). The former topoLayers Kahn check was deleted as a dead
  // production export; this pass is its home (graph-schema-w6-close).
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, trail: string[]): void => {
    if (visiting.has(id)) {
      const cycle = [...trail.slice(trail.indexOf(id)), id].join(' → ');
      errors.push(`${filePath}: dependency cycle detected — ${cycle}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const phase = byId.get(id);
    for (const dep of (phase?.dependsOn ?? []) as string[]) visit(dep, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const p of phases) visit(str(p.id, ''), []);

  // Graph-level context (top-level `context:`) — the global channel's
  // graph layer, ambient scope inherited by every flattened phase. Entry
  // rules: explicit skill:/node: prefix or file-glob shape; bare names are
  // errors (no execution-skill contract exists at graph scope). node:
  // targets must exist in the flattened node set (run-scope membership is
  // enforced at dispatch; the static membership check catches dangling refs
  // at load).
  const graphContext = (graph.context ?? []) as string[];
  for (const c of graphContext) {
    if (typeof c !== 'string') {
      errors.push(`${filePath}: graph-level context entry must be a string — '${String(c)}'`);
      continue;
    }
    const prefixed = stripPrefix(c);
    if (prefixed) {
      if (prefixed.type === 'node') {
        if (!byId.has(prefixed.target)) {
          errors.push(
            `${filePath}: graph-level node: context entry "${c}" targets missing phase '${prefixed.target}' — graph-level entries resolve against the flattened node set`,
          );
        }
      }
      continue;
    }
    if (isConventionFile(c)) {
      // Convention files are platform-shipped implicit coverage — a graph-level
      // declaration is redundant (deduped by the layer merge), never an error.
      warnings.push(
        `${filePath}: graph-level context entry "${c}" — convention-layer file (implicit coverage); declaration is redundant and skipped at dispatch`,
      );
      continue;
    }
    if (isGlobShape(c)) {
      if (!isWorkflowArtifactGlob(c)) {
        errors.push(
          `${filePath}: graph-level context entry "${c}" is a file glob outside workflow runtime artifacts (.graph-scheduler/, .taskflow/) — four-layer channel model: project file globs belong in the user-supplement layer (config context:), conventions are platform-shipped`,
        );
      }
      continue;
    }
    errors.push(
      `${filePath}: graph-level context entry "${c}" is a bare name — graph-level entries require an explicit skill:/node: prefix or a file glob (no execution-skill contract exists at graph scope)`,
    );
  }

  // NOTE: graph inventory consistency is not checked in this pure pass — the
  // contract pass runs on the FLATTENED graph (flow phases replaced by
  // prefixed children), which would make flow inventory entries unresolvable.
  // Inventory validation (validateGraphInventory) runs per source graph inside
  // runContractsPass (graph-loader) — post-flatten timing, source-graph pairing.

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
    // toWorkflowGraph (resolvePhaseHandler → UnknownPhaseTypeError →
    // GraphDefinitionError). No separate static gate — one enforcement path.

    // Field-type contract enforced by PhaseSchema superRefine only
    // (single enforcement point — schema rejects before this layer runs).

    // Task-text content checks moved agent-side (estate-maintain consistency
    // gate) — the engine validates shapes only.

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
    // only. Scope = the judgment-domain formula (direct dependsOn ∪ node:
    // targets of graph context + phase channels). Jump targets are in scope
    // for their retryCount bound ONLY (snapshot data, always present) —
    // output-field references to a jump target require a channel declaration
    // (dispatch injects dependsOn + channels + global streams, never jump
    // targets). One formula shared with dispatch (nodeScope helper).
    if (type === 'gate') {
      const contextScope = nodeScope(deps, graphContext, phase.channels as readonly string[] | undefined);
      const jumpTargets = new Set(
        ((phase.jumps ?? []) as Array<Record<string, unknown>>).map((j) => str(j.to, '')).filter((t) => t !== ''),
      );
      for (const jump of (phase.jumps ?? []) as Array<Record<string, unknown>>) {
        const jumpWhen = str(jump.when, '');
        if (jumpWhen) {
          if (SIBLING_OUTPUT_EXISTENCE_RE.test(jumpWhen)) {
            errors.push(
              `${prefix} — gate jump condition depends on sibling output existence ('no … output present'); conditions must reference observable fields of the declared judgment context (direct dependsOn ∪ channels node: targets ∪ global-context node: streams).`,
            );
          }
          for (const id of byId.keys()) {
            const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const mentioned = new RegExp(`(?<![\\w/-])${esc}(?![\\w/-])`).test(jumpWhen);
            if (!mentioned) continue;
            if (contextScope.has(id)) continue;
            if (jumpTargets.has(id)) {
              // Jump targets are snapshot data (retryCount) — an output-field
              // reference would validate but never inject; require the bound.
              const boundMention = new RegExp(`(?<![\\w/-])${esc}\\s+retryCount`).test(jumpWhen);
              if (!boundMention) {
                errors.push(
                  `${prefix} — gate jump condition references jump target '${id}' beyond its retryCount bound; jump targets are in scope for their retryCount only — declare channels: [node:${id}] to read its output`,
                );
              }
              continue;
            }
            errors.push(
              `${prefix} — gate jump condition references '${id}' which is outside the declared judgment context (direct dependsOn ∪ channels node: targets ∪ global-context node: streams); declare it via channels: [node:${id}] or drop the reference`,
            );
          }
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

  // Run Mode — decided per activation at graph_start (args.mode); graphs
  // declare nothing. The entry-topic heuristic was removed with the topic
  // blocks themselves.

  return { errors, warnings };
}

/**
 * Graph inventory (top-level `inventory:`) — the node overview table.
 * Consistency with phases: every entry id must exist and type must match
 * the referenced phase declaration. Mismatches are warnings — the table is
 * user-maintained; loading never blocks (warning semantics per the
 * graph-inventory standard).
 *
 * Entry shape is { id, type, goal, constraints? } — the legacy `skill`
 * key is stripped at schema parse (no rejection, no migration hint) and is
 * NOT a check axis; the phase-level `skill` field remains the single
 * source. `goal`/`constraints` content is NEVER machine-validated (zero
 * validation axis — no bounds check, no case check; discipline lives at
 * generation time and review). The former `description` key is NOT
 * accepted (schema rejects stale entries — no backward compatibility).
 *
 * SHALL run per source graph (against its OWN phase declarations) inside
 * the post-flatten contract pass (runContractsPass — graph-loader): flow
 * entries resolve against the source graph's pre-flatten phase set.
 */
export function validateGraphInventory(graph: Record<string, unknown>, filePath: string): string[] {
  const warnings: string[] = [];
  const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
  const byId = new Map(phases.map((p) => [str(p.id, ''), p]));
  const inventory = (graph.inventory ?? []) as Array<Record<string, unknown>>;
  for (const entry of inventory) {
    const entryId = str(entry.id, '');
    const phase = byId.get(entryId);
    if (!phase) {
      warnings.push(`${filePath}: inventory entry "${entryId}" references no phase — entry id must exist in phases`);
      continue;
    }
    const entryType = str(entry.type, '');
    const phaseType = str(phase.type, '');
    if (entryType !== phaseType) {
      warnings.push(
        `${filePath}: inventory entry "${entryId}" type mismatch — declares "${entryType}", phase declares "${phaseType}"`,
      );
    }
    // No skill axis: entry shape is { id, type, goal, constraints? }; a
    // legacy `skill` key is stripped at schema parse and ignored here;
    // goal/constraints content is never checked.
  }
  return warnings;
}

/**
 * Registry description drift — description-to-topology consistency.
 *
 * Checks a registry entry's `description` against the graph's phase set:
 * a description mentioning a phase name that does not exist in the graph
 * surfaces a warning (relocated from the retired CLI validate to the
 * load-time contract pass). Warning-level, never blocks loading.
 *
 * Phase-name candidates are backtick-quoted identifiers in the
 * description (`\`phase-id\``) — the explicit reference form the retired
 * validate check and the delta-spec scenarios use. Bare kebab-case words
 * are NOT candidates: prose, skill names, and graph names are also
 * kebab-case, so matching them would fabricate drift on healthy graphs
 * (verified: 10/11 builtin graphs would otherwise report spurious
 * problems at every start). A candidate not in the phase set is a drift
 * warning (the description references a phase that does not exist in the
 * topology).
 *
 * Runs per source graph against its OWN phase declarations (same
 * scoping as validateGraphInventory).
 */
export function validateGraphRegistryDrift(
  graph: Record<string, unknown>,
  registryDescription: string | undefined,
  filePath: string,
): string[] {
  if (!registryDescription) return [];
  const warnings: string[] = [];
  const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
  const phaseIds = new Set(phases.map((p) => str(p.id, '')).filter((id) => id !== ''));
  if (phaseIds.size === 0) return warnings;

  // Extract candidate phase-name references: backtick-quoted identifiers
  // only (the explicit reference form — see the drift-candidate note).
  const candidates = new Set<string>();
  for (const m of registryDescription.matchAll(/`([a-zA-Z0-9-]+)`/g)) candidates.add(m[1]);

  for (const candidate of candidates) {
    if (!phaseIds.has(candidate)) {
      warnings.push(
        `${filePath}: registry description references "${candidate}" which is not a phase in this graph — description drift`,
      );
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// User-supplement layer existence validation (four-layer channel model)
// ---------------------------------------------------------------------------

const GLOB_RE_CACHE = new Map<string, RegExp>();

/** Convert a path glob (segment-aware) to a regex — `**` crosses directories. */
function globToRegex(glob: string): RegExp {
  const cached = GLOB_RE_CACHE.get(glob);
  if (cached) return cached;
  // `**` matches zero or more directory levels: a `**/` pair becomes an
  // optional directory run, a trailing `**` matches the remainder. The
  // placeholder keeps the segment join literal; substitution happens after.
  const pattern = normFile(glob)
    .split('/')
    .map((s) =>
      s
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]'),
    )
    .join('/')
    .replace(/\u0000\//g, '(?:.*\\/)?')
    .replace(/\u0000/g, '.*');
  const re = new RegExp(`^${pattern}$`);
  GLOB_RE_CACHE.set(glob, re);
  return re;
}

/**
 * Bounded recursive file listing — static-prefix walk with depth/file caps.
 * Existence validation never scans unbounded trees.
 */
function collectFiles(dir: string, maxDepth = 8, maxFiles = 2000): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number): void => {
    if (depth > maxDepth || out.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else out.push(p);
    }
  };
  walk(dir, 0);
  return out;
}

/** Does the glob match at least one existing file under cwd? Static prefix walked, remainder regex-matched. */
export function globMatchesAny(glob: string, cwd: string): boolean {
  const segs = normFile(glob)
    .split('/')
    .filter((s) => s.length > 0);
  let base = cwd;
  let i = 0;
  while (i < segs.length && !/[*?[]/.test(segs[i])) {
    base = join(base, segs[i]);
    i++;
  }
  if (!existsSync(base)) return false;
  if (i === segs.length) return true;
  const re = globToRegex(segs.slice(i).join('/'));
  return collectFiles(base).some((p) => re.test(p.substring(base.length + 1)));
}

/**
 * User-supplement layer (config.json `context:`) existence validation —
 * four-layer channel model: exact-file entry missing -> error (user promise);
 * glob zero-match -> warning
 * (empty set legal — lazy document creation). Conventions and graph channels
 * are NOT existence-checked (absence-tolerance + workflow artifacts).
 */
export function validateProjectContext(
  context: readonly string[] | undefined,
  cwd: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!context) return { errors, warnings };
  for (const entry of context) {
    if (typeof entry !== 'string') {
      errors.push(`project layer context entry must be a string — '${String(entry)}'`);
      continue;
    }
    // `node:`/`skill:` prefixed entries are stream/reference channels, not
    // files — never existence-checked.
    if (stripPrefix(entry)) continue;
    // Exact vs glob — wildcard presence decides, not path separators: a
    // slash-carrying entry without wildcards is an exact file, not a glob.
    if (/[*?[]/.test(entry)) {
      if (!globMatchesAny(entry, cwd)) {
        warnings.push(
          `project layer entry "${entry}" matches zero files — empty set legal (lazy document creation), channel degrades to empty + warning`,
        );
      }
    } else if (!existsSync(join(cwd, normFile(entry)))) {
      errors.push(`project layer entry "${entry}" declares exact file '${normFile(entry)}' that does not exist`);
    }
  }
  return { errors, warnings };
}

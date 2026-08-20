/**
 * Graph contract checks — dispatch, routing, guard hygiene,
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
import { isConventionFile, isGlobShape, isWorkflowArtifactGlob, normFile, stripPrefix } from './resolve-channels.js';

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

/** contract checks beyond WorkflowSchema — dispatch, guard hygiene */
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
        // Source-graph check (v2 — no flatten, no composition since
        // graph-subgraph-route-unify): a target must be a phase in this
        // graph — no subgraph-member (`composing/child`) resolution exists.
        const target = prefixed.target;
        if (!byId.has(target)) {
          errors.push(
            `${filePath}: graph-level node: context entry "${c}" targets missing phase '${prefixed.target}' — graph-level entries resolve against this graph's own phase set`,
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
  // contract pass runs per source graph (v2 — no flatten; composition is
  // compile-time subgraph assembly), so each graph's inventory validates
  // against its own phase declarations.
  // Inventory validation (validateGraphInventory) runs per source graph inside
  // runContractsPass (graph-loader) — source-graph pairing.

  for (const phase of phases) {
    const id = str(phase.id, '?');
    const deps = (phase.dependsOn ?? []) as string[];
    const prefix = `${filePath}: phases.${id}`;

    // Backtick-target machinery retired (graph-flow capability): rework/
    // branch targets are declared in the top-level `flow` block (labeled
    // edges — flow-defined condition vocabulary), never task-text quoting.
    // Flow-edge endpoint validation (compile-time) is the single machine
    // axis for target resolvability; no task-text target checks exist.

    // Redundant transitive dependencies rejected for ALL phases
    // (graph-scheduling §DependsOn #3). Judgment context declares via
    // channels node: entries, never by padding dependsOn with transitive
    // nodes.
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
  }

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
 * the contract pass (runContractsPass — graph-loader): inventory entries
 * resolve against the source graph's own phase set (composition is
 * compile-time subgraph assembly — no flatten rewrite exists).
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
 * Graph description drift — description-to-topology consistency.
 *
 * Checks the graph definition's top-level `description` (catalog single
 * source — registry entries carry no description) against the graph's own
 * phase set: a description mentioning a phase name that does not exist in
 * the graph surfaces a warning (relocated from the retired CLI validate to
 * the load-time contract pass). Warning-level, never blocks loading.
 */
/**
 * Drift-candidate extraction.
 *
 * Phase-name candidates are backtick-quoted identifiers in the
 * description (`\`phase-id\``) — the explicit reference form the retired
 * validate check and the delta-spec scenarios use. Bare kebab-case words
 * are NOT candidates in general: prose, skill names, and graph names are
 * also kebab-case, so matching them would fabricate drift on healthy
 * graphs (verified: 10/11 builtin graphs would otherwise report spurious
 * problems at every start).
 *
 * Safe bare-prose subset: a description word that EXACTLY equals a phase
 * id (full id or its last path segment) — case-normalized, word-boundary,
 * common-prose words excluded. This RECOGNIZES existing-phase mentions
 * (a graph's own prose naming its own phases passes clean) and never
 * fabricates drift on non-phase prose (skill names, graph names — the
 * engine reads zero prose and cannot distinguish a stale phase name from
 * a skill/graph name; see the delta scenario "Plain-prose phase mention
 * recognized"). Backtick-quoted references remain the explicit stale-name
 * detection surface.
 *
 * A candidate not in the phase set is a drift warning (the description
 * references a phase that does not exist in the topology).
 *
 * Runs per source graph against its OWN phase declarations (same
 * scoping as validateGraphInventory).
 */

/** Common prose words excluded from bare-prose matching — they are not phase references. */
const COMMON_BARE_WORDS = new Set([
  'graph',
  'phase',
  'node',
  'entry',
  'review',
  'accept',
  'main',
  'approval',
  'gate',
  'loop',
  'flow',
  'report',
  'scope',
  'adopt',
  'implement',
  'requirement',
  'run',
  'done',
  'pending',
  'active',
  'the',
  'and',
  'or',
]);

export function validateGraphDescriptionDrift(
  graph: Record<string, unknown>,
  description: string | undefined,
  filePath: string,
): string[] {
  if (!description) return [];
  const warnings: string[] = [];
  const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
  const phaseIds = new Set(phases.map((p) => str(p.id, '')).filter((id) => id !== ''));
  if (phaseIds.size === 0) return warnings;

  // Extract candidate phase-name references: backtick-quoted identifiers
  // (the explicit reference form — see the drift-candidate note) plus the
  // safe bare-prose subset (a description word exactly equal to a phase id
  // or its last path segment, common words excluded).
  const candidates = new Set<string>();
  for (const m of description.matchAll(/`([a-zA-Z0-9-]+)`/g)) candidates.add(m[1]);

  const bareWords = new Set<string>();
  for (const m of description.matchAll(/[a-zA-Z0-9][a-zA-Z0-9-]*/g)) {
    const w = m[0].toLowerCase();
    if (!COMMON_BARE_WORDS.has(w)) bareWords.add(w);
  }
  for (const id of phaseIds) {
    const lastSegment = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
    const idsToMatch = new Set([id.toLowerCase(), lastSegment.toLowerCase()]);
    for (const bare of bareWords) {
      if (idsToMatch.has(bare)) {
        candidates.add(id);
        break;
      }
    }
  }

  for (const candidate of candidates) {
    if (!phaseIds.has(candidate)) {
      warnings.push(
        `${filePath}: graph description references "${candidate}" which is not a phase in this graph — description drift`,
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

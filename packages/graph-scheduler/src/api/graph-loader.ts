/**
 * API Graph Loader — graph definition loading and adaptation.
 *
 * Loads graph definitions (registry-aware) fresh per call. Subgraph
 * composition is deleted (graph-subgraph-route-unify) — a graph loads
 * standalone; nested execution is the frontend-launched `template: router`
 * sibling run (router paths validate as registered graph names at load).
 *
 * Machine validation only: graph YAML contracts, channel shape, user-
 * supplement layer existence. Skill prose is never parsed here — entry-skill
 * alignment runs agent-side in estate-maintain's consistency gate.
 *
 * @module
 */

import { Effect } from 'effect';
import {
  validateGraphContracts,
  validateGraphDescriptionDrift,
  validateGraphInventory,
  validateProjectContext,
} from '../context/contracts.js';
import { FileSystem, FileSystemError } from '../filesystem.js';
import type { Workflow } from '../graph-definition.js';
import { loadGraphFromPath, probeGraph } from '../graph-definition.js';
import { checkFlowMermaidCompliance } from '../mermaid-compliance.js';
import { RegistryLoader } from '../registry-loader.js';
import type { GraphDefinitionError, RegistryLoadError, SchedulerError } from '../types.js';
import { FlowPhaseError } from '../types.js';

/**
 * Load-time contract pass — runs on the source graph after schema
 * validation, before any dispatch (no flatten, no composition — each graph
 * validates its own contracts). Machine-owned checks only:
 * graph YAML contract violations fail the load with GraphDefinitionError
 * (fail-fast — never deferred to dispatch); warnings are surfaced via
 * the problems stream and never block.
 */
function runContractsPass(
  tf: Workflow,
  filePath: string,
  graphName: string,
  sourceGraphs: ReadonlyArray<{ tf: Workflow; filePath: string }>,
  projectContext?: readonly string[],
): Effect.Effect<{ tf: Workflow; warnings: string[] }, GraphDefinitionError, never> {
  return Effect.gen(function* () {
    const contracts = validateGraphContracts(tf, filePath);
    const errors = [...contracts.errors];
    const warnings = [...contracts.warnings];

    // Graph inventory — validated per source graph against its OWN phase
    // declarations (no composition, no flatten — each graph's inventory
    // resolves against its own phase set). Runs inside the contract pass;
    // warnings join the contract-warning stream alongside all others.
    for (const source of sourceGraphs) {
      warnings.push(...validateGraphInventory(source.tf, source.filePath));
      // Graph description drift — each source graph's own top-level
      // description (catalog single source) is checked against its own
      // phase set (per source graph; flow subgraphs carry their own
      // descriptions).
      if (source.tf.description) {
        warnings.push(...validateGraphDescriptionDrift(source.tf, source.tf.description, source.filePath));
      }
    }

    // User-supplement layer existence validation — four-layer channel model: exact
    // file missing -> load error, glob zero-match -> warning. Runs against
    // the resolved config.json `context:` when the caller supplies it.
    if (projectContext) {
      const pc = validateProjectContext(projectContext, process.cwd());
      errors.push(...pc.errors);
      warnings.push(...pc.warnings);
    }

    if (errors.length > 0) {
      return yield* Effect.fail<GraphDefinitionError>({
        _tag: 'GraphDefinitionError',
        graphName,
        message: `Contract validation failed for ${graphName}`,
        violations: errors,
      });
    }
    return { tf, warnings };
  });
}

interface LoadedNamedGraph {
  readonly tf: Workflow;
  /** Path the graph was loaded from — for contract-pass reporting. */
  readonly filePath: string;
  /** Resolution source — project registry, builtin registry, or file-name fallback. */
  readonly resolvedFrom: 'project' | 'builtin' | 'fallback';
}

/**
 * Load a graph by name with unified resolution: project registry entry
 * (explicit path) first, workflow-directory search as fallback. Same
 * semantics for top-level graphs and flow subgraphs.
 */
function loadNamedGraph(
  name: string,
): Effect.Effect<LoadedNamedGraph, GraphDefinitionError | FileSystemError, FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    const resolvedPath = yield* Effect.either(
      Effect.gen(function* () {
        const registryLoader = yield* RegistryLoader;
        return yield* registryLoader.resolveGraph(name);
      }),
    );
    if (resolvedPath._tag === 'Right') {
      const { path, source } = resolvedPath.right;
      return { tf: yield* loadGraphFromPath(path, name), filePath: path, resolvedFrom: source };
    }
    // Fallback: schema probe — suffix-free, declared-name identity
    // (registry miss → any workflow YAML whose declared name matches).
    const probed = yield* probeGraph(name);
    return { tf: probed.wf, filePath: probed.filePath, resolvedFrom: 'fallback' };
  });
}

/** True when a FileSystemError wraps an ENOENT — missing file, not a real I/O fault. */
function isFileNotFound(err: unknown): boolean {
  if (!(err instanceof FileSystemError)) return false;
  const cause = err.cause;
  if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return true;
  return err.message.includes('ENOENT');
}

export interface GraphLoadMeta {
  /** Resolution source of the top-level graph — project | builtin | fallback. */
  readonly resolvedFrom: 'project' | 'builtin' | 'fallback';
  /** Absolute path the top-level graph file was loaded from. */
  readonly resolvedPath: string;
  /** Graph top-level description (purpose-focused free text) — undefined when absent. */
  readonly description?: string;
  /** Load-time machine warnings — inventory consistency, description drift, project context. Empty when clean. */
  readonly problems: string[];
}

/** Loaded graph bundle — validated workflow + load metadata. */
export interface LoadedGraphBundle {
  readonly tf: Workflow;
  readonly meta: GraphLoadMeta;
}

export function loadGraphWithRegistry(
  graphName: string,
  projectContext?: readonly string[],
): Effect.Effect<LoadedGraphBundle, SchedulerError | RegistryLoadError, FileSystem | RegistryLoader> {
  return Effect.gen(function* () {
    const loaded = yield* loadNamedGraph(graphName);

    // Router template path validation (graph-router-template, extended by
    // graph-subgraph-route-unify) — `template_args.paths` entries are graph
    // names (the ONLY path form: paths are graphs — subgraph composition is
    // deleted, so the router is the sole nested-execution declaration). Each
    // must resolve via the unified graph-name resolution. Router paths are
    // NOT composed — they are launched as sibling runs at dispatch — but a
    // broken candidate must fail at load, never at dispatch.
    const routerRefs: Array<{ phaseId: string; path: string }> = [];
    for (const phase of loaded.tf.phases) {
      if (phase.template === 'router' && phase.template_args !== undefined && 'paths' in phase.template_args) {
        for (const p of phase.template_args.paths ?? []) {
          routerRefs.push({ phaseId: phase.id, path: p });
        }
      }
      // Loop template target validation is removed — the loop template does
      // not exist (loop/rework semantics are flow self-edges, graph-flow
      // capability); router paths are the only template graph references.
    }
    const refs = [...routerRefs];
    for (const { phaseId, path } of refs) {
      const resolved = yield* Effect.either(loadNamedGraph(path));
      if (resolved._tag === 'Right') continue;
      if (isFileNotFound(resolved.left)) {
        yield* Effect.fail(
          new FlowPhaseError(
            path,
            'GRAPH_NOT_FOUND',
            `${phaseId} template target '${path}' (phase '${phaseId}') not found in registry or workflow dirs — template targets must be registered graph names`,
          ),
        );
      }
      yield* Effect.fail(resolved.left);
    }

    // Contract checks run per source graph (v2 — no flatten; no composition
    // since graph-subgraph-route-unify). Errors fail fast, warnings surface.
    const sourceGraphs = [{ tf: loaded.tf, filePath: loaded.filePath }];
    const result = yield* runContractsPass(loaded.tf, loaded.filePath, graphName, sourceGraphs, projectContext);

    // Mermaid-format compliance (graph-flow compliance axis): project graphs
    // are checked at load time with the real mermaid parser; a non-conformant
    // flow block surfaces as a load-time problem (never a load failure — runs
    // are not blocked; the frontend sees it via graph_assets `problems`).
    // Builtin graphs skip the runtime check — the suite regression test
    // (tests/unit/mermaid-compliance.test.ts) covers them with the same
    // parser. Fallback-resolved graphs (project-dir YAML, registry miss) are
    // user-authored too — they get the check (resolvedFrom !== 'builtin').
    const warnings = [...result.warnings];
    if (loaded.resolvedFrom !== 'builtin' && result.tf.flow !== undefined && result.tf.flow.length > 0) {
      const complianceProblem = yield* Effect.promise(() => checkFlowMermaidCompliance(result.tf.flow));
      if (complianceProblem !== null) warnings.push(complianceProblem);
    }

    return {
      tf: result.tf,
      meta: {
        resolvedFrom: loaded.resolvedFrom,
        resolvedPath: loaded.filePath,
        description: loaded.tf.description,
        problems: warnings,
      },
    };
  });
}

/**
 * Graph definition loader — loads and validates workflow YAML files.
 * Uses zod schemas (schemas/) for validation. Supports unknown
 * fields via .passthrough() for forward compatibility.
 *
 * Graph identity is schema-determined: any YAML file that passes
 * WorkflowSchema validation IS a graph — file suffix is not part of
 * identity, and dependency-edge acyclicity is a validation concern, not identity.
 * Name resolution: registry first (graph-loader), then schema probing
 * of the workflow dirs (suffix-free, declared-name match).
 *
 * Flow flattening lives in flow-flatten.ts — this module is load + validate only.
 *
 * Layer 1 capability module: uses Effect-TS FileSystem Tag for I/O seam
 * (imported from ./filesystem.js). Single-method interface — caller passes
 * graphName, gets verified Workflow or structured GraphDefinitionError with
 * file path + violation details.
 *
 * @module
 */

import { Effect } from 'effect';
import { statSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { FileSystem, FileSystemError } from './filesystem.js';
import { SERVER_STARTED_AT } from './runtime-start.js';
import { parseWithEffect, WorkflowSchema, type Workflow } from './schemas/index.js';
import type { GraphDefinitionError } from './types.js';
export type { Workflow };

/** The workflow format generation this engine supports — semver major. */
export const SUPPORTED_WORKFLOW_MAJOR = 1;

const STALE_PROCESS_HINT =
  ' — graph file modified after server start; restart the graph-scheduler MCP server if this file validates with current sources (stale process)';

/**
 * Diagnostic only — never blocks loading.
 * True when the graph file was modified after the server process started
 * (schema drift from a long-running server). stat failure → false.
 */
export function fileModifiedAfterServerStart(filePath: string): boolean {
  try {
    return statSync(filePath).mtimeMs > SERVER_STARTED_AT;
  } catch {
    return false;
  }
}

/**
 * Core load-and-validate logic — shared by probeGraph and loadGraphFromPath.
 * Reads the file via FileSystem Tag, parses YAML, validates with zod
 * WorkflowSchema, enforces the version policy (semver major mismatch →
 * loud rejection), and returns a typed Workflow or GraphDefinitionError.
 */
function loadAndValidate(
  filePath: string,
  graphName: string,
): Effect.Effect<Workflow, GraphDefinitionError | FileSystemError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readFile(filePath);

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (e) {
      return yield* Effect.fail<GraphDefinitionError>({
        _tag: 'GraphDefinitionError',
        graphName,
        message: `Invalid YAML in ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    const validated = yield* parseWithEffect(WorkflowSchema, parsed).pipe(
      Effect.mapError(
        (e) =>
          ({
            _tag: 'GraphDefinitionError',
            graphName,
            message:
              `Schema validation failed for ${graphName}` +
              (fileModifiedAfterServerStart(filePath) ? STALE_PROCESS_HINT : ''),
            violations: e.issues.map((i) => i.message),
          }) satisfies GraphDefinitionError,
      ),
    );

    // $schema self-description — the value must be a plausible URI reference
    // (no embedded whitespace); empty values already fail schema validation.
    if (validated.$schema !== undefined && /\s/.test(validated.$schema)) {
      return yield* Effect.fail<GraphDefinitionError>({
        _tag: 'GraphDefinitionError',
        graphName,
        message: `graph '${graphName}' declares a malformed '$schema' URI reference: '${validated.$schema}'`,
      });
    }
    // $schema ownership — the declaration must resolve to an existing schema
    // document (file-relative first, package schemas dir fallback); a dangling
    // declaration is a loud rejection, never silently ignored.
    if (validated.$schema !== undefined) {
      const resolved = fs.resolveSchemaUri(validated.$schema, filePath);
      if (resolved === null) {
        return yield* Effect.fail<GraphDefinitionError>({
          _tag: 'GraphDefinitionError',
          graphName,
          message: `graph '${graphName}' declares '$schema: ${validated.$schema}' — the URI resolves to no schema document (expected the derived workflow.schema.json)`,
        });
      }
    }

    // Version policy — the format version declares the document's format
    // generation. A major mismatch is a loud rejection: never silent
    // degradation, never a silent load.
    if (validated.version !== undefined) {
      const major = validated.version.match(/^(\d+)\./)?.[1];
      if (major !== undefined && Number(major) !== SUPPORTED_WORKFLOW_MAJOR) {
        return yield* Effect.fail<GraphDefinitionError>({
          _tag: 'GraphDefinitionError',
          graphName,
          message: `graph '${graphName}' declares workflow format version ${validated.version} (major ${major}) — this engine supports major ${SUPPORTED_WORKFLOW_MAJOR}; refusing to load (loud rejection, no silent degradation)`,
        });
      }
    }

    return validated;
  });
}

/**
 * Resolve a graph by name via schema probing — suffix-free, identity by
 * declared `name`.
 *
 * Two-step probe:
 * 1. Name-based fast path — try `<name>.yaml` / `<name>.yml` through the
 *    workflow dirs; load errors surface (parse/schema/name-mismatch).
 * 2. Declared-name scan — every YAML under the workflow dirs is loaded and
 *    schema-validated; the first document whose declared `name` matches
 *    wins. Schema-invalid documents are skipped (they are not graphs).
 * No candidate matches → GraphDefinitionError (not found).
 */
export function probeGraph(
  name: string,
): Effect.Effect<{ wf: Workflow; filePath: string }, GraphDefinitionError | FileSystemError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    for (const ext of ['yaml', 'yml'] as const) {
      const candidate = fs.resolvePath(`${name}.${ext}`);
      if (candidate !== null) {
        const wf = yield* loadAndValidate(candidate, name);
        if (wf.name !== name) {
          return yield* Effect.fail<GraphDefinitionError>({
            _tag: 'GraphDefinitionError',
            graphName: name,
            message: `graph file '${candidate}' declares name '${wf.name}' — requested '${name}'; the declared name is the identity (no suffix convention)`,
          });
        }
        return { wf, filePath: candidate };
      }
    }
    // Declared-name scan — schema determines identity, not the filename.
    for (const filePath of fs.listYamlFiles()) {
      const candidate = yield* Effect.either(loadAndValidate(filePath, name));
      if (candidate._tag === 'Right' && candidate.right.name === name) {
        return { wf: candidate.right, filePath };
      }
    }
    // Not found — ENOENT semantics (missing graph file): subgraph resolution
    // maps this to GRAPH_NOT_FOUND (FlowPhaseError) via isFileNotFound.
    return yield* Effect.fail(
      new FileSystemError(
        `${name}.yaml`,
        `ENOENT: graph '${name}' not found — no registry entry and no workflow YAML in the graph dirs declares name '${name}'`,
      ),
    );
  });
}

/**
 * Load and validate a workflow YAML file by graph name — schema-probe
 * resolution, no suffix convention (see probeGraph for probe semantics).
 */
export function loadGraph(
  graphName: string,
): Effect.Effect<Workflow, GraphDefinitionError | FileSystemError, FileSystem> {
  return probeGraph(graphName).pipe(Effect.map((r) => r.wf));
}

/**
 * Load and validate a workflow YAML file at an explicit path.
 *
 * Used by registry-loader when graph names are resolved to explicit file
 * paths via registry.json entries. Avoids amplifying errors through
 * wrapping — returns the original GraphDefinitionError on failure.
 */
export function loadGraphFromPath(
  resolvedPath: string,
  graphName: string,
): Effect.Effect<Workflow, GraphDefinitionError | FileSystemError, FileSystem> {
  return loadAndValidate(resolvedPath, graphName);
}

/**
 * Graph definition loader — loads and validates .taskflow.yaml files.
 * Uses zod schemas (schemas/) for validation. Supports unknown
 * fields via .passthrough() for forward compatibility.
 * No interpolation engine — template-variable resolution not used in this project.
 *
 * Layer 1 capability module: uses Effect-TS FileSystem Tag for I/O seam
 * (imported from ./filesystem.js). Single-method interface — caller passes
 * graphName, gets verified Taskflow or structured GraphDefinitionError with
 * file path + violation details.
 *
 * @module
 */

import { Context, Effect, Layer } from 'effect';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { FileSystem, FileSystemError } from './filesystem.js';
import { parseWithEffect, TaskflowSchema, type Taskflow } from './schemas/index.js';
import type { GraphDefinitionError } from './types.js';
export type { Taskflow };

// Re-export FileSystem for callers that import it from graph-definition
export { FileSystem };

// ---------------------------------------------------------------------------
// Default FileSystem layer — Node.js fs
// ---------------------------------------------------------------------------

/**
 * Default FileSystem layer backed by Node.js `readFileSync`.
 * File path is used as-is; caller is responsible for directory resolution.
 */
export const defaultFileSystemLayer: Layer.Layer<FileSystem, never, never> = Layer.succeed(FileSystem, {
  readFile: (path: string) =>
    Effect.try({
      try: () => readFileSync(path, 'utf-8'),
      catch: (cause): FileSystemError =>
        new FileSystemError(path, `File not found or unreadable: ${String(cause)}`, cause),
    }),
});

// ---------------------------------------------------------------------------
// Internal: load and validate a file by path
// ---------------------------------------------------------------------------
/**
 * Core load-and-validate logic — shared by loadGraph and loadGraphFromPath.
 * Reads the file via FileSystem Tag, parses YAML, validates with zod
 * TaskflowSchema, and returns a typed Taskflow or GraphDefinitionError.
 */
function loadAndValidate(
  filePath: string,
  graphName: string,
): Effect.Effect<Taskflow, GraphDefinitionError | FileSystemError, FileSystem> {
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
    const validated = yield* parseWithEffect(TaskflowSchema, parsed).pipe(
      Effect.mapError(
        (e) =>
          ({
            _tag: 'GraphDefinitionError',
            graphName,
            message: `Schema validation failed for ${graphName}`,
            violations: e.issues.map((i) => i.message),
          }) satisfies GraphDefinitionError,
      ),
    );

    return validated;
  });
}

// ---------------------------------------------------------------------------
// loadGraph
// ---------------------------------------------------------------------------

/**
 * Load and validate a .taskflow.yaml file by graph name.
 *
 * Resolves `${graphName}.taskflow.yaml` in the current working directory
 * (taskflowDir resolution handled by caller via FileSystem layer).
 * On failure, returns GraphDefinitionError with the file path and violation
 * details.
 */
export function loadGraph(
  graphName: string,
): Effect.Effect<Taskflow, GraphDefinitionError | FileSystemError, FileSystem> {
  return loadAndValidate(`${graphName}.taskflow.yaml`, graphName);
}

// ---------------------------------------------------------------------------
// loadGraphFromPath
// ---------------------------------------------------------------------------

/**
 * Load and validate a .taskflow.yaml file at an explicit path.
 *
 * Used by registry-loader when graph names are resolved to explicit file
 * paths via registry.json entries. Avoids amplifying errors through
 * wrapping — returns the original GraphDefinitionError on failure.
 */
export function loadGraphFromPath(
  resolvedPath: string,
  graphName: string,
): Effect.Effect<Taskflow, GraphDefinitionError | FileSystemError, FileSystem> {
  return loadAndValidate(resolvedPath, graphName);
}

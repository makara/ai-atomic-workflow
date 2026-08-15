/**
 * Shared FileSystem Tag — single I/O seam for graph-scheduling.
 *
 * Unified Context.Tag with generic FileSystemError. graph-definition
 * consumes this Tag; callers inject real or mock layers
 * via Layer.succeed / Layer.provide.
 */

import { Context, Effect } from 'effect';

/** Structured error from file I/O operations (read, not found, permission). */
export class FileSystemError {
  readonly _tag = 'FileSystemError' as const;

  constructor(
    /** File path that caused the error. */
    readonly filePath: string,
    /** Human-readable error detail. */
    readonly message: string,
    /** Underlying cause (system error, etc.). */
    readonly cause?: unknown,
  ) {}
}

/**
 * FileSystem Context.Tag — injectable I/O seam.
 *
 * `readFile` returns Effect<string, FileSystemError>; `resolvePath` returns
 * the absolute path a relative file resolves to through the workflow dirs
 * (or the input when absolute), null when not found. Consumers catch
 * FileSystemError in Effect.gen and re-wrap into domain-specific error
 * types (GraphDefinitionError, AgentConfigError).
 */
export class FileSystem extends Context.Tag('FileSystem')<
  FileSystem,
  {
    /**
     * List the workflow YAML files (`.yaml`/`.yml`) under the search dirs —
     * used by the schema-probe fallback (suffix-free graph discovery).
     * Absolute paths; unreadable/missing dirs → empty list.
     */
    readonly listYamlFiles: () => string[];
    readonly readFile: (path: string) => Effect.Effect<string, FileSystemError>;
    /** Resolve a relative path through the workflow dirs → absolute path (input when absolute); null when not found. */
    readonly resolvePath: (filePath: string) => string | null;
    /** Resolve a declared `$schema` URI to an existing schema document — against the declaring file's directory, then the package schemas dir; null when unresolvable. */
    readonly resolveSchemaUri: (uri: string, filePath: string) => string | null;
  }
>() {}

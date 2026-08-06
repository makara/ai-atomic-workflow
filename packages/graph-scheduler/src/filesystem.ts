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
 * the absolute path a relative file resolves to through the taskflow dirs
 * (or the input when absolute), null when not found. Consumers catch
 * FileSystemError in Effect.gen and re-wrap into domain-specific error
 * types (GraphDefinitionError, AgentConfigError).
 */
export class FileSystem extends Context.Tag('FileSystem')<
  FileSystem,
  {
    readonly readFile: (path: string) => Effect.Effect<string, FileSystemError>;
    /** Resolve a relative path through the taskflow dirs → absolute path (input when absolute); null when not found. */
    readonly resolvePath: (filePath: string) => string | null;
  }
>() {}

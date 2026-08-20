/**
 * Shared FileSystem seam — single I/O module for graph-scheduling.
 *
 * Deep module: the `FileSystem` Context.Tag AND its implementation (the
 * multi-directory layer factory) live here — the interface site owns the
 * behavior. graph-definition consumes the Tag; the runtime assembly wires
 * the exported factory. Callers inject real or mock layers via
 * Layer.succeed / Layer.provide.
 */

import { Context, Effect, Layer } from 'effect';
import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TASKFLOW_FILE_PATTERN } from './api/maintenance.js';

/** Built-in assets root — resolved relative to this source file. */
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/**
 * Create a FileSystem Layer that searches multiple workflow directories.
 *
 * Relative file paths are tried against each directory in order;
 * the first existing file wins. Absolute paths bypass directory search.
 * Directories searched: project dir first, built-in dir last (fallback).
 */
export function makeWorkflowFileSystemLayer(taskflowDirs: readonly string[]): Layer.Layer<FileSystem, never, never> {
  const resolvePath = (filePath: string): string | null => {
    if (path.isAbsolute(filePath)) return filePath;
    for (const dir of taskflowDirs) {
      const candidate = `${dir}/${filePath}`;
      try {
        // Existence probe only — the load chain re-reads the file anyway;
        // a full readFileSync here would double-read every fast-path candidate.
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // try next dir
      }
    }
    return null;
  };

  const resolveSchemaUri = (uri: string, filePath: string): string | null => {
    // Dual-base resolution: file-relative first (the declaring document's
    // directory), then the package schemas dir (the derived artifact's home).
    const bases = [path.dirname(filePath), path.join(PKG_ROOT, 'schemas')];
    for (const base of bases) {
      const candidate = path.resolve(base, uri);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // try next base
      }
    }
    return null;
  };

  const listYamlFiles = (): string[] => {
    const out: string[] = [];
    for (const dir of taskflowDirs) {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.isFile() && TASKFLOW_FILE_PATTERN.test(e.name)) out.push(`${dir}/${e.name}`);
      }
    }
    return out;
  };

  return Layer.succeed(FileSystem, {
    readFile: (filePath: string) =>
      Effect.try({
        try: (): string => {
          // Absolute paths — use as-is (from registry resolution)
          if (path.isAbsolute(filePath)) {
            return readFileSync(filePath, 'utf-8');
          }
          // Relative paths — try each workflow dir in order
          const errors: string[] = [];
          for (const dir of taskflowDirs) {
            const candidate = `${dir}/${filePath}`;
            try {
              return readFileSync(candidate, 'utf-8');
            } catch (e) {
              errors.push(`${candidate}: ${String(e)}`);
            }
          }
          throw new Error(`Not found in any workflow dir: ${errors.join('; ')}`);
        },
        catch: (cause): FileSystemError =>
          new FileSystemError(filePath, `File not found or unreadable: ${String(cause)}`, cause),
      }),
    resolvePath,
    listYamlFiles,
    resolveSchemaUri,
  });
}

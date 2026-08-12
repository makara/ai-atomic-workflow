import { z } from 'zod/v4';

/**
 * Zod schema for graph-scheduler config.json.
 * All fields optional — partial config is valid.
 * Defaults are applied in resolveConfig(), not in the schema itself.
 *
 * This is the single source of truth shared by:
 * - MCP Server (scheduler-runtime.ts → resolveConfig)
 * - setup-atomic-workflow skill seed (derived from createDefaultConfig)
 */
export const ConfigFileSchema = z
  .object({
    /** libsql database file path — relative to project root */
    dbPath: z.string().min(1).optional(),

    /** graph definition file directory — FileSystem layer base path */
    taskflowDir: z.string().min(1).optional(),

    /** registry.json search paths — later entries override earlier ones */
    registryPaths: z.array(z.string().min(1)).optional(),

    /**
     * Project-level ambient context — the default layer of the global
     * channel. Merged once at graph load with the graph's top-level
     * `context:` (dedup, config entries first) and injected into every
     * dispatched phase. Entries follow graph-level rules: explicit
     * `skill:`/`node:` prefix or file-glob shape; bare names are rejected
     * (superRefine below). `node:` target membership resolves per run —
     * out-of-run targets warn + strip at dispatch (run-scope gate); skill
     * resolution is agent-side (multi-dir resolution per platform
     * convention).
     */
    context: z.array(z.string()).optional(),

    /**
     * Removed field — declared so legacy configs fail loudly with a rename
     * hint instead of silent strip. Never consumed.
     */
    agentRegistry: z.unknown().optional(),

    /**
     * Removed field — renamed to `context` (two-scope context model). Declared
     * so legacy configs fail loudly with a rename hint instead of silent
     * strip. Never consumed.
     */
    channels: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    // agentRegistry removed — reject explicitly, never strip silently.
    if (data.agentRegistry !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentRegistry'],
        message: `'agentRegistry' is removed — dispatch handler is the constant atom-phase-handler; delete this field`,
      });
    }
    // channels renamed — reject explicitly with the migration hint.
    if (data.channels !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['channels'],
        message: `'channels' is renamed to 'context' (two-scope context model) — rename the key in this config file`,
      });
    }
    // Project-level context entry rules (graph-level rules at project scope) —
    // explicit skill:/node: prefix or file-glob shape; bare names are rejected.
    // node: membership resolves per run (dispatch run-scope gate); skill:
    // resolution is agent-side.
    for (const [idx, entry] of (data.context ?? []).entries()) {
      if (entry.startsWith('skill:') || entry.startsWith('node:')) continue;
      if (entry.includes('/') || entry.includes('*') || entry.includes('?') || entry.includes('[')) continue;
      ctx.addIssue({
        code: 'custom',
        path: ['context', idx],
        message: `project context entry "${entry}" is a bare name — project-level entries require an explicit skill:/node: prefix or a file glob (no execution-skill contract exists at project scope)`,
      });
    }
  });

/** Configuration for createRuntime / CLI — inferred from ConfigFileSchema. */
export type SchedulerConfig = z.infer<typeof ConfigFileSchema>;

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
     * graph-workflow skills package directory — load-time entry-skill alignment
     * and graph_init validation prefer it; absent → repo-root + package-sibling
     * probing. Global installs point this at the skills package.
     */
    skillsDir: z.string().min(1).optional(),

    /**
     * Removed field — declared so legacy configs fail loudly with a rename
     * hint instead of silent strip. Never consumed.
     */
    agentRegistry: z.unknown().optional(),
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
  });

/** Configuration for createRuntime / CLI — inferred from ConfigFileSchema. */
export type SchedulerConfig = z.infer<typeof ConfigFileSchema>;

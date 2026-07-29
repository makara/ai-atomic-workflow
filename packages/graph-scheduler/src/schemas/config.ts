import { z } from 'zod/v4';
import { AgentRegistryEntrySchema } from './registry-entry.js';

/**
 * Zod schema for graph-scheduler config.json.
 * All fields optional — partial config is valid.
 * Defaults are applied in resolveConfig(), not in the schema itself.
 *
 * This is the single source of truth shared by:
 * - MCP Server (scheduler-runtime.ts → resolveConfig)
 * - CLI (src/cli/validate.ts, src/cli/show.ts)
 */
export const ConfigFileSchema = z.object({
  /** libsql database file path — relative to project root */
  dbPath: z.string().min(1).optional(),

  /** graph definition file directory — FileSystem layer base path */
  taskflowDir: z.string().min(1).optional(),

  /** registry.json search paths — later entries override earlier ones */
  registryPaths: z.array(z.string().min(1)).optional(),

  /**
   * node type → agent config registry — project ∪ builtin merge.
   * Each entry: { type, skill, agent? } — no strategy field (ADR 0028).
   */
  agentRegistry: z.array(AgentRegistryEntrySchema).optional(),
});

/** Configuration for createRuntime / CLI — inferred from ConfigFileSchema. */
export type SchedulerConfig = z.infer<typeof ConfigFileSchema>;

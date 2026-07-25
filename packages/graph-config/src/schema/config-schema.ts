import { z } from 'zod';

// config.json Zod schema — single source of truth for graph-scheduler config
// every field has .default() so partial config works
export const ConfigFileSchema = z.object({
  /** libsql database file path — relative to project root */
  dbPath: z.string().min(1).default('.graph-scheduler/data/graph-scheduler.db'),

  /** graph definition file directory — FileSystem layer base path */
  taskflowDir: z.string().min(1).default('.graph-scheduler/graphs'),

  /** registry.json search paths — later entries override earlier ones */
  registryPaths: z.array(z.string().min(1)).default(['.graph-scheduler/graphs/registry.json']),

  /** node type → agent config registry — builtin ∪ project merge.
   *  Aligned with scheduler AgentRegistryEntrySchema (ADR 0028).
   *  Each entry: { type, skill, agent? } — no strategy field. */
  agentRegistry: z
    .array(
      z.object({
        type: z.string().min(1),
        skill: z.string().min(1),
        agent: z.string().optional(),
      }),
    )
    .optional(),
});

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

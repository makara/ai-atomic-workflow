import { z } from 'zod/v4';

/**
 * Zod schema for a single graph registry entry.
 *
 * A registry entry maps a graph name to its .taskflow.yaml file path.
 * Used by registry-loader.ts and GraphRepository to discover available graphs.
 */
export const RegistryEntrySchema = z.object({
  /** graph name — display and lookup key */
  name: z.string(),
  /** filesystem path to the .taskflow.yaml file (relative or absolute) */
  path: z.string(),
  /** human-readable description */
  description: z.string().optional(),
});

/** Inferred TypeScript type for a single registry entry. */
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

/**
 * Zod schema for a single agent registry entry.
 *
 * Agent registry entries define how node types map to skills and execution strategies.
 * Part of the three-layer agent resolution system (builtin → project → per-node override).
 */
export const AgentRegistryEntrySchema = z.object({
  /** node type: "agent" | "approval" or custom project type */
  type: z.string().min(1),
  /** skill path — handler skill for this phase type */
  skill: z.string().min(1),
  /** sub-agent type for task() dispatch (e.g. "task", "scout") */
  agent: z.string().optional(),
});

/** Inferred TypeScript type for a single agent registry entry. */
export type AgentRegistryEntry = z.infer<typeof AgentRegistryEntrySchema>;

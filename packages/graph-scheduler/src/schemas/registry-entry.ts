import { z } from 'zod/v4';

/**
 * Zod schema for a single graph registry entry.
 *
 * The registry is a pure index — an entry maps a graph name to its workflow
 * YAML file path and carries no metadata. `description` lives in the graph
 * definition top-level (catalog single source); the former `tags` category
 * axis is deleted. Strict: entries carrying removed fields are rejected.
 */
export const RegistryEntrySchema = z
  .object({
    /** graph name — display and lookup key */
    name: z.string(),
    /** filesystem path to the workflow YAML file (relative or absolute) */
    path: z.string(),
  })
  .strict();

/** Inferred TypeScript type for a single registry entry. */
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

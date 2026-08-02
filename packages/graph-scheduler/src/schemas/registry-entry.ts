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

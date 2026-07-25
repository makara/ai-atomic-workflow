import { z } from 'zod/v4';
import { PhaseSchema } from './phase.js';

/**
 * Zod schema for a complete .taskflow.yaml graph definition.
 *
 * Top-level structure:
 * - name (optional): graph name for display and reference
 * - version (optional): schema version number
 * - phases: array of phase/node definitions
 *
 * .passthrough() allows future extension fields without breaking validation.
 */
export const TaskflowSchema = z
  .object({
    /** graph name — display and reference identifier */
    name: z.string().optional(),
    /** schema version */
    version: z.union([z.string(), z.number()]).optional(),
    /** phase/node definitions — at least one required */
    phases: z.array(PhaseSchema),
  })
  .passthrough();

/** Inferred TypeScript type for a complete taskflow graph definition. */
export type Taskflow = z.infer<typeof TaskflowSchema>;

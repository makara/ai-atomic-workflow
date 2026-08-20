import { PHASE_FIELD_KEYS } from './phase.js';

/**
 * Schema-unknown phase key finding — one per phase carrying extra keys.
 * Tolerant audit surface: detection requires no schema-valid load (raw
 * parsed YAML suffices), so schema-invalid graphs still report their
 * extra fields for graph-maintain cleanup.
 */
export interface UnknownPhaseKeyFinding {
  readonly phaseId: string;
  readonly keys: readonly string[];
}

const KNOWN_PHASE_KEYS: ReadonlySet<string> = new Set(PHASE_FIELD_KEYS);

/**
 * Detect schema-unknown phase keys in a parsed workflow document.
 *
 * Pure function — caller parses the YAML; tolerant of non-object / missing
 * `phases` shapes (returns [] — never throws). The known-key set derives
 * from PhaseSchema itself (single source of truth, never hand-maintained).
 *
 * @param parsed — parsed YAML document (any shape)
 * @returns findings per phase with extra keys (empty when clean)
 */
export function unknownPhaseKeys(parsed: unknown): UnknownPhaseKeyFinding[] {
  if (typeof parsed !== 'object' || parsed === null) return [];
  const phases = (parsed as { phases?: unknown }).phases;
  if (!Array.isArray(phases)) return [];

  const findings: UnknownPhaseKeyFinding[] = [];
  for (const phase of phases) {
    if (typeof phase !== 'object' || phase === null) continue;
    const keys = Object.keys(phase).filter((k) => !KNOWN_PHASE_KEYS.has(k));
    if (keys.length > 0) {
      const id = (phase as { id?: unknown }).id;
      findings.push({ phaseId: typeof id === 'string' ? id : '<unknown>', keys });
    }
  }
  return findings;
}

/**
 * Non-interactive compliance scan — machine surface for the graph-maintain
 * audit (graph-declared `interaction: none` compliance).
 *
 * Tolerant raw-YAML audit surface, same mechanism as `unknownPhaseKeys`:
 * detection requires no schema-valid load (raw parsed YAML suffices), so a
 * graph that fails schema-valid load still reports its interaction markers
 * for graph-maintain cleanup. Backend performs zero judgment — the scanner
 * is a pure function consumed by the agent-side maintenance audit (and its
 * engine tests), never wired into the load path or dispatch.
 */

/** Interaction marker kind — what the machine scan matched. */
export type InteractionMarkerKind = 'task-token' | 'interaction-skill' | 'direct-end';

/** Per-node interaction marker finding. */
export interface InteractionMarkerFinding {
  readonly phaseId: string;
  readonly markers: ReadonlyArray<{
    readonly kind: InteractionMarkerKind;
    readonly evidence: string;
  }>;
}

/** Task-text interaction tokens — agent-side confirmation markers (non-global regexes: no /g lastIndex trap). */
const TASK_TOKEN = /(?:^|\s)(?:Interview:|confirm:)/i;
const INLINE_INTERVIEW = /inline[-\s]?interview/i;
const DIRECT_END = /direct\s+end\s*:/i;

/** Interaction skills — the closed interaction-skill set. */
const INTERACTION_SKILLS: ReadonlySet<string> = new Set(['atom-scope-interview', 'grilling']);

/**
 * Scan a parsed workflow document for interaction markers per phase.
 *
 * Pure function — caller parses the YAML; tolerant of non-object / missing
 * `phases` shapes (returns [] — never throws). Machine scan only: semantic
 * interaction declared in prose the patterns miss is the LLM review pass's
 * job (graph-maintain audit), never claimed here.
 *
 * @param parsed — parsed YAML document (any shape)
 * @returns findings per phase carrying interaction markers (empty when clean)
 */
export function interactionMarkers(parsed: unknown): InteractionMarkerFinding[] {
  if (typeof parsed !== 'object' || parsed === null) return [];
  const phases = (parsed as { phases?: unknown }).phases;
  if (!Array.isArray(phases)) return [];

  const findings: InteractionMarkerFinding[] = [];
  for (const phase of phases) {
    if (typeof phase !== 'object' || phase === null) continue;
    const p = phase as { id?: unknown; task?: unknown; skill?: unknown };
    const markers: Array<{ kind: InteractionMarkerKind; evidence: string }> = [];
    if (typeof p.task === 'string') {
      const tokenMatch = p.task.match(TASK_TOKEN);
      if (tokenMatch) {
        markers.push({ kind: 'task-token', evidence: tokenMatch[0].trim() });
      }
      if (INLINE_INTERVIEW.test(p.task)) {
        markers.push({ kind: 'task-token', evidence: 'inline interview' });
      }
      if (DIRECT_END.test(p.task)) {
        markers.push({ kind: 'direct-end', evidence: 'direct end:' });
      }
    }
    if (typeof p.skill === 'string' && INTERACTION_SKILLS.has(p.skill)) {
      markers.push({ kind: 'interaction-skill', evidence: `skill: ${p.skill}` });
    }
    if (markers.length > 0) {
      const id = p.id;
      findings.push({ phaseId: typeof id === 'string' ? id : '<unknown>', markers });
    }
  }
  return findings;
}

/**
 * Non-interactive compliance result for a parsed workflow document.
 *
 * `declared` = the document declares `interaction: none`; `findings` =
 * interaction markers found in its own phases (empty when clean). A document
 * without the `none` declaration is never scanned (`declared: false`,
 * `findings: []`).
 *
 * @param parsed — parsed YAML document (any shape)
 */
export function nonInteractiveCompliance(parsed: unknown): {
  readonly declared: boolean;
  readonly findings: InteractionMarkerFinding[];
} {
  if (typeof parsed !== 'object' || parsed === null) return { declared: false, findings: [] };
  if ((parsed as { interaction?: unknown }).interaction !== 'none') {
    return { declared: false, findings: [] };
  }
  return { declared: true, findings: interactionMarkers(parsed) };
}

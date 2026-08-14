/**
 * System-resident prompts — the P0 prompt class: a fixed set of
 * correctness directives injected into the outgoing SYSTEM PROMPT
 * (position law: C4-class knowledge rides the system-prompt seam, never
 * the user channel) on every top-level turn on both platform faces (OMP
 * `before_agent_start`, opencode `experimental.chat.system.transform`).
 * Install = resident; no session toggle.
 *
 * The block carries a machine anchor marker (`[resident]`) and is
 * canonical-deduped + refreshed in place (the discipline echo module's
 * dedup pattern, applied to system-prompt arrays).
 *
 * Resident set (P0): PCL vocabulary (compressed from the atom-pilot
 * skill's process-control table — atom-pilot stays the source of truth)
 * + the HLT core requirement (compressed from the atom-kernel Core
 * Requirement box — atom-kernel stays the source of truth). Both are
 * unconditional correctness content; the R2 style prompts
 * (caveman/rtk/ponytail) and their mode knob were removed with the
 * R2/R1 decoupling (ADR 0175).
 *
 * Pure: no platform imports, no platform state. Adapters wire this core
 * to their system-prompt seams.
 *
 * @module
 */

import { HLT_CORE_REQUIREMENT, PCL_VOCABULARY } from './resident-data.js';

export { HLT_CORE_REQUIREMENT } from './resident-data.js';

/** Machine anchor — resident block lines are marker-prefixed (grep-anchor, same family as `[seam]`). */
export const RESIDENT_MARKER = '[resident]';

/** Block heading — single source for render + strip (byte-identity keeps self-heal reliable). */
export const RESIDENT_HEADING = '## Resident Prompts';

/** A resident prompt entry — fixed at install, rendered per turn. */
export interface ResidentPrompt {
  readonly id: string;
  readonly title: string;
  /** Verbatim directive text. */
  readonly text: string;
}

/** True when the text carries a resident line. */
function hasResidentLine(text: string): boolean {
  return text.split('\n').some((line) => isResidentLine(line));
}

/** True when a line is a resident line — marker-prefixed (optional list prefix tolerated). */
function isResidentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith(RESIDENT_MARKER) || trimmed.startsWith(`- ${RESIDENT_MARKER}`);
}

/**
 * Strip the resident block from a system-prompt entry (self-heal helper).
 * The block is a contiguous tail region starting at the block heading (or
 * the FIRST marker line when heading-less legacy content) — entry texts
 * may wrap (every entry starts with a marker line and the block is
 * appended as one entry, so nothing of value follows it).
 */
export function stripResidentLines(text: string): string {
  const lines = text.split('\n');
  const first = lines.findIndex((line) => isResidentLine(line) || isResidentHeading(line));
  if (first === -1) return text;
  const kept = lines.slice(0, first);
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

/** True when a line is the resident block heading. */
function isResidentHeading(line: string): boolean {
  return line.trim() === RESIDENT_HEADING;
}

/** True when the text carries the resident heading. */
function hasResidentHeading(text: string): boolean {
  return text.split('\n').some((line) => isResidentHeading(line));
}

/** The resident prompt set — unconditional correctness content only (PCL + HLT). */
export function selectResidentPrompts(): readonly ResidentPrompt[] {
  return [
    { id: 'pcl', title: 'PCL', text: PCL_VOCABULARY },
    { id: 'hlt', title: 'HLT', text: HLT_CORE_REQUIREMENT },
  ];
}

/** Render the resident block — deterministic, one heading + marker-prefixed entries. */
export function renderResidentBlock(): string {
  const entries = selectResidentPrompts()
    .map((p) => `${RESIDENT_MARKER} ${p.title}: ${p.text}`)
    .join('\n');
  return `${RESIDENT_HEADING}\n${entries}`;
}

/**
 * Apply the resident block to a system-prompt array — canonical-dedup
 * (byte-equal block entry present → skip) + self-heal (stale resident
 * block stripped from other entries), then append the fresh block as the
 * last entry. Returns undefined when nothing changed. Never mutates input.
 */
export function applyResidentBlock(systemPrompts: readonly string[], block: string): string[] | undefined {
  if (block.length === 0) return undefined;
  if (systemPrompts.some((entry) => entry === block)) return undefined;
  const base = systemPrompts.map((entry) =>
    hasResidentHeading(entry) || hasResidentLine(entry) ? stripResidentLines(entry) : entry,
  );
  return [...base, block];
}

/**
 * One-call adapter helper — render the block and apply it to the
 * system-prompt array; returns the new array or undefined when nothing
 * changed (dedup). Both platform faces call this from their
 * system-prompt seams; zero deny (undefined → no injection).
 */
export function applyResidentToSystem(systemPrompts: readonly string[]): string[] | undefined {
  const block = renderResidentBlock();
  return applyResidentBlock(systemPrompts, block);
}

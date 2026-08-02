/**
 * Project constraint channel — .graph-scheduler/constraints.md ## Rules section.
 *
 * extractRules: pure parser — markdown → rule list. Same ## Rules convention
 * as guide files and skill bodies — one concept, one embedding semantics.
 *
 * loadConstraintsFile: load-time read, CWD relative, same convention as
 * config.json. Scheduler only transports; evaluation/injection is agent-side
 * duty — when-guard symmetry.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

/** Exact `## Rules` heading — case-sensitive per convention. */
const RULES_HEADING = /^##\s+Rules\s*$/;
/** Near-miss heading — any heading mentioning Rules at wrong level/case/suffix. */
const NEAR_MISS_HEADING = /^#{1,6}\s*Rules\b/i;
/** Any markdown heading ends the Rules section. */
const SECTION_END = /^#+\s/;
/** Bullet marker — `- `, `* `, `+ ` stripped from entry. */
const LIST_MARKER = /^[-*+]\s+/;
/** HTML comment line — skipped, used for init templates. */
const HTML_COMMENT = /^\s*<!--/;

/**
 * Find a near-miss `## Rules` heading — wrong level, wrong case, or suffix
 * (e.g. `## rules`, `### Rules`, `## Rules (x)`). Exact `## Rules` excluded.
 * Returns the offending line, or null when none. Diagnostic aid for the
 * silent-empty-parse failure mode — caller decides what to do with it.
 */
export function findNearMissHeading(markdown: string): string | null {
  for (const raw of markdown.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (NEAR_MISS_HEADING.test(trimmed) && !RULES_HEADING.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Extract rules from `## Rules` markdown section — pure function.
 *
 * Missing section → empty array (constraints optional, existing projects unaffected).
 * Entries: one per bullet line, markers stripped, HTML comments dropped,
 * section ends at next markdown heading. Order preserved.
 */
export function extractRules(markdown: string): readonly string[] {
  const lines = markdown.split(/\r?\n/);
  let inRules = false;
  const rules: string[] = [];
  for (const raw of lines) {
    if (!inRules) {
      if (RULES_HEADING.test(raw.trim())) inRules = true;
      continue;
    }
    if (SECTION_END.test(raw.trim())) break;
    if (HTML_COMMENT.test(raw)) continue;
    const entry = raw.trim().replace(LIST_MARKER, '').trim();
    if (entry) rules.push(entry);
  }
  return rules;
}

/**
 * Load project constraints from .graph-scheduler/constraints.md — CWD relative,
 * same convention as config.json.
 *
 * Missing/unreadable file → empty array, silent (constraints optional).
 * File present but parse yields zero rules → console.warn diagnostic with
 * near-miss heading hint — the silent-loss failure mode becomes visible.
 */
export function loadConstraintsFile(): readonly string[] {
  const filePath = path.resolve('.graph-scheduler', 'constraints.md');
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const rules = extractRules(content);
  if (rules.length === 0) {
    const nearMiss = findNearMissHeading(content);
    console.warn(
      `[constraints] ${filePath}: file present but no rules extracted — ` +
        (nearMiss
          ? `near-miss heading found: "${nearMiss}" (expected exactly "## Rules")`
          : 'expected a "## Rules" section with one rule per bullet line'),
    );
  }
  return rules;
}

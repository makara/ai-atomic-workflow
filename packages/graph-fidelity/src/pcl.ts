/**
 * Mechanical PCL detection — the SINGLE vocabulary matcher shared by both
 * platform faces (OMP `input` observability wiring, opencode
 * `chat.message` mark). The vocabulary stays data
 * (`src/resident-data.ts`, atom-pilot stays the source of truth).
 *
 * Pure: no platform imports, no I/O.
 *
 * @module
 */

import { PCL_VOCABULARY } from './resident-data.js';

/**
 * Mechanical PCL detection — match the input against the resident PCL
 * vocabulary's leading keyword patterns (case-insensitive, word-boundary).
 * Mark-only: returns the matched keyword; the caller records a mark and
 * NEVER routes/modifies.
 */
export function detectPcl(text: string): string | undefined {
  const lowered = text.toLowerCase();
  for (const { keyword, pattern } of PCL_PATTERNS) {
    if (pattern.test(lowered)) return keyword;
  }
  return undefined;
}

/** Leading keyword patterns extracted from the resident PCL vocabulary rows — precompiled (keyword, regex) pairs. */
const PCL_PATTERNS: ReadonlyArray<{ keyword: string; pattern: RegExp }> = pclKeywordsFrom(PCL_VOCABULARY).map(
  (keyword) => ({ keyword, pattern: new RegExp(`\\b${escapeRegExp(keyword)}\\b`) }),
);

function pclKeywordsFrom(vocabulary: string): readonly string[] {
  const keywords: string[] = [];
  for (const line of vocabulary.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue; // utterance rows only
    const utterance = trimmed.slice(2).split(':')[0] ?? ''; // utterance before the ':' mapping (hints-dont-use-format de-arrow)
    for (const alternative of utterance.split('/')) {
      const first = alternative.trim().split(/\s+/)[0];
      if (first !== undefined && first.length > 0) keywords.push(first);
    }
  }
  return keywords;
}

/** Regex-escape a keyword literal (word-boundary match). */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Comment hygiene policy test — spec "comment-hygiene":
 * code comments and skill bodies must not carry ADR-number citations
 * or dead doc-path references. Why-rationale must live inline.
 *
 * Per-root pattern sets (design D3): src enforces doc-path patterns too,
 * since doc references are never functional in src; skill bodies, root
 * skills, and graph task text may name documents as inputs (functional),
 * so only ADR citations are enforced there.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../../..');

/** ADR-number citations — banned everywhere in scan scope. */
const ADR_PATTERN = /ADR[- ]\d{3,4}/;
/** Doc-path references — banned in src comments only (never functional there). */
const DOC_PATH_PATTERN = /docs\/adr|docs\/reports|\bCONTEXT\.md\b|\bREADME\.md\b/;
/** CJK characters — banned in packages code, skills, and graphs (single-language codebase). */
const CJK_PATTERN = /[\u4e00-\u9fff]/;

interface ScanRoot {
  /** Directory relative to repo root. */
  root: string;
  /** File suffixes to include. */
  extensions: string[];
  /** Patterns enforced in this root. */
  patterns: RegExp[];
}

const SCAN_ROOTS: ScanRoot[] = [
  {
    root: 'packages/graph-scheduler',
    // Package-root entry files (server.ts, build configs) are src-level
    // code — doc references are never functional there.
    extensions: ['server.ts'],
    patterns: [ADR_PATTERN, DOC_PATH_PATTERN, CJK_PATTERN],
  },
  {
    root: 'packages/graph-scheduler/src',
    extensions: ['.ts'],
    patterns: [ADR_PATTERN, DOC_PATH_PATTERN, CJK_PATTERN],
  },
  {
    root: 'packages/graph-workflow',
    extensions: ['.ts', 'SKILL.md'],
    patterns: [ADR_PATTERN, CJK_PATTERN],
  },
  {
    root: 'skills',
    extensions: ['SKILL.md'],
    patterns: [ADR_PATTERN],
  },
  {
    root: 'packages/graph-scheduler/tests',
    extensions: ['.ts'],
    patterns: [ADR_PATTERN, CJK_PATTERN],
  },
  {
    root: 'packages/graph-scheduler/graphs',
    extensions: ['.taskflow.yaml', '.json'],
    patterns: [ADR_PATTERN, CJK_PATTERN],
  },
];

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', '.taskflow', 'archive']);
const SELF = 'comment-hygiene.test.ts';

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
}

function violations(): string[] {
  const found: string[] = [];
  for (const scope of SCAN_ROOTS) {
    const absRoot = join(REPO_ROOT, scope.root);
    if (!statSync(absRoot).isDirectory()) continue;
    const files: string[] = [];
    walk(absRoot, files);
    for (const file of files) {
      if (file.endsWith(SELF)) continue;
      if (!scope.extensions.some((ext) => file.endsWith(ext))) continue;
      const rel = relative(REPO_ROOT, file);
      const content = readFileSync(file, 'utf-8');
      for (const pattern of scope.patterns) {
        const lines = content.split('\n');
        const idx = lines.findIndex((line) => pattern.test(line));
        if (idx !== -1) found.push(`${rel}:${idx + 1} matches /${pattern.source}/`);
      }
    }
  }
  return found;
}

describe('comment hygiene — no ADR/doc citations in code comments', () => {
  it('scan scope contains no ADR-number citations, doc-path refs, or dead links', () => {
    const hits = violations();
    expect(hits).toEqual([]);
  });
});

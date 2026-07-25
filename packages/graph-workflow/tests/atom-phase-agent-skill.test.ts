/**
 * TDD — ADR-0029 Phase 2: atom-phase-agent SKILL.md content assertions.
 *
 * Asserts the rewritten SKILL.md contains the 5-step handler flow,
 * Context Requirements section, legacy fallback, and entrySkill dispatch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function loadSkill(): string {
  const skillPath = resolve(__dirname, '../skills/atom-phase-agent/SKILL.md');
  return readFileSync(skillPath, 'utf-8');
}

describe('atom-phase-agent SKILL.md — content assertions', () => {
  const skill = loadSkill();

  // ── Handler Flow ─────────────────────────────────────────

  it('contains ## Handler Flow section', () => {
    expect(skill).toMatch(/## Handler Flow/);
  });

  it('contains Step 1: Receive subsection', () => {
    expect(skill).toMatch(/### Step 1: Receive/);
  });

  it('contains Step 2: Discover subsection', () => {
    expect(skill).toMatch(/### Step 2: Discover/);
  });

  it('contains Step 3: Collect & Assemble subsection', () => {
    expect(skill).toMatch(/### Step 3: Collect & Assemble/);
  });

  it('contains Step 4: Dispatch subsection', () => {
    expect(skill).toMatch(/### Step 4: Dispatch/);
  });

  it('contains Step 5: Collect & Return subsection', () => {
    expect(skill).toMatch(/### Step 5: Collect & Return/);
  });

  // ── Context Requirements ──────────────────────────────────

  it('contains ## Context Requirements section', () => {
    expect(skill).toMatch(/## Context Requirements/);
  });

  it('describes Files resolution in Context Requirements', () => {
    expect(skill).toMatch(/### Files/);
  });

  it('describes Description resolution in Context Requirements', () => {
    expect(skill).toMatch(/### Description/);
  });

  // ── File Landing ──────────────────────────────────────────

  it('describes file landing convention (.taskflow/outputs/)', () => {
    expect(skill).toMatch(/\.taskflow\/outputs/);
  });

  it('describes FILE MISSING marker for unreadable files', () => {
    expect(skill).toMatch(/FILE MISSING/);
  });

  // ── Legacy Backward Compatibility ─────────────────────────

  it('mentions "legacy" for backward-compatible fallback behavior', () => {
    expect(skill).toMatch(/legacy/i);
  });

  // ── entrySkill Dispatch ───────────────────────────────────

  it('mentions "entrySkill" for task() dispatch target', () => {
    expect(skill).toMatch(/entrySkill/);
  });

  // ── Output Format ─────────────────────────────────────────

  it('describes {status, output, durationMs} output format', () => {
    expect(skill).toMatch(/\{.*status.*output.*durationMs.*\}/s);
  });

  // ── English-only / No external refs ───────────────────────

  it('is English-only (no CJK characters)', () => {
    expect(skill).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('does not reference external docs/ directory', () => {
    expect(skill).not.toMatch(/docs\//);
  });
});

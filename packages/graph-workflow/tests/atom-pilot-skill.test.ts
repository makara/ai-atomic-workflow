/**
 * Content assertions - atom-pilot SKILL.md + DISPLAY.md graph resident
 * perception block (graph-perception-list):
 * - Activation injects the resident block: one graph_assets query after
 *   tool detection (Entry step 4), one line per graph (id + description),
 *   before graph_start / the identity banner.
 * - Compact by contract: id + description only, never the full five-field
 *   payload; detail (run_conditions / source / problems) stays on demand
 *   via graph_assets.
 * - Failure degradation: catalog query failure omits the block, never
 *   blocks the run; session fact at activation, no per-dispatch reload.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function loadSkill(): string {
  return readFileSync(resolve(__dirname, '../skills/atom-pilot/SKILL.md'), 'utf-8');
}

/** SKILL.md + sibling .md files (DISPLAY.md etc.) — the full package contract surface. */
function loadSkillPackage(): string {
  const dir = resolve(__dirname, '../skills/atom-pilot');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => readFileSync(resolve(dir, f), 'utf-8'))
    .join('\n');
}

describe('atom-pilot SKILL.md - graph resident perception block (activation)', () => {
  const skill = loadSkill();

  it('places the resident-block step after tool detection, before graph_start', () => {
    const entry = skill.slice(skill.indexOf('## Entry'), skill.indexOf('## Graph-Scheduler Tool Detection'));
    const toolDetect = entry.indexOf('Detect graph-scheduler MCP tools');
    const perception = entry.indexOf('Graph resident perception block');
    const start = entry.indexOf('Call `graph_start');
    expect(toolDetect).toBeGreaterThan(-1);
    expect(perception).toBeGreaterThan(toolDetect);
    expect(start).toBeGreaterThan(perception);
  });

  it('sources the block from a single graph_assets query', () => {
    const entry = skill.slice(skill.indexOf('## Entry'), skill.indexOf('## Graph-Scheduler Tool Detection'));
    expect(entry).toMatch(/query `graph_assets` once/);
    expect(entry).toMatch(/one line per graph, `id \+ description`/);
  });

  it('keeps the block compact - id + description only, never the five-field payload', () => {
    const entry = skill.slice(skill.indexOf('## Entry'), skill.indexOf('## Graph-Scheduler Tool Detection'));
    expect(entry).toMatch(/compact, never the full five-field payload/);
    expect(entry).toMatch(/detail stays on demand via `graph_assets`/);
  });

  it('injects the block before the identity banner, mirroring the skills <skills> block', () => {
    const entry = skill.slice(skill.indexOf('## Entry'), skill.indexOf('## Graph-Scheduler Tool Detection'));
    const perception = entry.indexOf('Graph resident perception block');
    const banner = entry.indexOf('Identity banner');
    expect(banner).toBeGreaterThan(perception);
    expect(entry).toMatch(/mirrors the skills `<skills>` block/);
  });

  it('degrades gracefully on query failure - block omitted, run never blocked', () => {
    const entry = skill.slice(skill.indexOf('## Entry'), skill.indexOf('## Graph-Scheduler Tool Detection'));
    expect(entry).toMatch(/Query failure → omit the block, never block the run/);
  });

  it('treats the block as a session fact - activation snapshot, no per-dispatch reload', () => {
    const entry = skill.slice(skill.indexOf('## Entry'), skill.indexOf('## Graph-Scheduler Tool Detection'));
    expect(entry).toMatch(/Session fact at activation — no per-dispatch reload/);
  });

  it('keeps graph_start as the first EXECUTION action (steps 1-4 excepted)', () => {
    expect(skill).toMatch(/`graph_start` MUST be the first EXECUTION action/);
    expect(skill).toMatch(/entry-program steps 1-4 excepted/);
  });
});

describe('atom-pilot SKILL.md - MCP Reference graph_assets resident-block role', () => {
  const skill = loadSkill();

  it('marks graph_assets as the resident perception-block data source', () => {
    expect(skill).toMatch(/`graph_assets` — the resident perception-block data source/);
    expect(skill).toMatch(/full five-field detail \(`run_conditions`, `source`, `problems`\) stays on demand/);
  });

  it('keeps graph_assets out of the cold-ops list (activation-queried, not operator-only)', () => {
    expect(skill).toMatch(
      /Cold ops \(operator use — full params resolved on demand\): graph_status \{runId\}, graph_list, graph_init, graph_clean_completed \{before\?\}, graph_clean_all\./,
    );
  });
});

describe('atom-pilot DISPLAY.md - resident perception block format', () => {
  const pkg = loadSkillPackage();

  it('documents the one-line-per-graph format (id + description)', () => {
    expect(pkg).toMatch(/# Resident perception block/);
    expect(pkg).toMatch(/- <graphId>: <description>/);
    expect(pkg).toMatch(/`id \+ description` only/);
  });

  it('documents the failure degradation - no placeholder, no error prose', () => {
    expect(pkg).toMatch(/Query failure → the block is omitted entirely, no placeholder, no error prose/);
  });
});

/**
 * Mermaid-format compliance regression — the graph-flow compliance axis,
 * track 1: builtin graphs are guaranteed by the suite.
 *
 * The engine flow subset grammar (flow.ts FLOW_EDGE_RE) is a strict subset
 * of the mermaid flowchart grammar. This test parses every builtin graph's
 * declared flow block with the REAL mermaid parser — a parse failure means
 * the subset (or a builtin graph) has drifted out of mermaid and fails the
 * suite, naming the graph and the error.
 *
 * Same parser path as the load-time check for project graphs
 * (checkFlowMermaidCompliance — the shared helper).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { parseFlow } from '../../src/flow.js';
import { checkFlowMermaidCompliance } from '../../src/mermaid-compliance.js';

const GRAPHS_DIR = join(__dirname, '..', '..', 'graphs');

/** Every builtin graph file — directory scan (12 graphs, fleet-wide). */
function builtinGraphFiles(): string[] {
  return readdirSync(GRAPHS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .sort();
}

describe('mermaid-format compliance — builtin flow blocks', () => {
  it('every builtin graph flow block parses under the real mermaid parser (12/12)', async () => {
    const files = builtinGraphFiles();
    expect(files.length).toBeGreaterThanOrEqual(12);
    let checked = 0;
    for (const file of files) {
      const raw = readFileSync(join(GRAPHS_DIR, file), 'utf8');
      const graph = parseYaml(raw) as { flow?: unknown; name?: string };
      if (!Array.isArray(graph.flow)) continue;
      checked += 1;
      const problem = await checkFlowMermaidCompliance(graph.flow as string[]);
      expect(problem, `${file}: flow block must parse under real mermaid — ${problem ?? ''}`).toBeNull();
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  it('a non-mermaid flow edge surfaces a compliance problem (negative control)', async () => {
    // `A => B` is not a mermaid flowchart edge (invalid arrow) — the check
    // must catch it. This proves the helper is a REAL mermaid parse, not a
    // structural approximation.
    const problem = await checkFlowMermaidCompliance(['round-report => scope-entry']);
    expect(problem).not.toBeNull();
    expect(problem).toMatch(/not mermaid-format valid/);
  });

  it('an empty flow block is conformant (no check)', async () => {
    expect(await checkFlowMermaidCompliance([])).toBeNull();
  });
});

/**
 * Flow full-coverage regression — the transition surface single-source
 * guarantee: every builtin graph's flow block SHALL cover every
 * declared phase — each phase id appears as a flow-edge source or target
 * (the synthesized `__handoff` excluded — a synthesized terminal, not a
 * declared phase). A phase absent from the flow block means its transition
 * surface rides the dependsOn default — the dual-source drift this axis
 * forbids (user requirement, round 5).
 */
describe('flow full coverage — builtin graphs', () => {
  it('every builtin graph covers every declared phase in its flow block (12/12)', () => {
    const files = builtinGraphFiles();
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const file of files) {
      const raw = readFileSync(join(GRAPHS_DIR, file), 'utf8');
      const graph = parseYaml(raw) as { flow?: unknown; name?: string; phases?: Array<{ id?: string }> };
      const phases = (graph.phases ?? []).map((p) => p.id).filter((id): id is string => id !== undefined);
      expect(phases.length, `${file}: graph must declare phases`).toBeGreaterThan(0);
      const edges = Array.isArray(graph.flow) ? parseFlow(graph.flow as string[]) : [];
      const endpoints = new Set<string>();
      for (const edge of edges) {
        endpoints.add(edge.source);
        endpoints.add(edge.target);
      }
      const uncovered = phases.filter((id) => id !== '__handoff' && !endpoints.has(id));
      expect(uncovered, `${file}: phases absent from flow block — ${uncovered.join(', ')}`).toEqual([]);
    }
  });
});

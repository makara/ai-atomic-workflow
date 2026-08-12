/**
 * Contract doc guard — skill markdown ↔ TS type consistency (contract-doc-guard spec).
 *
 * The double-package seam (graph-scheduler TS types ↔ graph-workflow SKILL.md tables)
 * is hand-synced. This test makes drift fail CI:
 *  - NodeDetail field tables in atom-phase-handler SKILL.md match INodeDetail/IBaseNodeDetail
 *  - fsmState table matches the FSM's actual run-level states
 *  - node status list matches NodeStateSchema.status exactly
 *  - skip param is documented only when GraphAdvanceSchema actually accepts it
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { IBaseNodeDetail, INodeDetail } from '../src/phase-handler/types.js';
import { NodeStateSchema } from '../src/schemas/index.js';

// ---------------------------------------------------------------------------
// Fixture — skill docs (graph-workflow package)
// ---------------------------------------------------------------------------

// NodeDetail/fsmState/snapshot tables moved out of SKILL.md into the
// NODE-SCHEMA.md sibling (sibling-split refactor) — the guard follows them.
const HANDLER_SKILL = join(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'graph-workflow',
  'skills',
  'atom-phase-handler',
  'NODE-SCHEMA.md',
);
const PILOT_SKILL = join(__dirname, '..', '..', '..', 'packages', 'graph-workflow', 'skills', 'atom-pilot', 'SKILL.md');

function readSkill(path: string): string {
  return readFileSync(path, 'utf-8');
}

interface Table {
  rows: string[][];
}

/** Parse all markdown tables — rows = first-column cells, backticks stripped, separators dropped. */
function parseTables(md: string): Table[] {
  const tables: Table[] = [];
  let current: Table | null = null;

  for (const line of md.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (current) tables.push(current);
      current = null;
      continue;
    }
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim().replace(/^`|`$/g, ''));
    // Separator row (---) — skip
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (!current) current = { rows: [] };
    current.rows.push(cells);
  }
  if (current) tables.push(current);
  return tables;
}

/** Find a table containing an anchor token in its header row. */
function findTable(md: string, headerAnchor: string): Table | undefined {
  return parseTables(md).find((t) => t.rows[0]?.[0]?.toLowerCase().includes(headerAnchor.toLowerCase()));
}

// ---------------------------------------------------------------------------
// NodeDetail field sets — TS side
// ---------------------------------------------------------------------------

function baseNodeDetailKeys(): Set<string> {
  // `agent` is a main-type field documented in the base table — tolerated
  // here (assertKeysCovered allows it via the type-specific whitelist).
  return new Set(['nodeId', 'type', 'dependsOn', 'skill', 'agent', 'operations', 'retryCount']);
}

function nodeDetailKeys(): Set<string> {
  return new Set([
    'nodeId',
    'type',
    'dependsOn',
    'skill',
    'agent',
    'operations',
    'task',
    'topic',
    'routingActions',
    'channels',
    'jumps',
    'route',
    'retryCount',
  ]);
}

/** Compile-time exhaustiveness: referenced key sets must be real INodeDetail fields. */
function assertKeysCovered(keys: Set<string>): void {
  // Typed record: TS errors at compile time if any literal is not an actual field.
  const detailRecord: Record<keyof INodeDetail, true> = {
    nodeId: true,
    type: true,
    dependsOn: true,
    skill: true,
    agent: true,
    operations: true,
    task: true,
    topic: true,
    routingActions: true,
    channels: true,
    jumps: true,
    route: true,
    retryCount: true,
  };
  const baseRecord: Record<keyof IBaseNodeDetail, true> = {
    nodeId: true,
    type: true,
    dependsOn: true,
    skill: true,
    operations: true,
    retryCount: true,
  };
  const detailKeys = new Set(Object.keys(detailRecord));
  const baseKeys = new Set(Object.keys(baseRecord));
  for (const k of keys) {
    if (!detailKeys.has(k)) throw new Error(`contract-doc-guard: "${k}" is not an INodeDetail field`);
    if (
      !baseKeys.has(k) &&
      k !== 'agent' &&
      k !== 'task' &&
      k !== 'topic' &&
      k !== 'routingActions' &&
      k !== 'channels' &&
      k !== 'jumps' &&
      k !== 'route'
    ) {
      throw new Error(`contract-doc-guard: "${k}" is not an IBaseNodeDetail field`);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contract doc guard — atom-phase-handler NODE-SCHEMA.md', () => {
  const md = readSkill(HANDLER_SKILL);
  const tsBase = baseNodeDetailKeys();
  const tsAll = nodeDetailKeys();

  it('guard key sets stay valid against TS types', () => {
    assertKeysCovered(tsBase);
    assertKeysCovered(tsAll);
  });

  it('NodeDetail base field table matches IBaseNodeDetail', () => {
    const baseTable = findTable(md, 'Field');
    expect(baseTable, 'NodeDetail base table not found').toBeDefined();
    // Header row: [Field, Type, Required, Purpose] — body rows start after.
    // Continuation rows render as `||`field`|…` (empty first cell, field in
    // column 2) — read the field from either column.
    const docFields = new Set(
      baseTable!.rows
        .slice(1)
        .map((r) => (r[0] !== '' ? r[0] : (r[1] ?? '')))
        .filter((f) => f !== ''),
    );
    // `handlerSkill` was retired from the TS types by engine-skill-decoupling
    // (the dispatch handler is the constant atom-phase-handler, agent-side
    // knowledge); the graph-workflow NODE-SCHEMA.md table is updated by the
    // doc-sync task — tolerated here until then.
    const retiredDocFields = new Set(['handlerSkill']);
    const missingInDoc = [...tsBase].filter((f) => !docFields.has(f));
    const extraInDoc = [...docFields].filter((f) => !tsBase.has(f) && !retiredDocFields.has(f));
    expect(missingInDoc, `TS base fields absent from SKILL.md: ${missingInDoc.join(', ')}`).toEqual([]);
    expect(extraInDoc, `SKILL.md base fields absent from TS: ${extraInDoc.join(', ')}`).toEqual([]);
  });

  it('NodeDetail type-specific field table stays within INodeDetail', () => {
    const tsFields = nodeDetailKeys();
    const allTables = parseTables(md);
    // Type-specific table = the table whose header is [Field, Type, Phase type, …]
    // (base table header is [Field, Type, Required, …]; rows never carry phase types)
    const typeSpecific = allTables.find(
      (t) => t.rows[0]?.[0]?.toLowerCase() === 'field' && t.rows[0]?.[2]?.toLowerCase() === 'phase type',
    );
    expect(typeSpecific, 'type-specific fields table not found').toBeDefined();
    const docFields = typeSpecific!.rows
      .slice(1)
      .map((r) => r[0])
      .filter((f) => f !== '');
    for (const f of docFields) {
      expect(tsFields.has(f), `SKILL.md type-specific field "${f}" missing from INodeDetail`).toBe(true);
    }
  });

  it('fsmState table matches FsmStatus values (idle/running/completed/terminated)', () => {
    const fsmTable = findTable(md, 'fsmstate');
    expect(fsmTable, 'fsmState logic table not found').toBeDefined();
    const docStates = new Set(
      fsmTable!.rows
        .slice(1)
        .map((r) => r[0])
        .filter((f) => f !== ''),
    );
    const actual = new Set(['idle', 'running', 'completed', 'terminated']);
    expect([...docStates].sort()).toEqual([...actual].sort());
  });

  it('node status list matches NodeStateSchema.status exactly', () => {
    const schemaStatuses = NodeStateSchema.shape.status.options;
    const nodesRow = parseTables(md)
      .flatMap((t) => t.rows)
      .find((r) => r[0] === 'nodes');
    expect(nodesRow, 'snapshot nodes row not found').toBeDefined();
    const rowText = nodesRow!.join(' ');

    const missing = schemaStatuses.filter((s) => !rowText.includes(s));
    expect(missing, `schema statuses absent from snapshot docs: ${missing.join(', ')}`).toEqual([]);

    // No extra status values in the doc list
    const extra = ['failed', 'paused'].filter((s) => rowText.includes(s));
    expect(extra, `non-FSM status values present in snapshot docs: ${extra.join(', ')}`).toEqual([]);
  });

  it('node status list matches runtime FSM production points (three-way)', () => {
    // Derive the node-status set the FSM actually writes from transition.ts:
    // only `status:` literals inside node-map object literals (`phases[...]` /
    // `map[...]` assignments) count — run-level fsmState writes (state returns,
    // persist_run_state effects, type annotations) are excluded.
    const fsmSrc = readFileSync(join(__dirname, '..', 'src', 'fsm', 'transition.ts'), 'utf-8');
    const produced = new Set<string>();
    // Walk lines with a literal-state flag: once a node-map assignment opens
    // (`phases[...] = {` / `map[...] = {`), collect status literals until the
    // object closes (`};`). Run-level writes (state returns, effects, type
    // annotations) never appear inside node-map literals.
    let inNodeLiteral = false;
    for (const line of fsmSrc.split('\n')) {
      if (!inNodeLiteral && /(phases\[|map\[)[^=]*=\s*\{/.test(line)) {
        inNodeLiteral = true;
      }
      if (inNodeLiteral) {
        for (const m of line.matchAll(/'([a-z]+)'/g)) produced.add(m[1]);
        if (/};/.test(line)) inNodeLiteral = false;
      }
    }

    const schemaSet = new Set(NodeStateSchema.shape.status.options as readonly string[]);
    expect([...produced].sort(), 'FSM production points differ from NodeStateSchema.status').toEqual(
      [...schemaSet].sort(),
    );

    // Doc status list (backticked values in the nodes row) must equal the schema set.
    const nodesRow = parseTables(md)
      .flatMap((t) => t.rows)
      .find((r) => r[0] === 'nodes');
    expect(nodesRow, 'snapshot nodes row not found').toBeDefined();
    // Doc status list: parseTables strips backticks and mangles escaped pipes,
    // so extract backticked tokens from the raw SKILL.md nodes row instead.
    const rawNodesRow = md.split('\n').find((l) => l.includes('Node status values:'));
    expect(rawNodesRow, 'snapshot nodes row not found').toBeDefined();
    const afterLabel = rawNodesRow!.slice(rawNodesRow!.indexOf('Node status values:'));
    const docValues = new Set(
      [...afterLabel.matchAll(/`([a-z]+)`/g)]
        .map((m) => m[1])
        .filter((s) => s !== 'completed')
        // Negated mentions ("No `skipped` status exists") are prose, not status values
        .filter((s) => !new RegExp(`No \\\`${s}\\\``).test(afterLabel)),
    );
    expect([...docValues].sort(), 'snapshot doc status values differ from NodeStateSchema.status').toEqual(
      [...schemaSet].sort(),
    );
  });
});

describe('contract doc guard — atom-pilot SKILL.md', () => {
  const md = readSkill(PILOT_SKILL);

  it('skip parameter documented only with implementation (GraphAdvanceSchema)', () => {
    // Schema lives in server.ts — import would boot the MCP server; read the source text instead.
    const serverSrc = readFileSync(join(__dirname, '..', 'server.ts'), 'utf-8');
    const schemaHasSkip = /GraphAdvanceSchema[\s\S]*?skip:\s*z\s*\.\s*boolean\s*\(\s*\)\s*\.\s*optional\s*\(\s*\)/.test(
      serverSrc,
    );
    const docHasSkip = /\bskip\?/.test(md);

    if (schemaHasSkip) {
      expect(docHasSkip, 'skip implemented in schema but not documented in atom-pilot SKILL.md').toBe(true);
    } else {
      expect(docHasSkip, 'skip documented in atom-pilot SKILL.md but absent from GraphAdvanceSchema').toBe(false);
    }
  });

  it('retry fallback wording does not claim snapshot carries dependsOn', () => {
    const snapshotHasDependsOnClaim = /snapshot[\s\S]{0,200}dependsOn\[0\]/.test(md);
    expect(snapshotHasDependsOnClaim).toBe(false);
  });
});

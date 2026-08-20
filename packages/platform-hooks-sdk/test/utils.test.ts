/**
 * Shared utils authoritative tests — the single home of the
 * display-render + tool-prefix behavior pins (migrated from the
 * graph-fidelity / graph-fidelity-context parity test pairs, round 18,
 * change graph-fidelity-context-r18-fixes). Consumer packages deleted
 * their mirrored tests; these pins are the contract.
 */

import { describe, expect, it } from 'vitest';
import {
  isControlPlaneTool,
  prefixClassOf,
  renderBenefitSegment,
  renderCompact,
  toLandingInput,
} from '../src/utils/index.js';

describe('renderCompact — compact number formatting (k/m, .0 trim, bare below 1k)', () => {
  it('formats k/m with one decimal, trimming trailing .0; bare integers below 1k', () => {
    expect(renderCompact(12_400)).toBe('12.4k');
    expect(renderCompact(55_700)).toBe('55.7k');
    expect(renderCompact(1_100)).toBe('1.1k');
    expect(renderCompact(2_000_000)).toBe('2m');
    expect(renderCompact(900)).toBe('900');
    expect(renderCompact(68_100)).toBe('68.1k');
  });
});

describe('renderBenefitSegment — value-ratio benefit graphic', () => {
  it('renders the value-ratio graphic with dual compact numbers when exact tokens exist', () => {
    expect(
      renderBenefitSegment({ currentTokens: 12_400, savedTokens: 55_700, currentChars: 12_400, savedChars: 55_700 }),
    ).toBe('│█░░░░░░░│ 12.4k/68.1k');
  });

  it('renders the graphic ratio-only when no exact token figures exist', () => {
    expect(renderBenefitSegment({ currentChars: 300, savedChars: 700 })).toBe('│██░░░░░░│');
  });

  it('omits the segment when saved = 0 (no benefit — round-10 ruling)', () => {
    expect(renderBenefitSegment({ currentChars: 100, savedChars: 0 })).toBeUndefined();
    expect(renderBenefitSegment(undefined)).toBeUndefined();
  });

  it('renders a zero-current bar when benefit exists (all saved)', () => {
    expect(renderBenefitSegment({ currentTokens: 0, savedTokens: 55_700, currentChars: 0, savedChars: 55_700 })).toBe(
      '│░░░░░░░░│ 0/55.7k',
    );
  });
});

describe('prefixClassOf — tool-name prefix class derivation (platform naming conventions)', () => {
  it('mcp__ / __control__ / builtin derivation', () => {
    expect(prefixClassOf('mcp__graph_scheduler_graph_advance')).toBe('mcp');
    expect(prefixClassOf('mcp__jcodemunch_search_symbols')).toBe('mcp');
    expect(prefixClassOf('__agent__')).toBe('control');
    expect(prefixClassOf('__completion__')).toBe('control');
    expect(prefixClassOf('read')).toBe('builtin');
    expect(prefixClassOf('custom_tool')).toBe('builtin');
    expect(prefixClassOf('user_bash')).toBe('builtin');
    expect(prefixClassOf('__agent__internal')).toBe('builtin');
  });
});

describe('isControlPlaneTool — SDK single-home control-plane classifier (C1 signal)', () => {
  it('classifies the control-plane families and the __name__ convention', () => {
    expect(isControlPlaneTool('mcp__graph_scheduler_graph_advance')).toBe(true);
    expect(isControlPlaneTool('mcp__graph_scheduler_node_advance')).toBe(true);
    expect(isControlPlaneTool('task')).toBe(true);
    expect(isControlPlaneTool('ask')).toBe(true);
    expect(isControlPlaneTool('approval')).toBe(true);
    expect(isControlPlaneTool('__agent__')).toBe(true);
    expect(isControlPlaneTool('__completion__')).toBe(true);
  });

  it('leaves regular tools out of the control plane (MCP bridge stays mcp)', () => {
    expect(isControlPlaneTool('read')).toBe(false);
    expect(isControlPlaneTool('edit')).toBe(false);
    expect(isControlPlaneTool('custom_tool')).toBe(false);
    expect(isControlPlaneTool('user_bash')).toBe(false);
    expect(isControlPlaneTool('mcp__jcodemunch_search_symbols')).toBe(false);
    expect(isControlPlaneTool('__agent__internal')).toBe(false);
  });
});

describe('toLandingInput — canonical tool_result → landing input translation (sdk-surface-convergence single home)', () => {
  it('normalizes content block arrays to text-like records (loose extras preserved)', () => {
    const out = toLandingInput({
      toolName: 'read',
      content: [{ type: 'text', text: 'a' }, { extra: true }, 'plain'],
      args: { path: 'x.ts' },
    });
    expect(out.content).toEqual([{ type: 'text', text: 'a' }, { extra: true }, { text: 'plain' }]);
  });

  it('wraps string content into a single text block', () => {
    const out = toLandingInput({ toolName: 'read', content: 'raw string' });
    expect(out.content).toEqual([{ type: 'text', text: 'raw string' }]);
  });

  it('defaults missing content to an empty array', () => {
    const out = toLandingInput({ toolName: 'read' });
    expect(out.content).toEqual([]);
  });

  it('passes args through as a record; non-record args default to {}', () => {
    expect(toLandingInput({ toolName: 'read', args: { path: 'x' } }).input).toEqual({ path: 'x' });
    expect(toLandingInput({ toolName: 'read', args: 'nope' }).input).toEqual({});
  });

  it('carries isError and the tool-name prefix class (additive signal)', () => {
    const err = toLandingInput({ toolName: 'read', isError: true });
    expect(err.isError).toBe(true);
    expect(err.toolNamePrefixClass).toBe('builtin');
    expect(toLandingInput({ toolName: 'mcp__jcodemunch_search_symbols' }).toolNamePrefixClass).toBe('mcp');
  });

  it('never rides the useless flag (dropped by the canonical decode)', () => {
    const out = toLandingInput({ toolName: 'read', useless: true } as unknown as Parameters<typeof toLandingInput>[0]);
    expect(out.useless).toBeUndefined();
  });
});

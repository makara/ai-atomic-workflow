/**
 * Built-in hints classification pins — the ToolHints contract surface
 * (type-only, ToolDeny-shaped) and the pure classification decision:
 * tool name + args → hint text | none. Data-driven three-class
 * vocabulary (write/content-read → serena; locate incl. bash first
 * token → jcodemunch), platform-evidenced, no speculative entries.
 * Hint text equals user-level guidance; frequency is not constrained
 * by the interface.
 *
 * Pure: no I/O, no platform imports — classification only.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import {
  EXIT_LINE_MATCHER,
  INTERNAL_URI_SCHEMES,
  LOCATE_CLI_TOKENS,
  LOCATE_HINT_TOOLS,
  READ_HINT_TOOLS,
  SERENA_HINT_TEXT,
  START_MARKERS,
  WRITE_HINT_TOOLS,
  classifyToolCall,
  createToolHints,
  isErrorShaped,
} from '../src/core/hints.js';
import type { HintResult, ToolHints } from '../src/interfaces/hints.js';

describe('built-in hints classification', () => {
  it('platform write tools attach the serena hint', () => {
    for (const tool of ['write', 'edit']) {
      const result = classifyToolCall(tool, { path: 'src/a.ts' });
      expect(result).toBeDefined();
      expect(result?.kind).toBe('serena');
      expect(result?.text).toContain('serena');
    }
  });

  it('platform content-read tool attaches the serena hint', () => {
    const result = classifyToolCall('read', { path: 'src/a.ts' });
    expect(result?.kind).toBe('serena');
    expect(result?.text).toContain('serena');
  });

  it('platform locate/search tools attach the jcodemunch hint', () => {
    for (const tool of ['glob', 'grep']) {
      const result = classifyToolCall(tool, {});
      expect(result?.kind).toBe('jcodemunch');
      expect(result?.text).toContain('jcodemunch');
    }
  });

  it('bash locate commands attach the jcodemunch hint (first token)', () => {
    for (const command of ['find . -name "*.ts"', 'ls src/', 'fd tsconfig', 'rg "TODO" src', 'ag foo', 'tree src']) {
      const result = classifyToolCall('bash', { command });
      expect(result?.kind, command).toBe('jcodemunch');
    }
  });

  it('bash non-locate commands attach nothing', () => {
    for (const command of ['cat src/a.ts', 'yarn test', 'echo hi', 'git status']) {
      expect(classifyToolCall('bash', { command }), command).toBeUndefined();
    }
  });

  it('non-classified tools attach nothing', () => {
    for (const tool of ['task', 'hub', 'web_search', 'graph_start', 'read_file']) {
      expect(classifyToolCall(tool, {}), tool).toBeUndefined();
    }
  });

  it('pathless and argless invocations still classify by tool name', () => {
    expect(classifyToolCall('write')).toBeDefined();
    expect(classifyToolCall('bash', {})).toBeUndefined();
  });

  it('internal-URI routes (12 schemes) attach nothing for write/content-read', () => {
    for (const scheme of Object.keys(INTERNAL_URI_SCHEMES)) {
      expect(classifyToolCall('read', { path: `${scheme}://anything` }), scheme).toBeUndefined();
      expect(classifyToolCall('write', { path: `${scheme}://anything` }), scheme).toBeUndefined();
      expect(classifyToolCall('edit', { path: `${scheme}://anything` }), scheme).toBeUndefined();
    }
    // the original MCP proxy surface stays covered explicitly
    expect(classifyToolCall('write', { path: 'xd://mcp__graph_scheduler_graph_advance' })).toBeUndefined();
  });

  it('bare scheme prefix without :// does not skip (:// form required)', () => {
    expect(classifyToolCall('read', { path: 'skill:atom-kernel' })?.kind).toBe('serena');
    expect(classifyToolCall('read', { path: 'skill' })?.kind).toBe('serena');
    expect(classifyToolCall('read', { path: 'xd:plain' })?.kind).toBe('serena');
  });

  it('URL, ssh, and file paths keep the serena hint (round-2 self-qualified ruling)', () => {
    expect(classifyToolCall('read', { path: 'https://example.com/doc.md' })?.kind).toBe('serena');
    expect(classifyToolCall('read', { path: 'http://example.com/doc.md' })?.kind).toBe('serena');
    expect(classifyToolCall('read', { path: 'ssh://host/etc/file.ts' })?.kind).toBe('serena');
    expect(classifyToolCall('read', { path: 'src/a.ts' })?.kind).toBe('serena');
    expect(classifyToolCall('write', { path: 'docs/report.md' })?.kind).toBe('serena');
  });

  it('locate classes are unaffected by xd:// routes', () => {
    expect(classifyToolCall('glob', { path: 'xd://anything' })?.kind).toBe('jcodemunch');
    expect(classifyToolCall('bash', { command: 'ls xd://foo' })?.kind).toBe('jcodemunch');
  });

  it('rtk wrapper prefix is stripped before CLI locate matching', () => {
    expect(classifyToolCall('bash', { command: 'rtk ls src' })?.kind).toBe('jcodemunch');
    expect(classifyToolCall('bash', { command: 'rtk find . -name "*.ts"' })?.kind).toBe('jcodemunch');
    expect(classifyToolCall('bash', { command: 'rtk proxy find . -name "*.ts"' })?.kind).toBe('jcodemunch');
    expect(classifyToolCall('bash', { command: 'rtk proxy ls src' })?.kind).toBe('jcodemunch');
  });

  it('bare rtk wrapper or non-locate rtk commands attach nothing', () => {
    expect(classifyToolCall('bash', { command: 'rtk' })).toBeUndefined();
    expect(classifyToolCall('bash', { command: 'rtk proxy' })).toBeUndefined();
    expect(classifyToolCall('bash', { command: 'rtk yarn test' })).toBeUndefined();
    expect(classifyToolCall('bash', { command: 'rtk git status' })).toBeUndefined();
    // bare `proxy` without `rtk` must NOT strip — the proxy skip only fires
    // after an rtk token, and `proxy` is not a locate token.
    expect(classifyToolCall('bash', { command: 'proxy ls src' })).toBeUndefined();
  });

  it('internal-URI routes attach nothing via the filePath key (opencode edit shape)', () => {
    expect(classifyToolCall('edit', { filePath: 'skill://some-skill' })).toBeUndefined();
    expect(classifyToolCall('edit', { filePath: 'xd://mcp__serena_read_file' })).toBeUndefined();
    expect(classifyToolCall('edit', { filePath: 'src/a.ts' })).toEqual({ kind: 'serena', text: SERENA_HINT_TEXT });
    expect(classifyToolCall('edit', { path: 'memory://x', filePath: 'src/b.ts' })).toBeUndefined();
  });

  it('vocabulary is platform-evidenced and exact', () => {
    expect([...WRITE_HINT_TOOLS].sort()).toEqual(['edit', 'write']);
    expect([...READ_HINT_TOOLS].sort()).toEqual(['read']);
    expect([...LOCATE_HINT_TOOLS].sort()).toEqual(['glob', 'grep']);
    expect([...LOCATE_CLI_TOKENS].sort()).toEqual(['ag', 'fd', 'find', 'ls', 'rg', 'tree']);
    expect(Object.keys(INTERNAL_URI_SCHEMES).sort()).toEqual([
      'agent',
      'artifact',
      'history',
      'issue',
      'local',
      'mcp',
      'memory',
      'omp',
      'pr',
      'rule',
      'skill',
      'xd',
    ]);
  });
});

describe('isErrorShaped — content-embedded error detection', () => {
  it('recognizes the live-measured error markers', () => {
    expect(isErrorShaped('Invalid args for xd://mcp__serena_search_for_pattern: Validation failed')).toBe(true);
    expect(isErrorShaped('The answer is too long (10904 characters). You can adjust your query.')).toBe(true);
    expect(isErrorShaped('Command exited with code 2')).toBe(true);
  });

  it('ignores leading whitespace before the marker', () => {
    expect(isErrorShaped('\n  Invalid args …')).toBe(true);
  });

  it('treats ordinary content as not error-shaped', () => {
    expect(isErrorShaped('ORIGINAL CONTENT')).toBe(false);
    expect(isErrorShaped('')).toBe(false);
    expect(isErrorShaped('The answer is fine')).toBe(false);
    expect(isErrorShaped('some text with Invalid args inside')).toBe(false);
  });

  it('start-anchored markers match only at the beginning (serena shape)', () => {
    expect(isErrorShaped('Invalid args: expected string')).toBe(true);
    expect(isErrorShaped('The answer is too long. Retry with a narrower read.')).toBe(true);
    expect(isErrorShaped('prefix Invalid args')).toBe(false);
  });

  it('exit-code marker matches the line-anchored shape (stdout-first bash shape)', () => {
    expect(isErrorShaped('Command exited with code 1')).toBe(true);
    expect(isErrorShaped('ls: /definitely-not-exist: No such file or directory\n\nCommand exited with code 1')).toBe(
      true,
    );
    expect(isErrorShaped('stdout line\nWall time: 0.09 seconds\n\nCommand exited with code 2\n')).toBe(true);
    expect(isErrorShaped('stdout line\nCommand exited with code 255')).toBe(true);
  });

  it('prose mentions of the exit phrase do not suppress attachment (round-6 shape fix)', () => {
    expect(isErrorShaped('the exit-code marker (`Command exited with code`) anywhere in the text')).toBe(false);
    expect(isErrorShaped('The docs say Command exited with code is a platform line.')).toBe(false);
    expect(isErrorShaped('Command exited with code')).toBe(false);
    expect(isErrorShaped('Command exited with code!')).toBe(false);
  });

  it('non-string input fails open (never throws)', () => {
    expect(isErrorShaped(undefined)).toBe(false);
    expect(isErrorShaped(null)).toBe(false);
    expect(isErrorShaped(42)).toBe(false);
    expect(isErrorShaped({ text: 'Invalid args' })).toBe(false);
  });

  it('error-marker vocabulary is exact and platform-observed', () => {
    expect([...START_MARKERS].sort()).toEqual(['Invalid args', 'The answer is too long']);
    expect(EXIT_LINE_MATCHER.source).toBe('^Command exited with code \\d+$');
  });
});

describe('ToolHints contract', () => {
  it('factory returns a contract-shaped ToolHints delegating to classification', () => {
    const hints: ToolHints = createToolHints();
    const input = { toolName: 'write', args: { path: 'src/a.ts' } };
    const result = hints.hints(input);
    expect(result).toBeDefined();
    expect(result?.kind).toBe('serena');
    expect(result).toMatchObject<Partial<HintResult>>({
      kind: 'serena',
      text: expect.stringContaining('serena') as string,
    });
  });

  it('hint text reads as user-level guidance (LLM consumer)', () => {
    const serena = classifyToolCall('read', { path: 'x' })?.text ?? '';
    const locate = classifyToolCall('glob', {})?.text ?? '';
    expect(serena.toLowerCase()).toContain('next time');
    expect(locate.toLowerCase()).toContain('next time');
    expect(serena).not.toContain('agent hints');
    expect(locate).not.toContain('agent hints');
  });
});

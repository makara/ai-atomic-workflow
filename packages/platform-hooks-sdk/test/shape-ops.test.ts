/**
 * Shape-op convergence (ticket 01) — the adapter-local shape work is ONE
 * parametric implementation in the pure core (`core/shape-ops.ts`); the
 * face descriptors (`OMP_SHAPE` / `OPENCODE_SHAPE`) are thin wiring.
 * Byte-identity: both faces produce identical text/workingText/ids/
 * isToolResult/appendLine for equivalent containers, and the single-message
 * normalize honors the platform toolResult shape.
 *
 * R2-only ops (error classifier, mode env read, protection plumbing)
 * were removed with the R2/R1 decoupling (ADR 0175); the runtime shape
 * seam is R1-only.
 */
import { describe, expect, it } from 'vitest';
import { OMP_SHAPE, ompMessageText, ompWorkingText, type OmpAgentMessage } from '../src/adapters/omp.js';
import {
  OPENCODE_SHAPE,
  opencodeMessageText,
  opencodeWorkingText,
  type OpencodeMessage,
} from '../src/adapters/opencode.js';
import { SEAM_MARKER } from '../src/core/discipline.js';
import {
  appendSeamLine,
  isToolResultMessage,
  joinTextChunks,
  joinWorkingText,
  toolResultIdsOf,
  type ChunkLike,
} from '../src/core/shape-ops.js';
import { normalizeToEchoMessages } from '../src/core/shapes.js';

/**
 * The descriptor interfaces are read-only subset views (the adapter casts
 * its own content through the same view) — full platform block/part shapes
 * (toolCallId, content, isError, …) enter through the same view pattern.
 */
const asOmp = (m: {
  role?: string;
  content?: unknown[] | string;
  parts?: unknown[];
  toolCallId?: string;
  toolName?: string;
}): OmpAgentMessage => m as unknown as OmpAgentMessage;
const asOc = (m: { role?: string; info?: { role?: string }; parts?: unknown[] }): OpencodeMessage =>
  m as unknown as OpencodeMessage;

describe('shared text join (op 1)', () => {
  it('equivalent text containers produce identical joined text on both faces', () => {
    const omp = ompMessageText(
      asOmp({
        role: 'user',
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      }),
    );
    const oc = opencodeMessageText(
      asOc({
        role: 'user',
        parts: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      }),
    );
    expect(oc).toBe(omp);
    expect(omp).toBe('a\nb');
  });

  it('OMP string content and a single opencode text part join identically', () => {
    expect(ompMessageText(asOmp({ role: 'user', content: 'plain' }))).toBe(
      opencodeMessageText(asOc({ role: 'user', parts: [{ type: 'text', text: 'plain' }] })),
    );
  });

  it('no text chunks → null on both faces (non-text chunks skipped)', () => {
    expect(
      ompMessageText(asOmp({ role: 'user', content: [{ type: 'tool-result', toolCallId: 'r1', content: 'x' }] })),
    ).toBeNull();
    expect(
      opencodeMessageText(asOc({ role: 'user', parts: [{ type: 'tool', toolCallId: 'r1', content: 'x' }] })),
    ).toBeNull();
  });

  it('core join ignores null chunks (graceful no-op)', () => {
    expect(joinTextChunks([null, { type: 'text', text: 'x' }])).toBe('x');
  });
});

describe('shared working text (op 2)', () => {
  it('equivalent tool-result containers produce identical working text', () => {
    const omp = ompWorkingText(
      asOmp({ role: 'user', content: [{ type: 'tool-result', toolCallId: 'r1', content: 'result one' }] }),
    );
    const oc = opencodeWorkingText(
      asOc({ role: 'user', parts: [{ type: 'tool', toolCallId: 'r1', content: 'result one' }] }),
    );
    expect(oc).toBe(omp);
    expect(omp).toBe('result one');
  });

  it('text-only containers fall back to the plain text join identically', () => {
    const omp = ompWorkingText(asOmp({ role: 'user', content: [{ type: 'text', text: 'note' }] }));
    const oc = opencodeWorkingText(asOc({ role: 'user', parts: [{ type: 'text', text: 'note' }] }));
    expect(oc).toBe(omp);
    expect(omp).toBe('note');
  });

  it('empty containers produce empty working text (never null)', () => {
    expect(ompWorkingText(asOmp({ role: 'user' }))).toBe('');
    expect(opencodeWorkingText(asOc({ role: 'user' }))).toBe('');
  });

  it('parametric join honors includePlainText (opencode mixes text parts, OMP does not)', () => {
    const chunks: readonly ChunkLike[] = [
      { type: 'tool-result', toolCallId: 'r1', content: 'tool' },
      { type: 'text', text: 'note' },
    ];
    const isTool = (c: ChunkLike): boolean => c['type'] === 'tool-result';
    expect(joinWorkingText(chunks, 'plain', isTool, false)).toBe('tool');
    expect(joinWorkingText(chunks, 'plain', isTool, true)).toBe('tool\nnote');
  });
});

describe('shared result-id scan (op 3)', () => {
  it('equivalent tool-result containers produce identical id lists', () => {
    const omp = OMP_SHAPE.toolResultIds(
      asOmp({ role: 'user', content: [{ type: 'tool-result', toolCallId: 'r1', content: 'x' }] }),
    );
    const oc = OPENCODE_SHAPE.toolResultIds(
      asOc({ role: 'user', parts: [{ type: 'tool', toolCallId: 'r1', content: 'x' }] }),
    );
    expect(oc).toEqual(omp);
    expect(omp).toEqual(['r1']);
  });

  it('kebab-case id keys scan identically on both faces', () => {
    const omp = OMP_SHAPE.toolResultIds(
      asOmp({ content: [{ type: 'tool-result', 'tool-call-id': 'r2', content: 'x' }] }),
    );
    const oc = OPENCODE_SHAPE.toolResultIds(asOc({ parts: [{ type: 'tool', 'tool-call-id': 'r2', content: 'x' }] }));
    expect(oc).toEqual(omp);
    expect(omp).toEqual(['r2']);
  });

  it('non-string ids are ignored — no crash, no match (both faces)', () => {
    expect(
      OMP_SHAPE.toolResultIds(asOmp({ content: [{ type: 'tool-result', toolCallId: 42, content: 'x' }] })),
    ).toEqual([]);
    expect(OPENCODE_SHAPE.toolResultIds(asOc({ parts: [{ type: 'tool', toolCallId: 42, content: 'x' }] }))).toEqual([]);
  });

  it('parametric scan skips the face call evidence (OMP blocks / opencode non-tool parts)', () => {
    expect(
      toolResultIdsOf(
        [{ type: 'tool-call', id: 'c1', name: 'read' } as ChunkLike, { type: 'tool-result', toolCallId: 'r1' }],
        (c) => c['type'] === 'tool-call' || c['type'] === 'function-call',
      ),
    ).toEqual(['r1']);
  });
});

describe('shared tool-result classifier (op 4)', () => {
  it('equivalent containers classify identically on both faces', () => {
    expect(OMP_SHAPE.isToolResult(asOmp({ role: 'user', content: [{ type: 'tool-result', toolCallId: 'r1' }] }))).toBe(
      true,
    );
    expect(OPENCODE_SHAPE.isToolResult(asOc({ role: 'user', parts: [{ type: 'tool', toolCallId: 'r1' }] }))).toBe(true);
    expect(OMP_SHAPE.isToolResult(asOmp({ role: 'user', content: [{ type: 'text', text: 'x' }] }))).toBe(false);
    expect(OPENCODE_SHAPE.isToolResult(asOc({ role: 'user', parts: [{ type: 'text', text: 'x' }] }))).toBe(false);
  });

  it('platform toolResult role is a working-face tool result (OMP-only role)', () => {
    expect(OMP_SHAPE.isToolResult(asOmp({ role: 'toolResult', content: 'plain' }))).toBe(true);
  });

  it('parametric classifier — role + evidence matrix', () => {
    expect(isToolResultMessage('toolResult', false)).toBe(true);
    expect(isToolResultMessage('user', true)).toBe(true);
    expect(isToolResultMessage('user', false)).toBe(false);
    expect(isToolResultMessage('assistant', true)).toBe(false);
    expect(isToolResultMessage(undefined, false)).toBe(false);
  });
});

describe('shared seam-line append (op 6)', () => {
  it('equivalent containers append the identical text chunk', () => {
    const omp = OMP_SHAPE.appendLine(asOmp({ role: 'user', content: [{ type: 'text', text: 'a' }] }), 'line');
    const oc = OPENCODE_SHAPE.appendLine(asOc({ role: 'user', parts: [{ type: 'text', text: 'a' }] }), 'line');
    expect(omp).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'line' },
      ],
    });
    expect(oc).toEqual({
      role: 'user',
      parts: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'line' },
      ],
    });
  });

  it('strips stale seam lines before appending (both faces, in place)', () => {
    const stale = `a\n${SEAM_MARKER} stale`;
    const omp = OMP_SHAPE.appendLine(asOmp({ role: 'user', content: [{ type: 'text', text: stale }] }), 'fresh');
    const oc = OPENCODE_SHAPE.appendLine(asOc({ role: 'user', parts: [{ type: 'text', text: stale }] }), 'fresh');
    expect(omp).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'fresh' },
      ],
    });
    expect(oc).toEqual({
      role: 'user',
      parts: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'fresh' },
      ],
    });
  });

  it('parametric append falls back to string content when no chunk target applies (OMP string form)', () => {
    const out = appendSeamLine<{ role: string; content: string }, ChunkLike>(
      { role: 'user', content: 'base' },
      'line',
      [{ chunks: undefined, rebuild: () => ({ role: 'user', content: '' }) }],
      'base',
      (text) => ({ role: 'user', content: text }),
    );
    expect(out).toEqual({ role: 'user', content: 'base\nline' });
  });
});

describe('batch normalize (op 8)', () => {
  it('batch normalize maps the whole transcript to the echo contract (no protection fields)', () => {
    const echoMessages = normalizeToEchoMessages(
      [
        asOmp({ role: 'user', content: [{ type: 'text', text: 'a' }] }),
        asOmp({ role: 'toolResult', toolCallId: 't1', toolName: 'write', content: [{ type: 'text', text: 'r' }] }),
      ],
      OMP_SHAPE,
    );
    expect(echoMessages).toHaveLength(2);
    expect(echoMessages[0]).toEqual({ role: 'user', text: 'a', isToolResult: false, toolResultIds: [] });
    expect(echoMessages[1]).toEqual({ role: 'toolResult', text: 'r', isToolResult: true, toolResultIds: [] });
    expect('protected' in (echoMessages[1] as Record<string, unknown>)).toBe(false);
  });
});

/**
 * OMP face — real platform contract adapter. Thin mapping shell:
 * normalize → the single core chain (`applyFidelityChain`, echo-only)
 * → denormalize + hook registration (PCL mark, resident, tool_result
 * hints). All branching lives in `core/`. Text-level only, graceful
 * no-op on any error. Hints (ADR 0178) attach user-level guidance once
 * per successful tool execution via the post-execution tool_result
 * hook.
 *
 * R2 wiring (settlement, metering, landing/prewarm, boundary tracking,
 * observability counters) was disconnected with the R2/R1 decoupling
 * (ADR 0175) — the runtime path is R1 only; the reference machinery
 * lives in `graph-fidelity-context/src/context-management/`.
 *
 * @module
 */

import type {
  ContextEventResult,
  ExtensionAPI,
  InputEvent,
  ToolResultEvent,
  ToolResultEventResult,
} from '@oh-my-pi/pi-coding-agent';
import { createToolHints, isErrorShaped } from '../core/hints.js';
import { detectPcl } from '../core/pcl.js';
import {
  appendSeamLine,
  isToolResultMessage,
  joinTextChunks,
  joinWorkingText,
  toolResultIdsOf,
  type ChunkLike,
} from '../core/shape-ops.js';
import type { DenormalizeShape } from '../core/shapes.js';
import type { DisplayFeedback } from '../interfaces/display-feedback.js';
import type { ToolHints } from '../interfaces/hints.js';
import { createSignalLifecycle } from '../interfaces/signal-lifecycle.js';
import { reportFailure } from './diagnostics.js';

/** Structural message subset (payloads are read-only here — never mutated). */
export interface OmpAgentMessage {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  parts?: Array<{ type?: string; text?: string }>;
}

export interface OmpContextEvent {
  type: 'context';
  messages: OmpAgentMessage[];
}

/** Extract text from an OMP agent message (content string | content array | parts). */
export function ompMessageText(message: OmpAgentMessage): string | null {
  const { content } = message;
  if (typeof content === 'string') return content;
  const chunks: ChunkLike[] = [];
  if (Array.isArray(content)) chunks.push(...content);
  if (Array.isArray(message.parts)) chunks.push(...message.parts);
  return joinTextChunks(chunks);
}

/**
 * Working-face text — message text PLUS tool-result block content. Thin
 * wrapper over the shared working-text op (R2 reference surface; kept for
 * shape parity).
 */
export function ompWorkingText(message: OmpAgentMessage): string {
  return joinWorkingText(contentBlocksOf(message), ompMessageText(message), isToolResultBlock, false);
}

/** Content blocks of a message (empty when the content is not an array). */
function contentBlocksOf(message: OmpAgentMessage): Array<Record<string, unknown>> {
  return Array.isArray(message.content) ? message.content : [];
}

/** Tool-result block evidence — a content block carrying result identity (OMP shape). */
const isToolResultBlock: (chunk: ChunkLike) => boolean = (chunk) =>
  'toolCallId' in chunk || chunk['type'] === 'tool-result';

/** Assistant call block evidence — the id-scan skip predicate (OMP shape). */
const isCallBlock: (chunk: ChunkLike) => boolean = (chunk) =>
  chunk['type'] === 'tool-call' || chunk['type'] === 'function-call';

/** True when a user message carries tool-result content (OMP shape). */
function hasToolResultBlock(message: OmpAgentMessage): boolean {
  return contentBlocksOf(message).some(isToolResultBlock);
}

/** The OMP container shape — one descriptor for the parametric seam (thin wiring over the shared ops). */
export const OMP_SHAPE: DenormalizeShape<OmpAgentMessage> = {
  text: ompMessageText,
  workingText: ompWorkingText,
  role: (m) => m.role,
  toolResultIds: (m) => toolResultIdsOf(contentBlocksOf(m), isCallBlock),
  isToolResult: (m) => isToolResultMessage(m.role, hasToolResultBlock(m)),
  payload: (m) => {
    const blocks = contentBlocksOf(m);
    return blocks.length > 0 ? JSON.stringify(blocks) : (ompMessageText(m) ?? undefined);
  },
  appendLine: (m, line) =>
    appendSeamLine(
      m,
      line,
      [
        {
          chunks: Array.isArray(m.content) ? m.content : undefined,
          rebuild: (chunks) => ({ ...m, content: chunks }),
        },
        {
          chunks: Array.isArray(m.parts) ? m.parts : undefined,
          rebuild: (parts) => ({ ...m, parts }),
          useWhenEmpty: true,
        },
      ],
      typeof m.content === 'string' ? m.content : '',
      (text) => ({ ...m, content: text }),
    ),
  replaceWithText: (m, text) => {
    if (Array.isArray(m.content)) return { ...m, content: [{ type: 'text', text }] };
    if (Array.isArray(m.parts)) return { ...m, parts: [{ type: 'text', text }] };
    return { ...m, content: text };
  },
};

/** Observability wiring surface — the real API narrowed to what we use. */
export type OmpObservabilityApi = Pick<ExtensionAPI, 'on' | 'appendEntry'>;

/**
 * Wire the R1 observability handler onto the platform api: mechanical PCL
 * detection, mark-only — vocabulary hits record an observability entry
 * (`graph-fidelity.pcl`) through the DisplayFeedback audit channel;
 * never `handled:true`, never modifies text, never routes. All other
 * observability wiring (usage metering, compaction outcome,
 * tool-execution counters, accumulator persistence, settle drains) was
 * removed with the R2/R1 decoupling (ADR 0175).
 */
export function wireObservability(api: OmpObservabilityApi): void {
  // The OMP audit channel — appendEntry persistence (R1 PCL mark).
  const feedback: DisplayFeedback = {
    audit: ({ record }) => api.appendEntry?.(record.type, record.payload),
  };
  // Event dispatch must never break the platform loop — graceful no-op.
  const safe =
    <A extends unknown[]>(handler: (...args: A) => void) =>
    (...args: A): void => {
      try {
        handler(...args);
      } catch {
        // graceful no-op — never break event dispatch
      }
    };

  api.on(
    'input',
    safe((event: InputEvent) => {
      // Mechanical PCL detection — mark-only: vocabulary hits record an
      // observability entry; the text is NEVER modified, `handled` is
      // never set, and nothing is routed (routing is the pilot's job).
      if (typeof event?.text !== 'string' || event.text.length === 0) return;
      const matched = detectPcl(event.text);
      if (matched !== undefined) {
        feedback.audit({ record: { type: 'graph-fidelity.pcl', payload: { text: event.text, matched } } });
      }
    }),
  );
}

/**
 * Wire the tool-result hints handler (ToolHints, ADR 0178) onto the
 * platform api: the post-execution `tool_result` event fires ONCE per
 * tool execution and carries the tool name, call id, input, and result
 * content — the platform-evidenced attach point (the context seam's
 * block-level pairing never fires on the OMP message model: tool results
 * are top-level `role: "toolResult"` messages whose content blocks are
 * text/image only). On a classified successful result the handler
 * returns a content override that APPENDS the hint text block
 * (append-only — original content preserved). Failures (`isError`) and
 * odd shapes pass through untouched; any throw degrades to no override
 * (fail-open — never breaks the platform loop).
 */
export function wireToolHints(api: Pick<ExtensionAPI, 'on'>, hints: ToolHints): void {
  api.on('tool_result', (event: ToolResultEvent) => {
    try {
      if (event?.type !== 'tool_result') return undefined;
      // Failed executions attach nothing (no guidance noise on errors).
      if ((event as { isError?: unknown }).isError === true) return undefined;
      if (typeof event.toolName !== 'string') return undefined;
      const args =
        event.input !== null && typeof event.input === 'object'
          ? (event.input as Readonly<Record<string, unknown>>)
          : undefined;
      const result = hints.hints({ toolName: event.toolName, args });
      if (result === undefined) return undefined;
      const content = Array.isArray(event.content) ? event.content : undefined;
      if (content === undefined) return undefined; // odd shape — pass through
      // Content-embedded errors (validation failures, oversized answers,
      // non-zero exits) do not set the platform isError flag — skip them
      // too so error paths carry no guidance noise.
      const joined = joinTextChunks(content) ?? '';
      if (isErrorShaped(joined)) return undefined;
      return { content: [...content, { type: 'text', text: result.text }] } satisfies ToolResultEventResult;
    } catch (err) {
      // Failure diagnostics — the hints hook must never break the tool
      // path (fail-open); one process-log line on the failure path only.
      reportFailure('tool_result hints', err);
      return undefined;
    }
  });
}

/** Extension factory — the platform's native extension shape (no options: R1 needs none). */
export default function ompExtension(pi: ExtensionAPI): void {
  // The single R1 lifecycle — assembly/echo/restore/injection (the
  // adapter routes exclusively through the interface layer, ADR 0176).
  const lifecycle = createSignalLifecycle();
  // The built-in hints (ToolHints) — user-level routing guidance
  // attached to tool-call results before they reach the LLM (R-EXT
  // hints capability). Wired unconditionally at the post-execution
  // tool_result hook (once per execution, zero state); pure
  // classification, fail-open, never breaks the platform loop.
  const hints = createToolHints();

  pi.on('context', (event: OmpContextEvent) => {
    if (event?.type !== 'context' || !Array.isArray(event.messages)) return undefined;
    try {
      const echoMessages = lifecycle.assembly({ messages: event.messages, shape: OMP_SHAPE });
      // All-roles latest frame over the TEXT-ONLY anchor surface (the OMP
      // contract — no role ordering; working text excludes plain text, so
      // the shape `text` reader anchors frames; RUN_RE + FRAME_HEADING
      // keep doc-text corruption impossible).
      const out = lifecycle.echo({
        messages: echoMessages,
        frameTexts: event.messages.map((m) => ompMessageText(m) ?? ''),
      });
      let messages: readonly OmpAgentMessage[] = event.messages;
      let changed = false;
      if (out.changed) {
        messages = lifecycle.restore({
          messages: event.messages,
          echoMessages,
          result: out.messages,
          shape: OMP_SHAPE,
        });
        changed = true;
      }
      if (!changed) return undefined;
      return {
        messages: messages as ContextEventResult['messages'],
      };
    } catch (err) {
      // Failure diagnostics — the transform chain must never break a
      // request (zero-deny); one process-log line on the failure path
      // only; nothing is injected into LLM context.
      reportFailure('context seam handler', err);
      return undefined;
    }
  });

  // PCL mark persistence (R1) — vocabulary hits record via appendEntry.
  wireObservability(pi);

  // Tool-result hints (ToolHints) — user-level routing guidance attached
  // once per successful tool execution via the post-execution tool_result
  // hook (platform-evidenced payload; per-execution → no dedup state).
  wireToolHints(pi, hints);

  // System-resident prompts — the P0 prompt class: a fixed resident block
  // injected into the SYSTEM PROMPT on every top-level turn (platform
  // rebuilds the base prompt per turn, so the per-turn append is
  // compaction-proof). Install = resident; zero deny: any throw degrades
  // to the base prompt.
  pi.on('before_agent_start', (event: { systemPrompt?: string | string[] }) => {
    try {
      const base = typeof event?.systemPrompt === 'string' ? [event.systemPrompt] : (event?.systemPrompt ?? []);
      const out = lifecycle.injection({ systemPrompts: base });
      if (!out.changed) return undefined;
      // Fresh mutable array — the platform result contract (string[]).
      return { systemPrompt: [...out.systemPrompts] };
    } catch (err) {
      reportFailure('resident prompt injection', err);
      return undefined;
    }
  });
}

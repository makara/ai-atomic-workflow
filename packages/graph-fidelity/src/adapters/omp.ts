/**
 * OMP face — real platform contract adapter.
 *
 * Default-export factory typed as `ExtensionFactory`:
 * `(pi: ExtensionAPI) => void` — the platform's native extension shape
 * (extensibility/extensions/types.ts; new authoring uses ExtensionAPI, the
 * strict superset of HookAPI). Registers the `context` seam for the
 * per-call discipline echo and lifecycle events for observability facts
 * (appendEntry persistence — the OMP-only face with a session-entry API).
 *
 * Thin adapter: payload normalization + core calls only; all branching
 * lives in `core/`. Text-level only, zero denial, graceful no-op on any
 * error.
 *
 * Distribution: `omp.extensions` manifest (installed-plugin discovery — the
 * single OMP channel, ADR 0153).
 *
 * @module
 */

import type {
  AutoCompactionEndEvent,
  ContextEventResult,
  ExtensionAPI,
  MessageEndEvent,
  ToolExecutionStartEvent,
  TtsrTriggeredEvent,
} from '@oh-my-pi/pi-coding-agent';
import { resolveEcho } from '../core/discipline.js';
import { OBSERVABILITY_TYPE, createAccumulator } from '../core/facts.js';
import type { Accumulator, EchoMessage } from '../core/types.js';

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
  const chunks: string[] = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') chunks.push(block.text);
    }
  }
  if (Array.isArray(message.parts)) {
    for (const part of message.parts) {
      if (part?.type === 'text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.length > 0 ? chunks.join('\n') : null;
}

/**
 * Apply the discipline echo to an OMP message array. Returns a replacement
 * array (the last user message's content gains the echo line), or undefined
 * when nothing changed.
 */
export function applyOmpEcho(messages: OmpAgentMessage[]): OmpAgentMessage[] | undefined {
  const echoMessages: EchoMessage[] = messages.map((m) => ({ role: m.role, text: ompMessageText(m) ?? '' }));
  const resolved = resolveEcho(echoMessages);
  if (resolved === undefined) return undefined;
  const { changedAt, line } = resolved;
  return messages.map((m, i) => {
    if (i !== changedAt) return m;
    // Preserve non-text blocks: append a text block to the existing
    // container (content array / parts array) instead of flattening.
    if (Array.isArray(m.content)) {
      return { ...m, content: [...m.content, { type: 'text', text: line }] };
    }
    if (Array.isArray(m.parts)) {
      return { ...m, parts: [...m.parts, { type: 'text', text: line }] };
    }
    const base = typeof m.content === 'string' ? m.content : '';
    const content = base.length > 0 ? `${base}\n${line}` : line;
    return { ...m, content };
  });
}

/** Observability wiring surface — the real API narrowed to what we use. */
export type OmpObservabilityApi = Pick<ExtensionAPI, 'on' | 'appendEntry'>;

/**
 * Wire observability handlers onto the platform api. Facts accumulate in
 * the supplied accumulator and are persisted to a session entry on each
 * record (appendEntry — OMP-only capability; the opencode face has no
 * session-entry API and carries audit facts via the agent-side Checks
 * block instead).
 */
export function wireObservability(
  api: OmpObservabilityApi,
  accumulator: Accumulator = createAccumulator(),
): Accumulator {
  // Event dispatch must never break the platform loop — every handler is a
  // graceful no-op on failure (same pattern as the echo seam).
  const safe =
    <A extends unknown[]>(handler: (...args: A) => void) =>
    (...args: A): void => {
      try {
        handler(...args);
      } catch {
        // graceful no-op — never break event dispatch
      }
    };
  const persist = () => api.appendEntry?.(OBSERVABILITY_TYPE, accumulator.read());

  api.on(
    'message_end',
    safe((event: MessageEndEvent) => {
      // Usage lives on assistant messages structurally; the platform's
      // AgentMessage base type does not declare it — narrow view at the
      // adapter boundary.
      const usage = (event.message as { usage?: { input?: number; cacheRead?: number; cacheWrite?: number } }).usage;
      if (!usage) return;
      accumulator.record({
        requests: 1,
        inputTokens: usage.input ?? 0,
        cacheReadTokens: usage.cacheRead ?? 0,
        cacheWriteTokens: usage.cacheWrite ?? 0,
      });
      persist();
    }),
  );

  api.on(
    'auto_compaction_end',
    safe((_event: AutoCompactionEndEvent) => {
      accumulator.record({ compactions: 1 });
      persist();
    }),
  );

  api.on(
    'ttsr_triggered',
    safe((_event: TtsrTriggeredEvent) => {
      accumulator.record({ ttsrTriggers: 1 });
      persist();
    }),
  );

  api.on(
    'tool_execution_start',
    safe((_event: ToolExecutionStartEvent) => {
      accumulator.record({ toolExecutions: 1 });
      persist();
    }),
  );

  return accumulator;
}

/** Extension factory — the platform's native extension shape. */
export default function ompExtension(pi: ExtensionAPI): void {
  pi.on('context', (event: OmpContextEvent) => {
    if (event?.type !== 'context' || !Array.isArray(event.messages)) return undefined;
    try {
      const replaced = applyOmpEcho(event.messages);
      if (replaced === undefined) return undefined;
      // Adapter boundary: replaced messages are spreads of the original
      // platform message objects (fields preserved) — view them through the
      // platform result type.
      return { messages: replaced as ContextEventResult['messages'] };
    } catch {
      return undefined; // graceful no-op — never break a request
    }
  });
  // Observability handlers are wired via the same api.
  wireObservability(pi);
}

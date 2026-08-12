/**
 * opencode face — real platform contract adapter.
 *
 * Default export `{ server: Plugin }` — the platform's npm entry shape
 * (`Plugin = (input) => Promise<Hooks>`, resolved via `exports["./server"]`
 * or main). Single `experimental.chat.messages.transform` with an explicit
 * transform chain: (1) context fidelity (identical-call dedup, errored-result
 * reduction), then (2) discipline echo (shared core `renderDisciplineLine`,
 * appended to the most recent user message).
 *
 * Byte-identical echo line with the OMP face (asserted by test). Chain order
 * asserted by test. Thin adapter: message-shape mapping + chain composition
 * only; all branching lives in `core/`.
 *
 * @module
 */

import type { Plugin } from '@opencode-ai/plugin';
import { resolveEcho } from '../core/discipline.js';
import { applySessionFidelity, buildFidelityPlan, extractToolCalls } from '../core/transform.js';
import type { EchoMessage } from '../core/types.js';

/** opencode message shape (structural). */
export interface OpencodeMessage {
  role?: string;
  parts?: Array<{ type?: string; text?: string }>;
}

/** Extract joined text parts from an opencode message. */
export function opencodeMessageText(message: OpencodeMessage): string | null {
  if (!Array.isArray(message.parts)) return null;
  const chunks: string[] = [];
  for (const part of message.parts) {
    if (part?.type === 'text' && typeof part.text === 'string') chunks.push(part.text);
  }
  return chunks.length > 0 ? chunks.join('\n') : null;
}

/**
 * Phase 1 — context fidelity. Replaces tool-result parts per the fidelity
 * plan (dedup + errored markers). Returns a new message array; original
 * messages are never mutated.
 */
export function applyFidelity(messages: OpencodeMessage[]): OpencodeMessage[] {
  const parts = messages.flatMap((m) => m.parts ?? []);
  const plan = buildFidelityPlan(extractToolCalls(parts));
  // Always run the fidelity pass — with an empty dedup plan it still
  // reduces errored tool results (plan-independent path); a transcript with
  // errored results but no call parts is still reduced.
  return messages.map((m) => {
    if (!Array.isArray(m.parts) || m.parts.length === 0) return m;
    return { ...m, parts: [...applySessionFidelity(m.parts, plan)] as OpencodeMessage['parts'] };
  });
}

/**
 * Phase 2 — discipline echo. Appends the `[seam]` text part to the most
 * recent user message, or returns the input unchanged when nothing changed.
 */
export function applyOpencodeEcho(messages: OpencodeMessage[]): OpencodeMessage[] | undefined {
  const echoMessages: EchoMessage[] = messages.map((m) => ({ role: m.role, text: opencodeMessageText(m) ?? '' }));
  const resolved = resolveEcho(echoMessages);
  if (resolved === undefined) return undefined;
  const { changedAt, line } = resolved;
  return messages.map((m, i) => {
    if (i !== changedAt) return m;
    return { ...m, parts: [...(m.parts ?? []), { type: 'text', text: line }] };
  });
}

/** Full transform chain — fidelity first, then discipline echo. */
export function applyOpenCodeTransform(messages: OpencodeMessage[]): OpencodeMessage[] {
  const afterFidelity = applyFidelity(messages);
  const echoed = applyOpencodeEcho(afterFidelity);
  return echoed === undefined ? afterFidelity : echoed;
}

const server: Plugin = async () => {
  return {
    'experimental.chat.messages.transform': async (_input, output) => {
      if (!Array.isArray(output.messages) || output.messages.length === 0) return;
      try {
        output.messages = applyOpenCodeTransform(output.messages as OpencodeMessage[]) as typeof output.messages;
      } catch {
        // graceful no-op — never break a request
      }
    },
  };
};

export default server;

/**
 * Discipline echo — the per-call mechanical derivation of the node's
 * operation boundary. Renders one `[seam]` line from the most recent
 * `## Run Frame` block in the outgoing message array and appends it to the
 * most recent user message (S1 position — the synthetic-reminder placement:
 * appended directly after the latest user message, same slot the platforms
 * use for their own reminders and notices).
 *
 * Pure: no scheduler state, no mirror, no platform imports. The handler
 * frame is the single assembly point; this module only derives from it.
 *
 * @module
 */

import type { EchoMessage, FrameClause } from './types.js';

export const SEAM_MARKER = '[seam]';

const FRAME_HEADING = '## Run Frame';
const NODE_RE = /node\s+([\w\-/]+)/;
const CLAUSE_RE = /declared operations[^\n]*/;

/**
 * Locate the most recent run-frame block in a transcript of message texts
 * and extract its node id + discipline clause.
 */
export function findFrameClause(texts: readonly string[]): FrameClause | undefined {
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    const text = texts[i];
    if (text === undefined || !text.includes(FRAME_HEADING)) continue;
    const nodeMatch = text.match(NODE_RE);
    const clauseMatch = text.match(CLAUSE_RE);
    if (!nodeMatch || !clauseMatch) continue;
    return { nodeId: nodeMatch[1], clause: clauseMatch[0] };
  }
  return undefined;
}

/**
 * Render the single discipline echo line from a transcript, or undefined
 * when no frame is present.
 */
export function renderDisciplineLine(texts: readonly string[]): string | undefined {
  const frame = findFrameClause(texts);
  if (!frame) return undefined;
  const declaration = frame.clause.replace(/^declared operations\s*/, '');
  return `${SEAM_MARKER} node ${frame.nodeId} declares ${declaration} — per run frame`;
}

/**
 * Append the discipline echo to the most recent user message.
 *
 * Returns a new array when an echo was appended, or `undefined` when
 * nothing changed (no user message, no frame, or the seam marker is already
 * present — dedup). Never mutates the input.
 */
export function applyDisciplineEcho(messages: readonly EchoMessage[]): EchoMessage[] | undefined {
  const lastUser = findLastUserIndex(messages);
  if (lastUser === -1) return undefined;
  const userText = messages[lastUser]?.text ?? '';
  if (userText.includes(SEAM_MARKER)) return undefined;
  const line = renderDisciplineLine(messages.map((m) => m.text ?? ''));
  if (line === undefined) return undefined;
  const out = messages.map((m) => ({ ...m }));
  out[lastUser] = { ...out[lastUser], text: userText.length > 0 ? `${userText}\n${line}` : line };
  return out;
}

/**
 * Resolve the echo application point for a message transcript.
 *
 * Runs the discipline echo, locates the changed (last user) message index,
 * and renders the line ONCE — adapters consume this instead of re-deriving
 * the echo themselves. Returns undefined when nothing changed.
 */
export function resolveEcho(messages: readonly EchoMessage[]): { changedAt: number; line: string } | undefined {
  const echoed = applyDisciplineEcho(messages);
  if (echoed === undefined) return undefined;
  const changedAt = echoed.findIndex((m, i) => m.text !== messages[i]?.text);
  if (changedAt === -1) return undefined;
  const line = renderDisciplineLine(messages.map((m) => m.text ?? ''));
  if (line === undefined) return undefined;
  return { changedAt, line };
}

function findLastUserIndex(messages: readonly EchoMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return i;
  }
  return -1;
}

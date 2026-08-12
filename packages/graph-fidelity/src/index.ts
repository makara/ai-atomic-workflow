/**
 * graph-fidelity — platform-seam signal discipline for graphs.
 *
 * One module, two platforms, maximum code reuse:
 * - `core/` — platform-neutral pure data core (discipline echo, context
 *   fidelity, observability facts) with the crossing data contract.
 * - `adapters/` — two thin adapters typed against the real platform
 *   contracts: `omp.ts` (OMP `ExtensionAPI` factory) and `opencode.ts`
 *   (opencode `{ server: Plugin }`).
 *
 * Per-call discipline echo: renders one `[seam]` line from the most recent
 * handler-assembled run frame and appends it to the most recent user message
 * (S1 position) on every LLM call — OMP `context` seam and opencode
 * `messages.transform`. Plus observability accumulation from platform
 * events (OMP-only persistence via `appendEntry`). Text-level only, zero
 * denial.
 *
 * @module
 */

export { applyOmpEcho, default as ompExtension, ompMessageText, wireObservability } from './adapters/omp.js';
export type { OmpAgentMessage, OmpContextEvent, OmpObservabilityApi } from './adapters/omp.js';
export {
  applyFidelity,
  applyOpenCodeTransform,
  applyOpencodeEcho,
  opencodeMessageText,
  default as opencodePlugin,
} from './adapters/opencode.js';
export type { OpencodeMessage } from './adapters/opencode.js';
export {
  SEAM_MARKER,
  applyDisciplineEcho,
  findFrameClause,
  renderDisciplineLine,
  resolveEcho,
} from './core/discipline.js';
export { OBSERVABILITY_TYPE, createAccumulator, emptyFacts, mergeFacts } from './core/facts.js';
export {
  ERROR_MARKER,
  applySessionFidelity,
  buildFidelityPlan,
  extractToolCalls,
  normalizeParams,
} from './core/transform.js';
export type { Accumulator, EchoMessage, FrameClause, ObservabilityFacts, ToolCallRecord } from './core/types.js';

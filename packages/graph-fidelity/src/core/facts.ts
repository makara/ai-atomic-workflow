/**
 * Observability facts — pure accumulation of platform lifecycle events into
 * a session-entry payload (usage, compaction, platform TTSR trigger
 * observation — the project rule file is deleted; ttsr_triggered counts
 * reflect platform-native rules only — and tool activity). The pure part
 * lives here (zero platform imports); platform wiring lives in the OMP
 * adapter (`wireObservability`), which is the only face with a native
 * session-entry API (appendEntry). Never injects into LLM context.
 *
 * @module
 */

import type { Accumulator, ObservabilityFacts } from './types.js';

export const OBSERVABILITY_TYPE = 'graph-fidelity.observability';

export function emptyFacts(): ObservabilityFacts {
  return {
    requests: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    compactions: 0,
    ttsrTriggers: 0,
    toolExecutions: 0,
  };
}

export function mergeFacts(base: ObservabilityFacts, add: Partial<ObservabilityFacts>): ObservabilityFacts {
  return {
    requests: base.requests + (add.requests ?? 0),
    inputTokens: base.inputTokens + (add.inputTokens ?? 0),
    cacheReadTokens: base.cacheReadTokens + (add.cacheReadTokens ?? 0),
    cacheWriteTokens: base.cacheWriteTokens + (add.cacheWriteTokens ?? 0),
    compactions: base.compactions + (add.compactions ?? 0),
    ttsrTriggers: base.ttsrTriggers + (add.ttsrTriggers ?? 0),
    toolExecutions: base.toolExecutions + (add.toolExecutions ?? 0),
  };
}

/** Create a persistent accumulator — injectable for tests. */
export function createAccumulator(): Accumulator {
  let facts = emptyFacts();
  return {
    read() {
      return { ...facts };
    },
    record(partial: Partial<ObservabilityFacts>) {
      facts = mergeFacts(facts, partial);
    },
  };
}

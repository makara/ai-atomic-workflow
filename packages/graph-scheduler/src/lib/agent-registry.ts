/**
 * Node type → agent config registry — builtin JSON + project overrides.
 *
 * Three-layer override system (ADR 0023 + ADR 0028):
 *   Layer 1 — builtin JSON (graphs/agent-registry.json)
 *   Layer 2 — project config.json agentRegistry (overrides builtin)
 *   Layer 3 — phase.skill field (entrySkill override in buildNodeDetail)
 *
 * loadBuiltinRegistry() reads the JSON file; mergeAgentRegistry() resolves
 * Layer 1 ∪ Layer 2; Layer 3 resolved in api/crud.ts buildNodeDetail().
 *
 * @since ADR 0028 — `strategy` removed; agentRegistry.skill is now handlerSkill.
 *   entrySkill = phase.skill ?? agentRegistry.skill.
 *
 * @module
 */

import { Context, Layer } from 'effect';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRegistryEntrySchema, type AgentRegistryEntry } from '../schemas/index.js';

// Re-export for consumers (crud.ts, scheduler-runtime.ts)
export type { AgentRegistryEntry };

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// Resolve builtin JSON path relative to this source file
const BUILTIN_JSON_PATH = resolve(MODULE_DIR, '..', '..', 'graphs', 'agent-registry.json');

// ---------------------------------------------------------------------------
// Context.Tag
// ---------------------------------------------------------------------------

/**
 * Injectable agent registry service.
 *
 * Default: builtin agent registry loaded from JSON.
 * Projects inject overrides via config.json agentRegistry.
 */
export class AgentRegistryService extends Context.Tag('AgentRegistryService')<
  AgentRegistryService,
  Map<string, AgentRegistryEntry>
>() {}

// ---------------------------------------------------------------------------
// Builtin JSON loading (lazy cached)
// ---------------------------------------------------------------------------

/** Module-level cache — populated on first call, never reloaded. */
let _builtinCache: readonly AgentRegistryEntry[] | undefined;

/**
 * Load builtin agent registry from graphs/agent-registry.json.
 *
 * Lazy-cached: first call reads JSON, subsequent calls return cached result.
 * Graceful degradation: missing/corrupt JSON logs warning + returns [].
 *
 * Contains 3 entries: main → atom-phase-main, agent → atom-phase-agent,
 * approval → atom-phase-approval (direct).
 *
 * Returns frozen readonly array for immutability.
 */
export function loadBuiltinRegistry(): readonly AgentRegistryEntry[] {
  if (_builtinCache) return _builtinCache;

  try {
    const raw = readFileSync(BUILTIN_JSON_PATH, 'utf-8');
    const rawData: unknown = JSON.parse(raw);
    if (!Array.isArray(rawData)) {
      throw new Error('Invalid agentRegistry: builtin JSON must be an array');
    }
    // Validate each entry against the schema
    const entries: AgentRegistryEntry[] = [];
    for (const entry of rawData) {
      const parsed = AgentRegistryEntrySchema.safeParse(entry);
      if (!parsed.success) {
        const fields = parsed.error.issues
          .map((i) => i.path.join('.'))
          .filter(Boolean)
          .join(', ');
        throw new Error(
          `Invalid agentRegistry entry in builtin JSON: missing required field(s) ${fields || 'unknown'}`,
        );
      }
      entries.push(parsed.data);
    }
    _builtinCache = Object.freeze(entries);
    return _builtinCache;
  } catch (err) {
    console.error('[agent-registry] Failed to load builtin JSON:', err instanceof Error ? err.message : String(err));
    _builtinCache = Object.freeze([]);
    return _builtinCache;
  }
}

// ---------------------------------------------------------------------------
// Merge & resolve
// ---------------------------------------------------------------------------
export function mergeAgentRegistry(
  builtin: readonly AgentRegistryEntry[],
  project?: readonly AgentRegistryEntry[],
): Map<string, AgentRegistryEntry> {
  const merged = new Map<string, AgentRegistryEntry>();

  for (const entry of builtin) {
    merged.set(entry.type, entry);
  }

  if (project) {
    for (const entry of project) {
      merged.set(entry.type, entry);
    }
  }

  return merged;
}
/**
 * Resolve a node type to its handler skill path.
 *
 * ⚠️ Pure function — no I/O, no Effect Layer. Thin wrapper over Map.get().
 * Used primarily by unit tests; production code accesses mapping directly.
 *
 * @param nodeType — the node type to look up e.g. "agent"
 * @param mapping — merged agent registry (from mergeAgentRegistry)
 * @returns handler skill path string or null if type is unmapped
 */
export function resolveAgent(nodeType: string, mapping: Map<string, AgentRegistryEntry>): string | null {
  return mapping.get(nodeType)?.skill ?? null;
}

/**
 * Resolve a node type to its full registry entry.
 *
 * ⚠️ Pure function — no I/O, no Effect Layer. Thin wrapper over Map.get().
 * Used primarily by unit tests; production code accesses mapping directly.
 *
 * @param nodeType — the node type to look up e.g. "agent"
 * @param mapping — merged agent registry (from mergeAgentRegistry)
 * @returns full AgentRegistryEntry or null if type is unmapped
 */
export function resolveEntry(nodeType: string, mapping: Map<string, AgentRegistryEntry>): AgentRegistryEntry | null {
  return mapping.get(nodeType) ?? null;
}
// ---------------------------------------------------------------------------
// Default layer
// ---------------------------------------------------------------------------

/**
 * Default layer providing the builtin agent registry.
 *
 * Lazy: JSON loaded on first access (via Layer.sync), not at module import time.
 * Projects override by providing their own AgentRegistryService layer
 * (e.g. via config.json agentRegistry merged with builtin JSON).
 */
export const DefaultAgentRegistryLayer: Layer.Layer<AgentRegistryService, never, never> = Layer.sync(
  AgentRegistryService,
  () => mergeAgentRegistry(loadBuiltinRegistry()),
);

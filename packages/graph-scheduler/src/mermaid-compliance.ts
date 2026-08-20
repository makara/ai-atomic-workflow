/**
 * Mermaid-format compliance check for flow blocks (graph-flow compliance
 * axis — two-track real-parser validation).
 *
 * Two-track: builtin graphs are covered by the suite regression test (real
 * mermaid parser — tests/unit/mermaid-compliance.test.ts); project graphs are
 * checked at load time by this module — a non-conformant block surfaces as a
 * load-time problem (graph_assets `problems`), never a load failure.
 *
 * The engine subset grammar (flow.ts FLOW_EDGE_RE) is a strict subset of the
 * mermaid flowchart grammar; this check verifies a declared flow block parses
 * under the REAL mermaid parser — the compliance guarantee that the subset
 * stays mermaid-valid, enforced at load for user-authored graphs and by the
 * suite for builtin graphs.
 *
 * Lazy + memoized: mermaid (heavy) is imported on first use and cached; a
 * jsdom DOM shim is installed once BEFORE the mermaid import (mermaid v11
 * sanitizes edge labels via DOMPurify, which requires a DOM — without it
 * labeled edges fail with `DOMPurify.addHook is not a function`).
 */
import { JSDOM } from 'jsdom';

interface MermaidModule {
  parse(text: string): Promise<void>;
  initialize(opts: { startOnLoad?: boolean }): void;
}

let mermaidPromise: Promise<MermaidModule> | null = null;

/** Install jsdom globals once — no-op when a DOM already exists. */
function installDomShim(): void {
  if (typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined') {
    return;
  }
  const dom = new JSDOM('<!DOCTYPE html>');
  (globalThis as Record<string, unknown>).window = dom.window;
  (globalThis as Record<string, unknown>).document = dom.window.document;
  // Node >= 22 ships a native global navigator — never clobber it; jsdom's
  // is only installed when the platform provides none.
  if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  }
}

/** Load the real mermaid parser — lazily, memoized, after the DOM shim. */
function loadMermaid(): Promise<MermaidModule> {
  if (mermaidPromise === null) {
    installDomShim();
    mermaidPromise = import('mermaid').then((m) => {
      const mod = ((m as { default?: MermaidModule }).default ?? m) as MermaidModule;
      mod.initialize({ startOnLoad: false });
      return mod;
    });
  }
  return mermaidPromise;
}

/**
 * Parse a flow block with the real mermaid parser.
 * @returns null when the block is mermaid-format conformant, else the first
 * error line (surfaced as a load-time problem — non-blocking).
 *
 * The mermaid import and the jsdom shim are INSIDE the try/catch: a broken
 * install, bundling regression, or memory-pressure failure must degrade to a
 * compliance problem string — never throw (a throw would become an Effect
 * defect in the load path and hard-fail the load, violating the
 * 'problems never fail load' contract).
 */
export async function checkFlowMermaidCompliance(flow: readonly string[]): Promise<string | null> {
  if (flow.length === 0) return null;
  try {
    const mermaid = await loadMermaid();
    const doc = `flowchart LR\n${flow.map((edge) => `  ${edge}`).join('\n')}`;
    await mermaid.parse(doc);
    return null;
  } catch (error) {
    // A failed mermaid load must not poison future calls — reset the memo so
    // a later parse can recover (e.g. after the install is repaired).
    mermaidPromise = null;
    const message = error instanceof Error ? error.message : String(error);
    const firstLine = message.split('\n')[0] ?? message;
    return `flow block is not mermaid-format valid (real mermaid parser): ${firstLine}`;
  }
}

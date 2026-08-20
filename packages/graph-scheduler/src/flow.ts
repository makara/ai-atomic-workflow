/**
 * Flow subset grammar — the mermaid-subset transition-edge parser and
 * transition-table builder (graph-flow capability).
 *
 * Subset grammar (deterministic, three forms):
 *   `A --> B`          unlabeled edge — sequence default
 *   `A -->|label| B`   labeled edge — condition-matched transition
 *
 * The edge label is the flow-defined condition value: a member of the
 * graph's edge-label vocabulary, matched mechanically (string equality) at
 * advance time — zero machine validation axis on the vocabulary (the
 * governance is graph-maintain's flow audit + user maintenance, mirroring
 * the inventory regime).
 *
 * Malformed entries fail load loudly (never silent drop); endpoints are
 * validated against the compiled phase id set by the compiler.
 */

/** A parsed flow edge. */
export interface FlowEdge {
  /** source phase id */
  source: string;
  /** condition value — the edge label; absent = sequence default */
  label?: string;
  /** target phase id */
  target: string;
}

/** Per-node transition table — the compiled routing authority. */
export interface NodeTransitions {
  /** condition value → target phase id (labeled edges) */
  conditions: Map<string, string>;
  /** sequence-default targets (unlabeled edges; empty when none declared) */
  default: string[];
}

/** The transition table — node id → per-node transitions. */
export type TransitionTable = ReadonlyMap<string, NodeTransitions>;

const FLOW_EDGE_RE = /^\s*([A-Za-z0-9_./-]+)\s*-->\s*(?:\|([^|]*)\|\s*)?([A-Za-z0-9_./-]+)\s*$/;

/**
 * Parse a single flow-edge line under the subset grammar.
 * @throws on malformed syntax — loud failure, never silent drop.
 */
export function parseFlowEdge(line: string): FlowEdge {
  const match = FLOW_EDGE_RE.exec(line);
  if (match === null) {
    throw new Error(
      `flow edge parse error: '${line}' does not match the mermaid subset grammar (expected 'A --> B' or 'A -->|label| B')`,
    );
  }
  const [, source, label, target] = match;
  return { source, label: label !== undefined && label.length > 0 ? label : undefined, target };
}

/**
 * Parse a flow declaration (top-level `flow` array).
 * @throws on the first malformed entry — loud failure naming the entry.
 */
export function parseFlow(flow: readonly string[]): FlowEdge[] {
  return flow.map((line, i) => {
    try {
      return parseFlowEdge(line);
    } catch (error) {
      throw new Error(`flow[${i}]: ${(error as Error).message}`);
    }
  });
}

/**
 * Build the transition table from parsed flow edges. Endpoint existence is
 * NOT checked here — the compiler validates endpoints against its phase id
 * set (single validation point).
 */
export function buildTransitionTable(edges: readonly FlowEdge[]): TransitionTable {
  const table = new Map<string, NodeTransitions>();
  for (const edge of edges) {
    let entry = table.get(edge.source);
    if (entry === undefined) {
      entry = { conditions: new Map(), default: [] };
      table.set(edge.source, entry);
    }
    if (edge.label !== undefined) {
      entry.conditions.set(edge.label, edge.target);
    } else {
      entry.default.push(edge.target);
    }
  }
  return table;
}

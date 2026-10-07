/**
 * The builder API — the programmatic path to a compiled graph.
 *
 * A graph is declared as channels, nodes, edges, and loops; `compile` freezes the
 * declaration into the runtime's input shape and hands it to `validateGraph`, so a
 * dangling name or a drifting router map fails at the declaration rather than at
 * run time.
 *
 * @module
 */

import {
  END,
  IR_VERSION,
  START,
  validateGraph,
  type ChannelSource,
  type ChannelSpec,
  type CompiledGraph,
  type EdgeSpec,
  type Json,
  type KeySpec,
  type LoopSpec,
  type NodeRef,
  type NodeSpec,
  type NodeType,
  type PermissionModel,
  type ReducerId,
  type ValidationCode,
} from '../ir.js';

/** One channel annotation: the half that seeds it, plus the fold that advances it. */
export interface ChannelAnnotation {
  readonly source: ChannelSource;
  readonly reducer: ReducerId;
}

/** A state shape: one annotation per channel, named by the channel. */
export type StateShape = Record<string, ChannelAnnotation>;

/** A router's domain: each declared key of its source node, mapped to a target. */
export type RouterMap = Readonly<Record<string, NodeRef>>;

/** A node declaration: the projection its executor sees, the role it answers as, and
 *  what one launch may spend. Undeclared fields stay absent, so a plain declaration
 *  keeps the four-face shape it always had. */
export interface NodeDeclaration {
  readonly task?: string;
  readonly keys?: readonly KeySpec[];
  readonly read?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly nodeType?: NodeType;
  readonly timeoutMs?: number;
  readonly heartbeatMs?: number;
  readonly statusDetail?: string;
}

/** A loop declaration: its iteration budget and where it lands when spent. */
export interface LoopDeclaration {
  readonly budget: number;
  readonly onExhausted: NodeRef;
}

/** The closed set of structural faults the builder rejects. */
export type GraphBuildCode = ValidationCode | 'reserved-name';

/** A structural fault, raised at the declaration that caused it. */
export class GraphBuildError extends Error {
  readonly code: GraphBuildCode;

  constructor(code: GraphBuildCode, message: string) {
    super(message);
    this.name = 'GraphBuildError';
    this.code = code;
  }
}

/**
 * The suspension call a node body makes: it hands the payload to the host and
 * never returns to the body. The run that supplies the call context lives with
 * the interpreter.
 */
export type InterruptCall = (payload: Json) => never;

/** A node's non-write return: resume a pending suspension, jump to a node, or update channels. */
export interface CommandInit {
  readonly resume?: Json;
  readonly goto?: NodeRef;
  readonly update?: Readonly<Record<string, Json>>;
}

/** A command a node returns instead of a channel update. */
export class Command {
  readonly resume?: Json | undefined;
  readonly goto?: NodeRef | undefined;
  readonly update?: Readonly<Record<string, Json>> | undefined;

  constructor(init: CommandInit = {}) {
    this.resume = init.resume;
    this.goto = init.goto;
    this.update = init.update;
  }
}

/**
 * The channel annotation factory, carrying the state-shape factory on the same
 * name — one import for both halves of a state declaration.
 */
export const Annotation = Object.assign((spec: ChannelAnnotation): ChannelAnnotation => spec, {
  Root: <S extends StateShape>(shape: S): S => shape,
});

/** One node's spec, copied off a declaration so later edits to it cannot reach the compiled graph. */
function nodeSpec(id: string, declaration: NodeDeclaration): NodeSpec {
  const declared = {
    ...(declaration.nodeType === undefined ? {} : { nodeType: declaration.nodeType }),
    ...(declaration.timeoutMs === undefined ? {} : { timeoutMs: declaration.timeoutMs }),
    ...(declaration.heartbeatMs === undefined ? {} : { heartbeatMs: declaration.heartbeatMs }),
    ...(declaration.statusDetail === undefined ? {} : { statusDetail: declaration.statusDetail }),
  };
  return {
    id,
    task: declaration.task ?? '',
    keys: (declaration.keys ?? []).map((key) => ({ ...key })),
    read: [...(declaration.read ?? [])],
    capabilities: [...(declaration.capabilities ?? [])],
    ...declared,
  };
}

/** The faults a compiled graph answers; an empty answer is the acceptance. */
function assertGraph(graph: CompiledGraph): void {
  const faults = validateGraph(graph);
  const first = faults[0];
  if (first === undefined) return;
  // The code answers the first fault in validation order; the message carries every fault — the
  // order is the validator's own, so the answer is the same one a re-run gives.
  throw new GraphBuildError(first.code, faults.map((fault) => `${fault.code}: ${fault.message}`).join('; '));
}

/**
 * The graph builder: channels come from the state shape, nodes and edges from
 * the declarations, and `compile` freezes both into the runtime's input shape.
 */
export class StateGraph {
  private readonly channels: ChannelSpec[];
  private readonly nodes = new Map<string, NodeSpec>();
  private readonly edges: EdgeSpec[] = [];
  private readonly loops: LoopSpec[] = [];

  constructor(state: StateShape) {
    this.channels = Object.entries(state).map(([name, annotation]) => ({
      name,
      source: annotation.source,
      reducer: annotation.reducer,
    }));
  }

  /** Declare one node and its projection. */
  addNode(id: string, declaration: NodeDeclaration = {}): this {
    if (id === START || id === END) throw new GraphBuildError('reserved-name', `node name '${id}' is reserved`);
    if (this.nodes.has(id)) throw new GraphBuildError('duplicate-node', `node '${id}' is declared twice`);
    this.nodes.set(id, nodeSpec(id, declaration));
    return this;
  }

  /** Declare one fixed edge. */
  addEdge(from: NodeRef, to: NodeRef): this {
    this.edges.push({ from, to, kind: 'static' });
    return this;
  }

  /**
   * Declare one router edge per key: the map's domain is the declared key set of
   * `from`, so the declaration carries no key-producing function.
   */
  addConditionalEdges(from: NodeRef, map: RouterMap): this {
    // One copy for the whole declaration: every key's edge reads the same frozen router map,
    // never a private copy per key.
    const router: RouterMap = { ...map };
    for (const [key, to] of Object.entries(map)) {
      this.edges.push({ from, to, kind: 'router', key, map: router });
    }
    return this;
  }

  /** Declare one loop: its budget and the node it lands on when spent. */
  addLoop(id: string, declaration: LoopDeclaration): this {
    this.loops.push({ id, budget: declaration.budget, onExhausted: declaration.onExhausted });
    return this;
  }

  /** Freeze the declaration into a compiled graph, rejecting unresolved references.
   *  A graph-level `permissions` or `input` face written here rides into the IR
   *  exactly as declared; an undeclared one stays absent, never defaulted. */
  compile(
    options: {
      readonly name?: string;
      readonly permissions?: PermissionModel;
      readonly input?: readonly string[];
    } = {},
  ): CompiledGraph {
    const entry = this.edges.find((edge) => edge.from === START && edge.kind === 'static' && edge.to !== END);
    const graph: CompiledGraph = {
      version: IR_VERSION,
      id: options.name ?? 'graph',
      start: entry?.to ?? '',
      end: END,
      channels: [...this.channels],
      nodes: Object.fromEntries(this.nodes),
      edges: this.edges.map((edge) => (edge.map === undefined ? { ...edge } : { ...edge, map: { ...edge.map } })),
      loops: [...this.loops],
      ...(options.permissions === undefined ? {} : { permissions: structuredClone(options.permissions) }),
      ...(options.input === undefined ? {} : { input: [...options.input] }),
    };
    assertGraph(graph);
    return graph;
  }
}

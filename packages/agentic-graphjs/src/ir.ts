/**
 * The compiled-graph IR — the runtime's single input contract.
 *
 * The shape stays format-neutral: a node carries its own declared projection and
 * names channels only, so the interpreter never learns where a graph came from.
 * Two construction paths converge here — the builder in `graph.ts` and a
 * declarative compiler — and both produce this same artifact, which
 * `validateGraph` accepts or refuses before anything steps on it.
 *
 * @module
 */

/**
 * The IR contract version — versioned apart from the package so a shape change
 * and a release move on their own schedules.
 */
export const IR_VERSION = '1';

/** The entry sentinel: an edge from it names a node the run may start at. */
export const START = '__start__';

/** The exit sentinel: an edge to it ends the run. */
export const END = '__end__';

/** The value domain a channel carries and a task payload may hold. */
export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

/** A node name, or one of the two sentinels. */
export type NodeRef = string;

/** The channel reducers: how one channel folds a chain of writes (append concatenates, replace overwrites, merge folds by key). */
export type ReducerId = 'append' | 'replace' | 'merge';

/** Where a channel's first value comes from: the call input, or a node's settlement. */
export type ChannelSource = 'input' | 'node';

/** One channel: its name, the half that seeds it, and the fold that advances it. */
export interface ChannelSpec {
  readonly name: string;
  readonly source: ChannelSource;
  readonly reducer: ReducerId;
}

/** One declared routing key, with the criterion the judge reads for it. */
export type KeySpec = {
  readonly name: string;
  readonly criteria?: string;
};

/** The four node roles one compiled node answers as. A `checkpoint` never executes and
 *  an execution-typed node carries no atom to run, so these names the runtime reads
 *  describe a face, never a body to run. */
export type NodeType = 'agent' | 'checkpoint' | 'compute' | 'action';

/** The three approval modes, read from the `acpx` `src/types.ts:80` (`PERMISSION_MODES`). */
export type PermissionMode = 'approve-all' | 'approve-reads' | 'deny-all';

/** The approval gate one graph declares for the runtime to run under. A graph
 *  that declares nothing carries no permission face, so the face rides only where it
 *  is declared, and an undeclared one is answered by the default `model` face. */
export type PermissionModel = {
  readonly requiredMode: PermissionMode;
  readonly requireExplicitGrant?: boolean;
  readonly reason?: string;
};

/**
 * One node: its identity, the projection its executor sees, its capability face, and
 * the declaration face the runtime reads without executing — the node role it answers
 * as (an absent one answers as `agent`) and what one launch may spend. A type alias
 * rather than an interface so the shape carries an implicit index signature and lands
 * in the `Json` domain without a cast.
 */
export type NodeSpec = {
  readonly id: string;
  readonly task: string;
  readonly keys: readonly KeySpec[];
  readonly read: readonly string[];
  readonly capabilities: readonly string[];
  readonly nodeType?: NodeType;
  readonly timeoutMs?: number;
  readonly heartbeatMs?: number;
  readonly statusDetail?: string;
};

/** How an edge selects its target: a fixed hop, or the settled key of its source node. */
export type EdgeKind = 'static' | 'router';

/**
 * One edge. A static edge is its own hop; a router edge names the key it fires
 * on plus the whole key-to-target map of its source node, so the map is checkable
 * against the declared keys without a second pass. The router owns no rule for
 * producing a key.
 */
export interface EdgeSpec {
  readonly from: NodeRef;
  readonly to: NodeRef;
  readonly kind: EdgeKind;
  readonly key?: string;
  readonly map?: Readonly<Record<string, NodeRef>>;
}

/** One loop: its identity, its iteration budget, and where it lands when spent. */
export interface LoopSpec {
  readonly id: string;
  readonly budget: number;
  readonly onExhausted: NodeRef;
}

/**
 * A compiled graph — the complete runtime input. The graph-level `permissions` and
 * `input` ride exactly as declared: a graph that declares neither answers with the
 * model's default face and no required input keys, so both keys stay absent rather
 * than defaulted, and an old-shape snapshot keeps digesting to its own bytes.
 */
export interface CompiledGraph {
  readonly version: string;
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly channels: readonly ChannelSpec[];
  readonly nodes: Readonly<Record<string, NodeSpec>>;
  readonly edges: readonly EdgeSpec[];
  readonly loops: readonly LoopSpec[];
  readonly permissions?: PermissionModel;
  readonly input?: readonly string[];
}

/** The closed set of structural faults `validateGraph` reports. */
export type ValidationCode =
  | 'duplicate-channel'
  | 'duplicate-node'
  | 'node-id-mismatch'
  | 'unknown-channel'
  | 'unknown-node'
  | 'missing-start'
  | 'missing-end'
  | 'edge-kind'
  | 'key-set-mismatch'
  | 'loop-budget';

/** One structural fault: its code plus the self-describing note the reader needs. */
export interface ValidationFault {
  readonly code: ValidationCode;
  readonly message: string;
}

/** The target set one edge contributes: its own end, plus every router target. */
function edgeTargets(edge: EdgeSpec): readonly NodeRef[] {
  return edge.map === undefined ? [edge.to] : [edge.to, ...Object.values(edge.map)];
}

/** Whether the two key sets agree as sets, ignoring order. */
function sameKeySet(keys: readonly KeySpec[], map: Readonly<Record<string, NodeRef>>): boolean {
  const declared = new Set(keys.map((key) => key.name));
  const mapped = Object.keys(map);
  return declared.size === mapped.length && mapped.every((name) => declared.has(name));
}

/** The declaration face: every channel is named once. */
function checkChannels(channels: readonly ChannelSpec[], faults: ValidationFault[]): Set<string> {
  const names = new Set<string>();
  for (const channel of channels) {
    if (channel.name.length === 0) {
      faults.push({ code: 'unknown-channel', message: 'a channel is declared with an empty name' });
      continue;
    }
    if (names.has(channel.name)) {
      faults.push({ code: 'duplicate-channel', message: `channel '${channel.name}' is declared twice` });
      continue;
    }
    names.add(channel.name);
  }
  return names;
}

/** The identity face: one id per node name, and only declared channels read. */
function checkNodes(graph: CompiledGraph, channelNames: ReadonlySet<string>, faults: ValidationFault[]): void {
  const declaredIds = new Set<string>();
  for (const [name, spec] of Object.entries(graph.nodes)) {
    if (spec.id !== name) {
      faults.push({ code: 'node-id-mismatch', message: `node '${name}' carries the id '${spec.id}'` });
    }
    if (declaredIds.has(spec.id)) {
      faults.push({ code: 'duplicate-node', message: `node '${spec.id}' is declared twice` });
    }
    declaredIds.add(spec.id);
    for (const channel of spec.read) {
      if (!channelNames.has(channel)) {
        faults.push({ code: 'unknown-channel', message: `node '${name}' reads undeclared channel '${channel}'` });
      }
    }
    if (spec.keys.some((key) => key.name.length === 0)) {
      faults.push({ code: 'key-set-mismatch', message: `node '${name}' declares a key with an empty name` });
    }
  }
}

/** One router edge: its map covers the declared keys and its own entry is the target it names. */
function checkRouterEdge(edge: EdgeSpec, spec: NodeSpec, faults: ValidationFault[]): void {
  const map = edge.map;
  if (edge.key === undefined || map === undefined) {
    faults.push({ code: 'edge-kind', message: `router edge from '${edge.from}' carries no key or no map` });
    return;
  }
  if (!sameKeySet(spec.keys, map)) {
    faults.push({
      code: 'key-set-mismatch',
      message: `router at '${edge.from}' maps '${Object.keys(map).join(',')}' against keys '${spec.keys
        .map((key) => key.name)
        .join(',')}'`,
    });
  }
  if (map[edge.key] !== edge.to) {
    faults.push({
      code: 'key-set-mismatch',
      message: `router at '${edge.from}' maps key '${edge.key}' to '${map[edge.key] ?? ''}', not '${edge.to}'`,
    });
  }
}

/** The hop face: every name resolves and each kind carries its own fields; answers whether the exit is reached. */
/** The two endpoints of one edge, checked against the declared set: an unknown source or
 *  target is a fault, and an edge that reaches END is the end's own reachability. */
function checkEdgeEndpoints(edge: EdgeSpec, nodeIds: ReadonlySet<string>, faults: ValidationFault[]): boolean {
  let reachesEnd = false;
  if (edge.from !== START && !nodeIds.has(edge.from)) {
    faults.push({ code: 'unknown-node', message: `edge source names unknown node '${edge.from}'` });
  }
  for (const target of edgeTargets(edge)) {
    if (target !== END && !nodeIds.has(target)) {
      faults.push({ code: 'unknown-node', message: `edge target names unknown node '${target}'` });
    }
    if (target === END) reachesEnd = true;
  }
  return reachesEnd;
}

/** One non-static edge, checked against its declaration: the kind is read off host data, so it
 *  can spell anything — a value that is neither arm is refused here rather than falling through
 *  to the router reading it was never written for — and a router edge's source must be a
 *  declared node. */
function checkHostEdge(graph: CompiledGraph, edge: EdgeSpec, faults: ValidationFault[]): void {
  const kind: string = edge.kind;
  if (kind !== 'router') {
    faults.push({ code: 'edge-kind', message: `edge from '${edge.from}' carries unknown kind '${kind}'` });
    return;
  }
  const spec = graph.nodes[edge.from];
  if (spec === undefined) {
    faults.push({ code: 'edge-kind', message: `router edge from '${edge.from}' names no declared node` });
    return;
  }
  checkRouterEdge(edge, spec, faults);
}

function checkEdges(graph: CompiledGraph, nodeIds: ReadonlySet<string>, faults: ValidationFault[]): boolean {
  let reachesEnd = false;
  for (const edge of graph.edges) {
    if (checkEdgeEndpoints(edge, nodeIds, faults)) reachesEnd = true;
    if (edge.kind !== 'static') {
      checkHostEdge(graph, edge, faults);
      continue;
    }
    if (edge.key !== undefined || edge.map !== undefined) {
      faults.push({ code: 'edge-kind', message: `static edge from '${edge.from}' carries router fields` });
    }
  }
  return reachesEnd;
}

/** The entry face: a static edge leaves the sentinel for the named node. */
function checkEntry(graph: CompiledGraph, faults: ValidationFault[]): void {
  const leaves = graph.edges.some((edge) => edge.from === START && edge.kind === 'static' && edge.to === graph.start);
  if (graph.start.length > 0 && leaves) return;
  faults.push({ code: 'missing-start', message: `no static edge leaves the entry sentinel for '${graph.start}'` });
}

/** The exit face: the named end is the exit sentinel and some edge reaches it. */
function checkExit(graph: CompiledGraph, reachesEnd: boolean, faults: ValidationFault[]): void {
  if (graph.end === END && reachesEnd) return;
  faults.push({ code: 'missing-end', message: 'no edge reaches the exit sentinel' });
}

/** The loop face: unique ids, a whole positive budget, and a target that exists. */
function checkLoops(loops: readonly LoopSpec[], nodeIds: ReadonlySet<string>, faults: ValidationFault[]): void {
  const loopIds = new Set<string>();
  for (const loop of loops) {
    if (loop.id.length === 0 || loopIds.has(loop.id)) {
      faults.push({ code: 'loop-budget', message: `loop '${loop.id}' is declared with an empty or repeated id` });
    }
    loopIds.add(loop.id);
    if (!Number.isInteger(loop.budget) || loop.budget < 1) {
      faults.push({ code: 'loop-budget', message: `loop '${loop.id}' carries the budget '${loop.budget}'` });
    }
    if (loop.onExhausted !== END && !nodeIds.has(loop.onExhausted)) {
      faults.push({ code: 'loop-budget', message: `loop '${loop.id}' exhausts to unknown node '${loop.onExhausted}'` });
    }
  }
}

/**
 * Check a compiled graph for the structural faults no step can recover from:
 * unresolved names, a router whose map drifts from the declared keys, a missing
 * entry or exit, and an illegal loop budget. An empty answer is the acceptance;
 * the same graph always answers the same faults in the same order.
 */
export function validateGraph(graph: CompiledGraph): readonly ValidationFault[] {
  const faults: ValidationFault[] = [];
  const nodeIds = new Set(Object.keys(graph.nodes));
  const channelNames = checkChannels(graph.channels, faults);
  checkNodes(graph, channelNames, faults);
  const reachesEnd = checkEdges(graph, nodeIds, faults);
  checkEntry(graph, faults);
  checkExit(graph, reachesEnd, faults);
  checkLoops(graph.loops, nodeIds, faults);
  return faults;
}

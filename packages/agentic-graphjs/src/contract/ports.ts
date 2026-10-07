/**
 * The port faces the runtime and its container answer through.
 *
 * The port table names the seven tokens the module publishes — the contract a
 * consumer registers against — and the shapes those tokens carry: the per-call
 * context, the graph assets behind the `graphs` token, the memory and output
 * faces, the logging port the entry face emits through, and the plain deps
 * object the runtime reads. They live here so the table and the shapes cannot
 * drift from the runtime's own reading of them.
 *
 * @module
 */

import type { CompiledGraph, Json } from '../ir.js';
import type { RefusalCode } from '../refusals.js';
import type { JudgePort } from '../settle/judge.js';
import type { CheckpointSaver } from './records.js';

/** One row of the module's port table: the token, the port it carries, whether the runtime
 *  refuses without it, the default it falls back to, and the lifetime a consumer-side container
 *  should give it (a recommendation for the consumer, never an enforcement by the module). */
export interface PortRow {
  readonly port: string;
  readonly required: boolean;
  readonly lifetime: 'scoped' | 'singleton';
  readonly fallback: string;
}

/**
 * The port table the module itself publishes: the contract a consumer registers
 * against, carried by the package so the token names, the required set, the defaults, and the
 * recommended lifetimes cannot drift from the runtime's own reading of them.
 */
export const PORTS = Object.freeze({
  checkpointer: {
    port: 'CheckpointSaver',
    required: true,
    lifetime: 'scoped',
    fallback: 'refuse infra',
  },
  context: { port: 'RuntimeContext', required: true, lifetime: 'scoped', fallback: 'the empty object' },
  graphs: { port: 'GraphSource', required: true, lifetime: 'singleton', fallback: 'refuse infra' },
  judge: { port: 'JudgePort', required: false, lifetime: 'scoped', fallback: 'the mechanical key' },
  store: { port: 'StorePort', required: false, lifetime: 'singleton', fallback: 'no memory face' },
  writer: { port: 'WriterPort', required: false, lifetime: 'scoped', fallback: 'no incremental face' },
  logger: { port: 'LoggerPort', required: false, lifetime: 'scoped', fallback: 'silence' },
}) satisfies Readonly<Record<string, PortRow>>;

/** The tokens the table declares — the table is the one source: a token added to it joins this
 *  union, a token removed from it leaves, and every derived face reads the union instead of
 *  repeating the names. */
export type PortToken = keyof typeof PORTS;

/** The per-call context the host injects under `context` — the thread this call answers for. */
export interface RuntimeContext {
  readonly threadId: string;
  readonly checkpointId?: string;
  readonly [key: string]: Json | undefined;
}

/** The graph asset face — the compiled product behind the `graphs` token. A load answers a
 *  discriminant rather than a shape to probe: `ok` names the arm, so a success and a refusal can
 *  never be told apart by the presence of a field, and a refusal carries the code the host chose —
 *  the runtime refuses on that code as it stands, with `message` as the note when one is given. */
export interface GraphSource {
  load(
    name: string,
  ): Promise<
    { ok: true; graph: CompiledGraph; structureHash: string } | { ok: false; code: RefusalCode; message?: string }
  >;
}

/** The cross-run memory face — the `store` token; this version fixes the shape only. */
export interface StorePort {
  get(namespace: readonly string[], key: string): Promise<Json | undefined>;
  search(namespace: readonly string[], query?: string): Promise<readonly Json[]>;
  put(namespace: readonly string[], key: string, value: Json): Promise<void>;
  delete(namespace: readonly string[], key: string): Promise<void>;
  listNamespaces(namespace: readonly string[]): Promise<readonly string[]>;
}

/** The incremental-output face — the `writer` token; one chunk per write. */
export interface WriterPort {
  write(chunk: Json): void;
}

/** The logging port the entry face emits through: four plain methods,
 *  no stream and no routing — where a level lands is the host's decision, never the
 *  module's. A call that injects no port emits nothing: silence is the declared default. */
export interface LoggerPort {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug?(message: string): void;
}

/** What the host resolves from the container and injects — three required capabilities, four optional. */
export interface RuntimeDeps {
  readonly checkpointer: CheckpointSaver;
  readonly context: RuntimeContext;
  readonly graphs: GraphSource;
  readonly judge?: JudgePort | undefined;
  readonly store?: StorePort | undefined;
  readonly writer?: WriterPort | undefined;
  readonly logger?: LoggerPort | undefined;
}

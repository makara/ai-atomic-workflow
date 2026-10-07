# `agentic-graphjs` — schema reference

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](../../../docs/readme-blueprint.md) instead. **Languages**: English (this file) · [中文](schema.zh-CN.md)

The data and asset shapes the runtime reads and writes. The API reference lives in [api.md](api.md); the fast face in [README.md](../README.md).

## The compiled graph (IR)

`IR_VERSION` = `1` — the IR contract version, versioned apart from the package so a shape change and a release move on their own schedules. `validateGraph` checks a source against the closed fault set before anything steps on it.

|Field|Shape|Meaning|
|-|-|-|
|`version`|`string`|The IR version the compile stamped.|
|`id`|`string`|Graph identity.|
|`start` / `end`|`string`|The two sentinels: `START` names a node a run may start at; `END` ends it.|
|`channels`|`readonly ChannelSpec[]`|One entry per channel: `name` + `source` (`input` / `node`) + `reducer` (`append` / `replace` / `merge`).|
|`nodes`|`Readonly<Record<string, NodeSpec>>`|Node id → spec: `task` (the projection the executor sees), `keys` (each `KeySpec` = `name` + optional `criteria`), `read` (the channels it reads), `capabilities`, optional `nodeType` (`agent` / `checkpoint` / `compute` / `action`), optional `timeoutMs` / `heartbeatMs` / `statusDetail`.|
|`edges`|`readonly EdgeSpec[]`|`from` → `to`; `kind` `static` or `router`; a router edge carries `key` (the settled key it fires on) and `map` (key → target).|
|`loops`|`readonly LoopSpec[]`|`id` + `budget` + `onExhausted` (the node a spent budget lands on).|
|`permissions`|`PermissionModel?`|`requiredMode` (`approve-all` / `approve-reads` / `deny-all`) plus optional `requireExplicitGrant` / `reason`; absent = no permission face is declared.|
|`input`|`readonly string[]?`|The input keys a call must supply; absent = no required keys.|

**Validation faults** — the closed `ValidationCode` set: `duplicate-channel` · `duplicate-node` · `node-id-mismatch` · `unknown-channel` · `unknown-node` · `missing-start` · `missing-end` · `edge-kind` · `key-set-mismatch` · `loop-budget`. Each fault carries a self-describing `message` (`ValidationFault`).

## The declaration face

A graph document declares the facts above in its own source form; the compiler hands the module the compiled product, never the source. The declaration covers: the channels (each with its `source` and `reducer`), the nodes (task, keys, reads, capabilities, and the optional declaration fields), the edges (static hops and router maps), the loops, and — optionally — the `permissions` gate and the `input` keys. The module reads only the compiled shape: `CompiledGraph` is its single input contract, and a node carries its own declared projection, naming channels only.

## The load face

The `graphs` token answers the compiled product behind a load discriminant, never a shape to probe:

- `{ ok: true, graph, structureHash }` — the loaded graph plus the structure hash the ledger records (the asset axis of the binding).
- `{ ok: false, code, message? }` — a refusal carrying the code the host chose; the runtime refuses on that code as it stands, with `message` as the note when one is given.

When a load's hash no longer matches the chain's recorded `structureHash`, the call refuses `STRUCTURE_DRIFT`.

## Checkpoints and the chain

|Type|Shape|Meaning|
|-|-|-|
|`ThreadConfig`|`thread_id` + optional `checkpoint_id`|Which thread, and which checkpoint in it.|
|`Checkpoint`|`v` · `id` · `ts` · `channel_values` · `channel_versions` · `versions_seen` · optional `parent_config`|A position in the chain: the folded values and the versions behind them. The field names mirror the adjacent framework's `snake_case` — the parity is deliberate; the module's own rows stay `camelCase`. `parent_config` is the position the step ran at (absent at a thread's head), so the chain walks backwards and a replay re-derives the same parentage.|
|`CheckpointMetadata`|`graph` · `structureHash` · `source` · `step`|What a step records about itself: the graph name is the binding fact (the chain is its only authority), the hash is the asset axis, `source` is the write source, `step` the ordinal.|
|`CheckpointTuple`|`config` · `checkpoint` · `metadata` · optional `pendingWrites`|A checkpoint with the config that addresses it and the writes that followed it.|
|`PendingWrite`|`taskId` · `writes` · optional `key` / `fact` / `attempt` / `receipts` / `outputs`|One pending write block: the task, the write map it contributed, the routing key, the kind (`failed` / `retry`, absent on a success), the attempt ordinal, and the evidence (receipts and artifact refs) the report handed in.|
|`CheckpointListOptions`|optional `limit` / `before`|How far a list reads: newest first, at most `limit`, starting before `before`.|

## Receipts, artifacts, and log entries

|Type|Shape|Meaning|
|-|-|-|
|`Receipt`|`ref` + `state`|One receipt the host hands in beside one external action: the reference the host can read back (a call id, a log anchor, a journal key — never a path guess) and the state the action left behind. The state vocabulary is closed — `reserved` / `settled` / `ambiguous` — and anything outside it answers as the node's failure.|
|`ArtifactRef`|`ref` + optional `mediaType` / `bytes` / `sha256`|One artifact a task produced, in the object form the ledger and the view carry. A report may hand the reference in as a bare string shorthand; the settle normalizes it to `{ ref }`.|
|`LogEntry`|`taskId` · `writes` · optional `key` / `attempt` / `receipts` / `outputs`|The writes one settled task applied, with the key and the evidence riding beside the work (a cold replay never recomputes the key).|
|`OutcomeEntry`|`taskId` · `outcome` (`failed` / `retry`) · optional `reason` / `key` / `writes` / `attempt` / `receipts` / `outputs`|One report's non-success outcome journaled beside the work: `retry` asks to re-mint the task, `failed` is terminal.|
|`ProgressEntry`|`node` · `detail` · optional `at`|One host-written marker beside the chain: inert to the engine, moving no state — a replay that carries markers folds byte-identically to one without them.|
|`IdentityPort` / `ClockPort`|`nextId()` / `now()`|The two host-supplied faces that keep the package free of minted ids and read clocks: ids and timestamps arrive from the host, so a replay mints the same ones.|

## Run face (machinery)

The run face rides `agentic-graphjs/internal`: `RunState` (the state a lane holds), `RunEvent` and `RunResult` (what a run emits and answers), and the `RuntimeError` / `RuntimeFaultCode` pair — shapes in `src/step/run.ts`.

## Refusal payloads

|Type|Shape|Meaning|
|-|-|-|
|`RefusalPayload`|`{code, note, keys?}`|What a refused call carries: the code, the self-describing note, and — where the refusal names candidates — the key set.|
|`RefusalInfo`|`code` + `note`|The two-field face the table rows carry.|
|`RefusalCode`|the twelve codes|The closed code union; `INFRA` is the exported constant of the engine-side code.|

## Port shapes

|Type|Shape|Meaning|
|-|-|-|
|`RuntimeDeps`|`checkpointer` · `context` · `graphs` + optional `judge` / `store` / `writer` / `logger`|What the host resolves and injects — three required capabilities, four optional.|
|`RuntimeContext`|`threadId` + optional `checkpointId` + index signature|The per-call context: the thread this call answers for.|
|`GraphSource`|`load(name)` → the load discriminant|The graph asset face (above).|
|`CheckpointSaver`|the state-provider interface|"Derive or store" is the implementation's call.|
|`StorePort`|`get` / `search` / `put` / `delete` / `listNamespaces`|The cross-run memory face; this version fixes the shape only.|
|`WriterPort`|`write(chunk)`|The incremental-output face — one chunk per write.|
|`LoggerPort`|`info` / `warn` / `error` + optional `debug`|Four plain methods, no stream and no routing — where a level lands is the host's decision. A call that injects no port emits nothing: silence is the declared default.|
|`PortRow` / `PortToken`|the row shape / the token union|The published `PORTS` table and the union derived from it — the table is the one source.|

## Further reading

- [api.md](api.md) — the API reference
- [README.md](../README.md) — the fast face (what / why / how)
- [CHANGELOG.md](../CHANGELOG.md) — the package changelog

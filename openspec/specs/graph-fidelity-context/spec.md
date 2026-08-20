# graph-fidelity-context Specification

## Purpose

Redesigned fundamental requirements of the R2 context-management module (packages/graph-fidelity-context): cost economy as proactive context management behavior, effective utilization of the LLM cache mechanism, and multi-dimensional classification tags (four-dimension tags + signal class C1–C4). **ACTIVE** — the module was rebuilt and activated (ADR 0186 supersedes ADR 0175; classification mechanism ADR 0189); this spec records the requirements the active module satisfies.

## Requirements

### Requirement: R2 fundamental — cost economy as proactive context management

The fundamental requirement of the context-management module is cost economy: proactive context management behavior over the signal-control baseline (R1). Management behavior SHALL act on context items by classification, choosing one of: leave unchanged, compress, trim, or discard. Context produced by the LLM itself SHALL NOT be compressed — it may only be trimmed or discarded. Context produced by local agents (tools, files, code, receipts) SHALL be processed before being sent to the LLM when processing is needed, per classification and level. Processed context SHALL NOT be processed again (idempotent). The trigger / execute / notify / display / boundary mechanics are implementation requirements, not part of this fundamental requirement.

#### Scenario: LLM-produced context is never compressed

- **WHEN** a context item is classified as produced by the LLM (model output, platform compaction summary)
- **THEN** the item is never compressed; it may be trimmed or discarded only

#### Scenario: Local-agent-produced context processed before send

- **WHEN** a context item is classified as produced by local agents (tool output, file content, code, task receipt)
- **THEN** it is processed before being sent to the LLM when processing is needed, with the action chosen per classification and level (compress or trim)

#### Scenario: Processed context is never processed again

- **WHEN** a context item carries a processed marker (compressed, trimmed, or error-marked)
- **THEN** no management action is applied to it again (idempotency)

#### Scenario: Mechanics stay implementation-level

- **WHEN** the requirement text is inspected for the five mechanics (trigger / execute / notify / display / boundary)
- **THEN** they appear as implementation requirements, not as part of the fundamental requirement R2

### Requirement: R3 fundamental — effective utilization of the LLM cache mechanism

The module SHALL effectively utilize the platform LLM cache mechanism. Management actions (compress / trim / discard) SHALL NOT break cache-prefix stability — content inside the stable cache prefix is left untouched. The module SHALL coordinate with platform cache machinery: breakpoint placement awareness, stable-prefix preservation, and cached-token accounting for verification of savings. Cache utilization is a fundamental requirement of the same standing as R2 cost economy.

#### Scenario: Cache prefix stability preserved

- **WHEN** a management action would alter content inside the stable cache prefix
- **THEN** the action is not applied to that content (prefix bytes stay stable for cache hits)

#### Scenario: Cache accounting verifies savings

- **WHEN** management outcomes are verified
- **THEN** the verification uses the platform cached-token accounting (cached_tokens / cache read-write) to confirm savings, not only raw byte deltas

#### Scenario: Cache-aware action placement

- **WHEN** the module schedules management actions
- **THEN** it places actions after cache breakpoints / outside the warm prefix, coordinating with platform compaction and pruning that already preserve the warm suffix

### Requirement: Multi-dimensional classification tags

Context classification SHALL use multi-dimensional tags: producer (LLM-produced | local-agent-produced | user input) × processing state (unprocessed | processed) × usage timing (about-to-be-used | used | no-longer-used) × content level (protected | processable), plus a signal-class coordinate derived from the signal-distribution lattice (C1 control | C2 frame | C3 instruction | C4 context). Signal classes C1/C2/C3 SHALL map to protected (leave) via the zero-config static control-plane protection list, evaluated before tag classification. The default decision for any unclassified or undeclared item SHALL be leave (protection-first); compression requires an explicit processable declaration or a C4 class derivation with processable tags. Each tag combination maps to an action (leave / compress / trim / discard) with a declared priority order: (1) processed → leave (idempotency); (2) protected content level or C1/C2/C3 class → leave; (3) LLM-produced → trim or discard only; (4) local-agent-produced → compress or trim before send, per level; (5) no-longer-used → discard. The protected content level reuses the existing protection judgment (producer + standard contract + downstream consumer).

#### Scenario: Producer tag gates compressibility

- **WHEN** a context item carries producer = LLM-produced
- **THEN** only trim or discard actions are available for it (never compress)

#### Scenario: Processing-state tag gates idempotency

- **WHEN** a context item carries processing state = processed
- **THEN** it is left unchanged regardless of other tags

#### Scenario: Usage-timing tag gates discard

- **WHEN** a context item carries usage timing = no-longer-used
- **THEN** discard is available; about-to-be-used items are processed before send

#### Scenario: Content-level tag gates protection

- **WHEN** a context item carries content level = protected (existing protection judgment: producer + standard contract + downstream consumer)
- **THEN** it is left unchanged (protect priority over retention)

#### Scenario: Control-plane class gates protection

- **WHEN** a context item carries signal class C1/C2/C3 or originates from a control-plane tool family (static list, e.g. graph-scheduler)
- **THEN** it is left unchanged — never managed — regardless of other tags

#### Scenario: Undeclared items default to leave

- **WHEN** a context item carries no class, no declaration flags, and no platform signals
- **THEN** it passes through untouched (protection-first default); no default agent-to-compress fallback exists

#### Scenario: Priority order resolves conflicts

- **WHEN** tags conflict (e.g. LLM-produced AND processable level)
- **THEN** the declared priority order decides: processed > protected (level or class) > LLM-produced > local-agent-produced > no-longer-used

### Requirement: Fundamental requirements stay separate from implementation requirements

The first-principles document SHALL keep fundamental requirements (R2 cost economy, R3 cache utilization) strictly separate from implementation requirements (trigger / execute / notify / display / boundary mechanics, hooks mapping, tool selection). Fundamental requirement text changes only by explicit user ruling; implementation requirements follow the current state freely.

#### Scenario: Document structure enforces layering

- **WHEN** the first-principles document is inspected
- **THEN** fundamental requirements (R2, R3) and implementation requirements are separate sections, and mechanism details appear only under implementation requirements

#### Scenario: Fundamental text frozen without user ruling

- **WHEN** the requirement text changes without an explicit user ruling
- **THEN** fundamental requirement text stays unchanged (deviation recorded in the appendix)

### Requirement: First-sight processing timing (before cache production)

The module SHALL apply management actions (compress / trim / discard) at content entry — before the content first enters the append-only session log and before any cache is produced from it. The primary surface SHALL be the tool_result hook, which fires pre-persistence (before the result returns to the agent loop), rewriting the result content; tool-source processing (the platform read-summarizer precedent) is the secondary surface for tool-self-managed content. Content SHALL enter the log already processed, so cache breakpoints (applied by the provider at request build) are produced from processed bytes from the very first request. The before_provider_request hook SHALL NOT be used for management actions — it fires after cache breakpoint application, making per-request transforms post-hoc and breakpoint-reordering.

#### Scenario: Tool results processed before persistence

- **WHEN** a tool execution completes and its result matches the classification for processing
- **THEN** the result is rewritten at the tool_result hook before it is persisted to the session log; the stored content is the processed form

#### Scenario: Cache produced from processed content

- **WHEN** the provider builds a request carrying content processed at entry
- **THEN** the cache breakpoints apply to the processed bytes — the cache is produced from processed content from the first request, with no per-request transform

#### Scenario: before_provider_request not used

- **WHEN** the module registers platform hooks
- **THEN** no management action is performed in before_provider_request (the hook fires after cache breakpoint application — anthropic.ts:1953 vs 1940)

#### Scenario: Tool-source processing precedent

- **WHEN** a tool returns content it self-manages (e.g. read summarizing large files)
- **THEN** the processed (e.g. summarized) content is what lands in the store and on the wire (read-summarizer precedent, read.ts:2524-2538)

### Requirement: First-sight marker idempotency

Processed content SHALL carry a marker written at entry (the same pass that processes it). Later classification passes SHALL skip marked content — processed content is never processed again. The module SHALL NOT maintain a per-request outbound-transform cache for idempotency.

#### Scenario: Marker written at entry

- **WHEN** content is processed at first sight
- **THEN** the processed form stored in the log carries the processing marker, and no session outbound-cache surface exists

#### Scenario: Marked content never re-processed

- **WHEN** a later pass classifies content carrying the processing marker
- **THEN** it is left unchanged (skip), matching the marker-idempotency pattern

### Requirement: Strict reduction acceptance gate

The module SHALL accept a management action result only when the result is strictly smaller than the original AND every preserved message stays byte-identical (stable serialization); otherwise the action is not applied (pass-through). The gate is orthogonal to the no-threshold rule: submission is class-driven and unconditional; acceptance is strict. No size thresholds, budget gates, or scaling ramps govern submission.

#### Scenario: Accepted reduction

- **WHEN** a processed result is strictly smaller and preserved messages remain byte-identical
- **THEN** the processed form replaces the original

#### Scenario: Rejected reduction passes through

- **WHEN** a processed result is not strictly smaller or preserved messages changed bytes
- **THEN** the original content passes through unchanged

#### Scenario: Submission stays class-driven

- **WHEN** the module selects content for processing
- **THEN** selection is class-driven and unconditional — no size thresholds, budget gates, or scaling ramps

### Requirement: Cache telemetry for accounting verification

The module SHALL feed platform cache usage facts (message_end usage cacheRead / cacheWrite) into the settlement/display surface, providing the R3 cached-token accounting verification. The settlement line SHALL render as ONE line: action summary + benefit graphic (ratio) + action statistics (per-action counts) + cache read/write figures, with compact k/M number formatting. The action summary prefix SHALL render only when at least one management action was recorded since the last emission; a line carrying zero management actions and only usage deltas SHALL render without the "ctx managed" prefix (user ruling, round 17). Cache figures SHALL render as full lowercase words `cache read` / `cache write` — abbreviations (e.g. `R`/`W`) SHALL NOT be used. Benefit figures SHALL follow compressor feedback: exact token figures render as dual compact numbers when the compressor reports them; when it reports none, only the ratio renders — absolute numbers are never estimated or fabricated. When there is no benefit (saved = 0), the benefit segment SHALL NOT render (user ruling, round 10 — supersedes the former "render even when zero" behavior on the settlement face).

#### Scenario: Cache usage surfaced

- **WHEN** a message_end delivers usage with cacheRead/cacheWrite
- **THEN** the settlement line reports the cache usage facts with k/M formatting

#### Scenario: Missing usage degrades silently

- **WHEN** message_end carries no usage payload
- **THEN** the telemetry line degrades silently (no fabricated numbers)

#### Scenario: Ratio-only when no token figures

- **WHEN** the compressor reports no exact token figures for an accepted reduction
- **THEN** the benefit segment renders the ratio only (graphic fill) — no absolute token numbers, no character-delta estimates

#### Scenario: No benefit hides the segment

- **WHEN** saved = 0 (no accepted reduction)
- **THEN** the benefit segment does not render; the settlement line keeps action summary + statistics + cache figures

#### Scenario: Zero-action line omits the managed prefix

- **WHEN** a settlement emission carries zero management actions and only usage (cache read/write) deltas since the last emission
- **THEN** the line renders the cache figures without the "ctx managed" prefix

#### Scenario: Cache figures use full lowercase words

- **WHEN** the settlement line reports cache usage facts
- **THEN** the figures render as `cache read <n> · cache write <n>` — full lowercase words, no abbreviations (`R`/`W` not used), compact k/M formatting preserved

### Requirement: Active runtime module with zero-config auto-enable

The module SHALL auto-enable on install: loading the package registers its hooks through the platform-hooks-sdk bind registry. Installation facts are the SDK dependency and the consumer-side registration of the module's hooks in the host package's platform entry point — no dedicated manifest-second-entry mechanism exists for the module. The module SHALL be distributed as a plugin bundle whose published surface is the plugin entries only (`./omp`, `./server`); the root barrel SHALL NOT be published, and no module-internal piece (compressor factory, trim helper, classifier, marker helpers, ledger, renderer, constants) SHALL be exported through a published surface.

#### Scenario: Suspension removed

- **WHEN** the module documentation or ADR estate is inspected
- **THEN** the SUSPENDED status is gone — ADR 0186 records activation and supersedes ADR 0175 (0175 folded to archive)

#### Scenario: Auto-enable on install

- **WHEN** the package is installed (npm or omp plugin install) and loaded
- **THEN** hooks register at load time through the SDK binding with zero configuration, no switches, and no setup steps

#### Scenario: Publishable and built

- **WHEN** the package manifest is inspected
- **THEN** private is absent, build/typecheck/test scripts exist, and the package participates in the repo pipeline

#### Scenario: Opencode module shape carries id

- **WHEN** the opencode server entry is loaded as a file plugin
- **THEN** the module default-exports `{ id, server }` — the loader reads v1 plugins from `mod.default` and resolves the plugin id from it (base-package form)

#### Scenario: Plugin-entry-only published surface

- **WHEN** the package's exports map is inspected
- **THEN** only the plugin entries (`./omp`, `./server`) are published
- **AND** the root barrel and its module-internal pieces are not importable from outside

#### Scenario: Zero-config activation

- **WHEN** the package is installed and its plugin entry is loaded
- **THEN** the module activates with zero configuration

#### Scenario: Internal pieces not published

- **WHEN** a module-internal helper (classifier, marker, ledger, renderer, compressor, trim, constants) is referenced from outside the package
- **THEN** the reference resolves only through relative paths inside the package or its tests — never through a published export

### Requirement: Encapsulation-layer docking (no direct platform hooks)

The module SHALL interact with platform seams through the platform-hooks-sdk contract — binding its transforms and display deliveries through the SDK adapters. It SHALL NOT use platform hook APIs directly and SHALL NOT route through a graph-fidelity platform-binding layer (that layer no longer exists). Docking is a direct SDK dependency. The module's delivery SHALL consume the SDK unified output/feedback interface. The landing transform and usage observation behaviors remain module-owned canonical handlers, and their delivery uses the unified interface. The canonical→landing translation SHALL be provided by the SDK (single home), not held as a module-local copy. The module's wired hooks surface SHALL be consumed only by the module's own platform entries.

#### Scenario: No direct platform hook usage

- **WHEN** the context module source is scanned for platform hook registration (tool_result / message_end / notify)
- **THEN** zero direct platform hook calls exist — all platform interaction goes through the SDK binding

#### Scenario: Interface gaps filled in base

- **WHEN** the module requires a capability the SDK contract lacks
- **THEN** the capability is added to the platform-hooks-sdk (adapter table entry or core contract), and the module docks through it

#### Scenario: Module delivery flows through the unified interface

- **WHEN** the context module emits a settlement line, a reduction result, or a compliance/measurement evidence row
- **THEN** the emission SHALL go through the SDK unified output/feedback interface; no module-private parallel delivery path SHALL remain

#### Scenario: Landing and observation handlers stay canonical

- **WHEN** the module's tool_result landing transform or usage observation handler fires
- **THEN** the transform/observation logic SHALL remain module-owned canonical handlers while their delivery SHALL use the unified interface

#### Scenario: SDK-bound platform entries

- **WHEN** the module binds a platform
- **THEN** the bind goes through the SDK adapter exclusively
- **AND** no direct platform hook call or platform import exists in module code

#### Scenario: SDK-owned landing translation

- **WHEN** the module transforms a canonical tool_result payload into its landing input
- **THEN** the translation is imported from the SDK (single home)
- **AND** no module-local copy of the translation exists

### Requirement: Session benefit ledger and action statistics

The module SHALL keep a session-scoped benefit ledger — in-memory state, never written into the committed transcript/log (cache-prefix stability preserved). The ledger SHALL accumulate: per-transform action counts (leave / compress / trim / discard), saved amount from accepted reductions only (strict-reduction gate passed), and usage facts (cacheRead / cacheWrite). Compressor feedback is authoritative for saved figures (before/after sizes or exact token figures); when the compressor reports none, the ledger stores the ratio only. The ledger SHALL be the single render source for benefit facts on both display faces (echo segment + settlement line). Marker idempotency (first-sight marker) guarantees no double counting.

#### Scenario: Accepted reductions accumulate

- **WHEN** a transform result passes the strict-reduction gate (compress / trim / discard)
- **THEN** the ledger records the action count and the saved amount from the compressor's reported feedback

#### Scenario: Leave actions counted but not saved

- **WHEN** a transform result is leave (or pass-through)
- **THEN** the action count records it; no saved amount is recorded

#### Scenario: Ledger is the single render source

- **WHEN** either display face (echo segment or settlement line) renders benefit facts
- **THEN** both read from the same ledger instance — one render source per fact

#### Scenario: Ledger never enters the log

- **WHEN** the session log/transcript is inspected
- **THEN** no ledger bytes appear in committed messages (prefix stability intact)

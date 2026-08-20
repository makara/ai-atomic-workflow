# platform-hooks-sdk Specification

## Purpose

Standalone platform-hooks SDK: a unified hook contract (sync + async dual-face API, unified handler signature) with platform adapter translation tables (OMP, opencode v1, opencode v2 reserved), independently installable, testable, and publishable — never installed directly into a platform.

## Requirements

### Requirement: Unified hook contract

The SDK SHALL expose a normalized event directory covering the OMP hook set and the opencode v1 hook set, with one canonical event name per cross-platform concept. Hook handling SHALL be expressed as Effect middleware transformers composed through per-hook `use` chains and capability objects. The former handler-set contract and dual-face (sync + async) dispatch API SHALL remain replaced by the single async execution face (per the Single execution face requirement). The handler delivery contract (Effect success type) and canonical error type SHALL remain. The DeliveryContext SHALL be provided to middleware through the effect environment (per the Composed delivery services requirement) and SHALL NOT be threaded through per-adapter closures or dispatch-input fields.

#### Scenario: Canonical event naming

- **WHEN** a platform event with platform-specific spelling (snake_case OMP, dotted opencode) maps to a canonical event
- **THEN** consumers reference the canonical name only; platform spellings appear in adapter tables only

#### Scenario: Effect-typed handler signature

- **WHEN** a consumer wires handling for a canonical event as middleware
- **THEN** the middleware signature is effect-typed: a defined success type (the delivery contract) and a defined failure type (the canonical error) — no `unknown`-returning handling is part of the public surface

#### Scenario: Unified return semantics

- **WHEN** a chain returns a value on either platform face
- **THEN** the return is interpreted by one typed delivery contract (the Effect success type) and the adapter translates it per face — no consumer-side key-presence discrimination of return meaning is required

#### Scenario: Sync and async dispatch of the same event

- **WHEN** a consumer wires a chain for a canonical event and the chain executes on either platform face
- **THEN** the chain executes on the async face (awaited) on both OMP and opencode — no sync execution entry exists, no loud-failure path

#### Scenario: Delivery channels on every handler

- **WHEN** a middleware executes on any canonical event
- **THEN** the DeliveryContext service in its environment exposes `notify`, `appendEntry`, and `mutate` channels that function without the consumer knowing the platform delivery surface
- **AND** no platform-specific handle (ctx.ui, client.tui, api) is required for delivery

#### Scenario: DeliveryContext provided through the effect environment

- **WHEN** a chain executes through either platform face
- **THEN** the DeliveryContext service is available in the middleware's effect environment (provided by the dispatch path)
- **AND** the middleware accesses `notify` / `appendEntry` / `mutate` through that service

#### Scenario: No closure-threaded delivery state

- **WHEN** a middleware executes on either platform face
- **THEN** no per-adapter closure captures or threads the delivery context into the middleware

### Requirement: Adapter translation tables

The SDK SHALL ship one adapter per platform, each a pure translation table: event-name mapping (platform event ↔ canonical event), payload decode/encode (platform payload shape ↔ canonical shape, via effect Schema at the adapter boundary — platform payloads are decoded into canonical shapes before dispatch and canonical results are encoded into platform shapes on delivery), signature translation (return-style ↔ mutation-style; sync ↔ async execution strategy per the Single execution face requirement), and delivery translation (platform delivery surfaces → DeliveryContext services). The opencode adapter SHALL own platform-entry option validation: per-server-call options (deny provider, PCL mark channel) SHALL be accepted on the adapter's server entry, shape-validated by the adapter (invalid/absent shapes fail open), and provided to bound middleware through the effect environment — never through a consumer-side mutable module slot. bind time by the opencode adapter, never threaded through a consumer-side mutable module slot. The OMP adapter SHALL cover the OMP hook contract and SHALL map `ctx.ui.notify` → `notify` and `api.appendEntry` → `appendEntry`. The opencode adapter SHALL cover the opencode v1 hook contract and SHALL map `client.tui.showToast` → `notify` with a transcript fallback, and output-surface writes → `mutate` (in place). The SDK SHALL own the canonical-to-landing translation: a canonical `tool_result` payload SHALL be convertible to the landing/transform input shape by an SDK-owned helper (single home), and consumers SHALL NOT hold local copies of that translation.

#### Scenario: Return-style to mutation-style translation

- **WHEN** a chain returns a value on the opencode face
- **THEN** the adapter writes the returned value into the mutation surface (output object) per the opencode v1 contract

#### Scenario: v2 reservation

- **WHEN** the opencode v2 contract is inspected
- **THEN** the v2 contract is documented as pending in the first-principles interface directory with zero runtime claims; no v2 placeholder table or stub is shipped in the runtime surface

#### Scenario: Adapter-boundary schema decode

- **WHEN** a platform event payload arrives at the adapter
- **THEN** the payload is decoded through the canonical event's effect Schema — validation happens exactly once at the adapter boundary, and no consumer re-validation of canonical payloads is required

#### Scenario: Schema-encoded platform delivery

- **WHEN** a canonical result is delivered to a platform surface
- **THEN** the adapter encodes it into the platform-expected shape through the canonical Schema before writing

#### Scenario: Single denormalization point

- **WHEN** a canonical result is delivered to a platform surface
- **THEN** the adapter-boundary encode is the only writer of platform-shaped output
- **AND** no consumer passes platform shape descriptors into chain, lifecycle, or delivery machinery

#### Scenario: Delivery translation

- **WHEN** a middleware calls `ctx.notify(text)` on the OMP face
- **THEN** the text is delivered through the OMP notify surface (ctx.ui.notify)
- **AND** when a middleware calls `ctx.notify(text)` on the opencode face
- **THEN** the text is delivered through the toast surface when available, and through the transcript fallback otherwise

#### Scenario: Adapter-boundary option validation

- **WHEN** a consumer binds the opencode adapter and a server call carries platform-entry options (deny provider, PCL mark channel)
- **THEN** the adapter validates the option shapes on the server entry (invalid/absent shapes fail open — no named error, no throw into the platform loop)
- **AND** the options reach the bound middleware through the effect environment without any consumer-side mutable module-level slot

#### Scenario: SDK-owned landing translation

- **WHEN** a consumer transforms a canonical tool_result payload into a landing/transform input
- **THEN** the translation is provided by an SDK-owned helper (single home in the SDK)
- **AND** the consumer holds no local copy of that translation

### Requirement: Bind registry

The SDK SHALL expose a middleware-chain registry in place of the former `bind(adapter, handlers)` registry: consumers register middleware on canonical hooks (directly or via capability objects), and the registry SHALL bind each adapter to the composed chains, producing a Schema-tagged discriminated union — one member per platform — carrying the platform-shaped registration the consumer wires into its own platform entry point, with no `unknown` and no consumer-side cast required. The bind signature SHALL be `bind(adapter, hooks)` — the `layers` parameter SHALL be removed; capability configuration travels through capability objects captured at bind time, never through a per-dispatch Layer. Per-server-call options SHALL travel through the adapter's bind-time option surface (see Adapter translation tables), never through a consumer-side mutable module-level slot. The registry SHALL validate middleware attachment against the canonical event directory, failing loudly on unknown hooks.

#### Scenario: Valid keys bind unchanged

- **WHEN** middleware is attached only to canonical event hooks
- **THEN** binding the adapter to the composed chains proceeds as before and all chains are registered

#### Scenario: Typed bind result

- **WHEN** a consumer binds composed chains through the SDK adapter
- **THEN** the consumer receives a precisely typed platform registration (discriminated by the adapter's platform tag) and wires it into its platform entry point — no cast, no `unknown` narrowing

#### Scenario: Consumer-owned registration

- **WHEN** a consumer binds chains through the SDK adapter
- **THEN** the consumer receives platform-shaped registration objects and wires them into its own platform entry point
- **AND** the SDK package itself carries no platform manifest entries and no platform entry points

#### Scenario: Unknown handler key fails loudly

- **WHEN** middleware attaches to a hook that is not a canonical event
- **THEN** the SDK throws a named error — no silent skip

#### Scenario: Bind without layers

- **WHEN** a consumer binds chains through the SDK adapter
- **THEN** the bind path accepts adapter + hooks only — no `layers` parameter exists on the public surface
- **AND** configuration provided to capabilities is captured at composition, not injected per dispatch

#### Scenario: Bind without resident

- **WHEN** a consumer binds chains through the SDK adapter
- **THEN** the bind path accepts adapter + hooks only
- **AND** resident injection is wired via the `resident` capability instead

#### Scenario: No consumer-side options slot

- **WHEN** a consumer binds an adapter with per-server-call options
- **THEN** the options are validated and captured on the adapter's server entry (fail-open on invalid/absent shapes)
- **AND** no consumer-side mutable module-level slot exists in the consumer's runtime surface

### Requirement: Independent install, test, publish

The SDK SHALL be a standalone package: zero platform runtime dependencies, installable as a workspace reference or a public npm module (`private: false`), with an independent test suite over the pure core and translation tables. Published type declarations SHALL NOT reference platform packages: canonical payload types are SDK-defined, and adapter type surfaces SHALL be platform-type-free so consumers typecheck without platform packages installed. The SDK SHALL make no backward-compatibility promise: breaking changes are allowed without aliases or deprecation paths.

#### Scenario: Standalone installation

- **WHEN** any module declares the SDK as a dependency (workspace path or published npm version)
- **THEN** the SDK resolves and loads without any platform package installed

#### Scenario: Independent test run

- **WHEN** the SDK test suite runs in isolation
- **THEN** every contract and translation-table behavior is exercised without any platform runtime

#### Scenario: Typecheck without platform packages

- **WHEN** a consumer typechecks against the published SDK declarations with no platform package installed
- **THEN** no declaration file resolves into a platform package and typechecking succeeds

### Requirement: Zero platform imports in core

The SDK core (event directory, handler typing, dispatch faces, bind registry) SHALL contain no platform imports. Platform contract types and event names SHALL appear in adapter files only.

#### Scenario: Core purity

- **WHEN** the core module graph is inspected
- **THEN** no import resolves into any platform package
- **AND** platform identifiers appear only in adapter-scoped files

### Requirement: Unified delivery surface

The SDK SHALL own feedback delivery. Consumers SHALL deliver operator feedback, persistent marks, output-surface mutations, and compliance/measurement evidence exclusively through the DeliveryContext services; consumers SHALL NOT reach platform delivery handles directly. The SDK SHALL expose a unified output/feedback interface built on the DeliveryContext channels: one canonical surface through which any consumer (module or agent-side report) emits informational output and feedback lines — operator notifications, settlement lines, and hint-compliance evidence rows. Delivery services SHALL be Layer-composed per the Composed delivery services requirement.

#### Scenario: Consumer delivery without platform knowledge

- **WHEN** a consumer needs to notify the operator or record a mark during any event
- **THEN** it uses the DeliveryContext services (`notify` / `appendEntry`) and the active adapter routes the call to the correct platform surface
- **AND** no consumer code references `ctx.ui`, `client.tui`, or the ExtensionAPI handle for delivery

#### Scenario: Fail-open delivery

- **WHEN** a platform delivery surface is absent or throws
- **THEN** the delivery degrades to the next available fallback (e.g. transcript) or a no-op, and never throws into the platform event loop

#### Scenario: Compliance evidence delivered through the unified interface

- **WHEN** a consumer emits hint-compliance evidence (a compliance/measurement row: hint or resident rule observed or violated with its evidence)
- **THEN** the evidence SHALL be delivered through the SDK unified output/feedback interface — one canonical emission path — and SHALL NOT bypass it via a module-private delivery handle

#### Scenario: Module-private delivery eliminated

- **WHEN** a consumer (e.g. the context module) delivers informational output or feedback
- **THEN** it SHALL use the unified interface; the former module-private handler delivery mechanism (module-local `ctx.notify`/`ctx.mutate` wiring) SHALL NOT remain as a separate parallel path

### Requirement: In-place mutation contract

Output-surface mutation on the opencode face SHALL be in-place: the SDK `mutate` SHALL write replacements into the original array/object references (splice-style write-back) because the opencode consumer rebuilds requests from the original references and silently discards reassigned surfaces. Consumer code SHALL NOT reassign opencode output surfaces (`output.messages`, `output.system`, `output.output`). The transcript fallback SHALL NOT fabricate user-role messages: settlement/notification lines append to the last real user-like message's parts (or degrade to a documented no-op) so the next turn's echo anchor never binds to a synthetic message.

#### Scenario: Transcript fallback preserves settlement lines

- **WHEN** the opencode transcript fallback appends pending settlement lines through `mutate`
- **THEN** the appended lines are written into the original messages array reference, appended to an existing user-like message — no new user-role message is created

#### Scenario: Reassignment is rejected

- **WHEN** a consumer attempts to replace an opencode output surface by reassigning the array
- **THEN** the mutation contract is violated and the SDK test suite SHALL pin the in-place behavior as the only supported pattern

#### Scenario: No user-like message degrades to no-op

- **WHEN** the opencode transcript fallback finds no user-like message to append to
- **THEN** the fallback degrades to a documented no-op — it never fabricates a user-role message

### Requirement: Canonical payload types

The SDK SHALL define canonical payload types for every mapped canonical event as effect Schemas: the Schema is the single source of the type and the decode contract. Adapters SHALL decode platform payloads into canonical shapes through the Schemas before dispatch and encode handler results on delivery. Handler code SHALL operate on canonical payloads only, never raw platform payload objects. The SDK SHALL re-export every canonical payload Schema and its inferred type from the package barrel so consumers typecheck and validate against the documented surface without deep imports.

#### Scenario: Denormalized platform delivery

- **WHEN** a handler return value is written to a platform surface
- **THEN** the adapter converts the canonical value to the platform-expected shape before writing

#### Scenario: Normalized handler payload

- **WHEN** a handler inspects `event.payload`
- **THEN** it sees the canonical shape for that event — decoded by the adapter boundary Schema — with no platform-specific fields required for the handler's logic

#### Scenario: Single validation point

- **WHEN** any canonical payload is consumed downstream of the adapter
- **THEN** validation has already happened at the adapter boundary; consumer-side re-validation of canonical payloads is unnecessary and absent from the consumer trees

#### Scenario: Barrel export surface

- **WHEN** a consumer imports canonical payload types or Schemas from the SDK package root
- **THEN** every SDK-defined canonical payload Schema/type is resolvable from the barrel
- **AND** no deep import into internal modules is required

### Requirement: Signal chain capability

The SDK SHALL own the R1 signal chain as a core capability: message normalization/denormalization, anchored run-frame lookup, identity echo rendering, chain application (fidelity chain with discipline echo), and resident prompt block injection. The chain SHALL be platform-neutral (zero platform imports), exposed as the `lifecycle` capability object (`lifecycle.echo(...)`) consuming the canonical event through the effect environment. The barrel SHALL re-export only the consumer-facing capability surface — the `lifecycle` capability object and its public option/result types — so consumers never deep-import the capability surface; internal chain machinery (`applyFidelityChain`, `renderIdentityEcho`, seam/user-role constants, discipline input/output types) SHALL NOT be re-exported from the barrel, and consumer or SDK tests SHALL import such internals module-relative when they must exercise them. Consumers SHALL NOT pass platform shape descriptors into lifecycle machinery: the adapter-boundary encode SHALL be the only writer of platform-shaped output, and consumer trees SHALL contain no `OMP_SHAPE` / `OPENCODE_SHAPE` imports.

#### Scenario: Consumer chain access

- **WHEN** a consumer imports the signal chain capability from the SDK package root
- **THEN** the `lifecycle` capability and its public payload/option types resolve from the barrel
- **AND** no deep import into SDK internal modules is required for the capability surface

#### Scenario: Resident seam is SDK-wired

- **WHEN** a consumer registers the `resident` capability with resident content supplied
- **THEN** the SDK wires the resident seam on both faces (OMP `before_agent_start`, opencode `experimental.chat.system.transform`) exactly once
- **AND** the consumer declares `ResidentPrompt[]` content only — no consumer-side per-face resident handler exists

#### Scenario: Chain platform purity

- **WHEN** the SDK core module graph is inspected after the chain lands
- **THEN** no chain module imports any platform package, and the core purity requirement still holds

#### Scenario: No consumer shape descriptors

- **WHEN** consumer packages (graph-fidelity, graph-fidelity-context) are scanned for platform shape descriptors
- **THEN** no `OMP_SHAPE` / `OPENCODE_SHAPE` import exists in consumer source — lifecycle machinery consumes canonical events only

#### Scenario: Behavior pins hold

- **WHEN** the pre-migration echo/resident test fixtures run against the SDK chain
- **THEN** the outputs match byte-for-byte (relocation, not redesign)

#### Scenario: Barrel excludes test-only chain internals

- **WHEN** the SDK package barrel is enumerated
- **THEN** it SHALL NOT export `applyFidelityChain`, `renderIdentityEcho`, `SEAM_MARKER`, `USER_LIKE_ROLES`, `DisciplineInput`, or `EchoMessage`, and tests exercising them use module-relative paths

### Requirement: Platform hook mapping catalog

The SDK SHALL ship a machine-readable mapping catalog (`CATALOG`, exported from the package barrel) as the single source for every platform hook — the complete OMP hook set (42 extension `on()` events) and the complete opencode v1 hook set (21 keys), plus the opencode v2 reserved surface. Every row SHALL carry: platform hook name, platform, SDK interface (canonical name or pending interface name), status (`formal` — implemented canonical, or `pending` — defined but not implemented), substitute face where applicable, and pending rows SHALL carry an absence reason and a future substitution path. The first-principles document directory SHALL derive from `CATALOG` (generated or verified against it), never be a second copy. No platform hook SHALL be missing from `CATALOG`.

#### Scenario: Complete coverage

- **WHEN** `CATALOG` is checked against the platform reference hook sets (OMP 42, opencode 21)
- **THEN** every platform hook has exactly one row with interface, status, and (for pending) reason and future path

#### Scenario: Directory consistency

- **WHEN** a canonical event's platform spellings in `CATALOG` are compared with `EVENT_DIRECTORY` and the adapter tables
- **THEN** they match, and the single-source linkage is declared (directory rows are derived from the catalog)

#### Scenario: Same-hook multi-canonical clarity

- **WHEN** one platform hook could serve multiple canonicals (e.g. the opencode `event` stream serving `message_start` / `message_update` / `message_end`)
- **THEN** the catalog declares those rows `face_kind: substitute_shared` with documented substitution semantics, and any other multi-canonical mapping is a violation

#### Scenario: Document derives from the catalog

- **WHEN** the first-principles document mapping directory is compared with `CATALOG`
- **THEN** the directory matches `CATALOG` row for row (single-source linkage declared), and no count or status differs

#### Scenario: Pending interfaces are defined

- **WHEN** a pending row is inspected
- **THEN** its interface name and payload type are defined in the SDK types, and zero runtime implementation, zero adapter row, and zero barrel export exist for it

### Requirement: Interface directory full coverage

The SDK interface directory SHALL cover EVERY platform hook of EVERY platform with exactly one ownership row: a `formal` hook resolves to exactly one canonical event (single-face rule — one platform hook maps to at most one canonical), with its adapter translation and consumer handler surface; a `pending` hook resolves to its defined-but-unimplemented interface. A shared substitute face (one platform hook serving multiple canonicals as substitute, e.g. the opencode `event` stream serving `message_start` / `message_update` / `message_end`) SHALL be declared with `face_kind: substitute_shared` and documented semantics. No platform hook SHALL be orphaned.

#### Scenario: No orphan hook

- **WHEN** the interface directory is checked against the platform reference hook sets
- **THEN** every platform hook has a directory row with a concrete ownership surface (formal canonical or pending interface), and no hook is orphaned

#### Scenario: Directory–catalog consistency

- **WHEN** a hook's ownership surface in the interface directory is compared with its mapping row in the catalog
- **THEN** the two agree, and the single-source linkage is declared

#### Scenario: Single face per platform hook

- **WHEN** the directory is checked against the platform reference hook sets
- **THEN** no platform hook maps to more than one formal canonical except rows declared `substitute_shared`, and every hook has a row

#### Scenario: Pending hooks stay unimplemented

- **WHEN** a pending interface name is searched in the SDK runtime modules and the barrel
- **THEN** no adapter translation, no dispatch registration, and no barrel export exists for it

#### Scenario: Shared substitute face declared

- **WHEN** the opencode `event` stream serves as substitute for `message_start` / `message_update` / `message_end`
- **THEN** the catalog marks those rows `face_kind: substitute_shared` and documents the substitution semantics

### Requirement: Interface naming consistency

The SDK public interface SHALL follow one documented naming scheme: platform-specific functions use lowercase platform prefixes (`omp*` / `opencode*`), platform-specific types use capitalized prefixes (`Omp*` / `Opencode*`), platform-specific constants use UPPER_SNAKE with platform prefixes (`OMP_*` / `OPENCODE_*`), all exported constants are UPPER_SNAKE; the verb family covers apply / render / strip / normalize / is / create / bind / register / write / append / join / parse / latest / classify; contract families are distinguishable — canonical payload types carry `Canonical*`, signal-chain contracts belong to the SignalLifecycle family, adapter types carry platform prefixes. The naming rules SHALL be machine-asserted against the exported surfaces, and `NOOP_DELIVERY` SHALL be exported from the barrel.

#### Scenario: Rules documented

- **WHEN** the interface directory section of the first-principles document is read
- **THEN** it states the naming scheme rules (three-form platform prefix, verb family, constant case, contract families), and no exported symbol contradicts them

#### Scenario: Naming rule conformance

- **WHEN** the SDK barrel, adapters barrel, and utils surface are scanned for exported symbols
- **THEN** every exported symbol conforms to the documented scheme, and the consistency test asserts it

#### Scenario: Contract defaults exported

- **WHEN** a consumer imports the dispatch contract defaults from the package root
- **THEN** `NOOP_DELIVERY` resolves from the barrel

### Requirement: Interface consistency across platforms

The SDK interface directory SHALL classify every platform hook into exactly one of two states: `formal` (a canonical interface implemented in the SDK — either a native pair present on both platforms, or a one-sided interface promoted through a documented cross-platform substitute with one consistent interface name) or `pending` (no substitute exists; the interface SHALL be defined with its absence reason and a future substitution path, and SHALL NOT be implemented). No surface SHALL be silently absent. Catalog counts SHALL be machine-derived (63 hooks: 16 formal interfaces, 37 pending), never hand-maintained. Important interfaces (signal chain, session boundaries, compaction, delivery, PCL marking, session boundary lifecycle) SHALL be closed on both platforms — direct or substitute — and the closure SHALL be machine-asserted.

#### Scenario: No silent absence

- **WHEN** the interface directory is checked against the platform reference hook sets
- **THEN** every platform hook is classified formal or pending, and no row carries an absent-like status

#### Scenario: Substitute documented

- **WHEN** a one-sided platform hook is promoted through a substitute (e.g. OMP `session_shutdown` ↔ opencode `dispose`; OMP `before_agent_start` ↔ opencode `experimental.chat.system.transform`; OMP `tool_approval_requested` ↔ opencode `permission.ask`)
- **THEN** its row names the cross-platform substitute and the interface is implemented under one consistent canonical name on both faces

#### Scenario: Two-state consistency

- **WHEN** the interface directory is checked against `CATALOG`
- **THEN** every hook is `formal` or `pending`, no absent-like status exists, and the 16/37 counts derive from the catalog

#### Scenario: Substitute promotion

- **WHEN** a one-sided platform hook has a documented cross-platform substitute
- **THEN** the interface is promoted to formal under one consistent canonical name and implemented on both faces

#### Scenario: Pending list explicit

- **WHEN** a hook has no substitute (e.g. OMP `session_start`, opencode `chat.params`)
- **THEN** it appears in the pending list with the absence reason and the future substitution path (opencode v2 / platform alignment / event-stream extension), and zero implementation exists

#### Scenario: Important interfaces closed

- **WHEN** the closure assertion runs for the important interface set (signal chain, session boundaries, compaction, delivery, PCL marking, session boundary lifecycle)
- **THEN** every important interface has a non-empty surface on both platforms (direct or substitute), and the assertion passes

### Requirement: Consumer adapter layer minimalism

The SDK SHALL make the consumer adapter layer minimal: a consumer SHALL obtain the platform's full capability by instantiating the SDK surface and composing capability objects (`lifecycle.echo()` / `hints.use()` / `resident.use()`), without casts, without re-validation of canonical payloads, and without platform-knowledge leakage into consumer code. Consumer trees SHALL contain no `unknown`-narrowing casts of SDK bind results, no re-validation of canonical payloads, and no local copies of SDK-owned helpers (record guards, text joining, usage extraction, canonical-to-landing translation). Platform-specific helpers SHALL be single-sourced in the SDK. The consumer adapter layer SHALL be structurally minimal as well: a consumer's adapter files SHALL be bind shells plus the platform-entry shape — no option-shape guards, no handler definitions, no singleton assembly outside the module factory.

#### Scenario: Instantiate-and-bind consumer

- **WHEN** a consumer instantiates the SDK and composes capability objects
- **THEN** the consumer obtains the platform's full capability without casts, without canonical re-validation, and without platform-knowledge leakage

#### Scenario: No local SDK-helper copies

- **WHEN** consumer packages are scanned for helper implementations owned by the SDK (record guards, text joining, usage extraction, canonical-to-landing translation)
- **THEN** no consumer-local copy exists; consumers import the SDK single source

#### Scenario: No dead consumer registry surface

- **WHEN** consumer code that creates a registry but never dispatches through it is scanned
- **THEN** the dead surface is absent; consumers bind handlers directly through the SDK

#### Scenario: Structural minimality of adapter files

- **WHEN** a consumer package's platform adapter files are inspected
- **THEN** each adapter file contains only: the module factory call (creating the hooks/capability assembly), the `bind` call producing the platform registration, and the platform-entry shape export (OMP factory function / opencode `{ id, server }` module) — no business handler definitions, no option-shape guards, no lifecycle/discipline singleton assembly, no casts of bind results or canonical payload slots, and no dead files (empty modules, unused imports) in the adapter area

#### Scenario: Handler sets live in a module factory

- **WHEN** a consumer package's business handler sets are located
- **THEN** they are defined in a module factory (e.g. `createFidelityModule()` / `createContextModule()` in the package's `src/index.ts`) returning the hooks assembly, and every platform adapter file in the package binds that same factory's hooks — one module-local singleton per bundle, no per-adapter handler duplication

#### Scenario: Consumer packages structurally consistent

- **WHEN** the SDK's consumer packages (graph-fidelity, graph-fidelity-context) are compared structurally
- **THEN** both follow the same adapter-layer shape: factory module + per-platform bind-shell adapter files with platform-entry shape exports, same naming/location convention (module factory in `src/index.ts`, adapter shells at `src/adapter-omp.ts` / `src/adapter-opencode.ts`), and equivalent tsup entry wiring

#### Scenario: Structural conformance machine-asserted

- **WHEN** the consumer-minimalism assertion suite runs
- **THEN** it checks both behavior criteria (zero casts of SDK bind results and canonical payload slots, zero local helper copies) and the structural criteria (adapter files contain no handler definitions and no singleton assembly, dead adapter-area files absent, no consumer shape-descriptor imports), and all pass

#### Scenario: Bind-shell adapter purity

- **WHEN** a consumer's adapter file is inspected
- **THEN** it contains the module factory call, the bind call, and the platform-entry shape export only — no option-shape guard, no handler definition, no singleton assembly

### Requirement: Scenario-keyed hints contract

The SDK SHALL define the scenario-keyed hints contract: a canonical scenario event or payload carrying a scenario id from the closed set `{find, read, write, verify, run}` plus the hint-block payload, with adapter translation on both platform faces. The review scenario SHALL NOT be a member: review is role-triggered (graph review nodes carry their own standards), never tool-triggered. The unified scenario interface SHALL be consumed exclusively through the `hints` capability object — there SHALL be no separately surfaced factory (`createScenarioHints`), no attach interface, and no registry module: the classifier, the registry, and the renderer are internal to the capability. Classification SHALL return a compliance dimension in addition to the scenario key: the classify output SHALL be `{scenario?, compliant}` — `compliant` is true when the tool invocation used a promoted tool for the scenario (tool name in the scenario's promoted set, derived from the consumer map reverse lookup) and the invocation is not error-shaped. The render face SHALL accept the used tool name and interpolate it (with promoted tool names derived from the consumer-supplied tool map) into the hint body via `{usedTool}` / `{promoted}` markers; the SDK core SHALL carry zero hardcoded third-party tool vocabulary. Interpolation SHALL fail open: unknown markers render verbatim, never throw.

#### Scenario: Consumer classifies via SDK

- **WHEN** a consumer needs the scenario key and compliance verdict of a tool execution
- **THEN** it uses the classify face exposed by the `hints` capability
- **AND** the consumer contributes extension table DATA (tool→scenario entries) only, never classification vocabulary or heuristic logic

#### Scenario: Consumer queries registry by key

- **WHEN** a consumer resolves guidance for a tool execution
- **THEN** it queries through the same capability interface and receives the hint block
- **AND** no per-tool-event fragment classification is required

#### Scenario: Unknown scenario key fails loudly

- **WHEN** a consumer queries with a key outside the closed set
- **THEN** the query fails loudly naming the key and the candidate set

#### Scenario: Classifier returns no scenario for uncovered tools

- **WHEN** a tool invocation has no scenario coverage
- **THEN** the classify face returns no scenario key
- **AND** no hint is attached (fail-open)

#### Scenario: Vocabulary internal

- **WHEN** the SDK barrel export surface is inspected
- **THEN** no tool-set vocabulary constant (native tool sets, locate tokens, internal URI schemes) is exported
- **AND** no third-party tool-name string (serena / jcodemunch) appears anywhere in the SDK core, its comments, or its tests

#### Scenario: Consumer tool map extension

- **WHEN** a consumer passes a tool→scenario extension map to the `hints` capability
- **THEN** tools absent from the native platform rules are classified via the extension map entries
- **AND** the map MAY map a tool to no coverage by omitting it (fail-open)

#### Scenario: Native rules priority

- **WHEN** a tool name is covered by both a native platform rule and a consumer extension-map entry
- **THEN** the native rule wins and the platform behavior is never rewritten by consumer data

#### Scenario: read is unconditional

- **WHEN** the native `read` tool executes
- **THEN** it classifies as the read scenario regardless of the target path (file type, selector suffix, or extension never consulted)

#### Scenario: CLI locate and internal-URI rules preserved

- **WHEN** a bash command's leading token (after rtk/proxy wrapper strip) is a CLI locate token
- **THEN** it classifies as the find scenario
- **AND** when a write/content-read targets an internal-URI scheme route, it attaches no hint (exemption class)

#### Scenario: Review excluded

- **WHEN** the closed set is queried
- **THEN** it contains exactly the five ids `{find, read, write, verify, run}` and no review key

#### Scenario: Hint block payload body-only

- **WHEN** a scenario hint block is created or rendered
- **THEN** the payload carries the scenario id and body only — no title field
- **AND** the render output is the body text alone (no title line, no scene-restating heading); the body MAY carry `{usedTool}` / `{promoted}` markers resolved at render time

#### Scenario: Interface surface reduced

- **WHEN** a consumer resolves guidance through the capability interface
- **THEN** the interface exposes `classify`, `get`, and `render` only
- **AND** `has` and `list` are absent from the surface (no dead thin-wrapper members)

#### Scenario: Factory and attach surfaces absent

- **WHEN** the SDK barrel is inspected
- **THEN** `createScenarioHints`, `attachScenarioHints`, the `ScenarioHints` type, and all attach handles are absent — the `hints` capability object is the only scenario-registry entry

#### Scenario: Classify returns compliance dimension

- **WHEN** a tool invocation is classified against the closed scenario set
- **THEN** the classification output carries both the scenario key (or none, fail-open) and a boolean compliance verdict derived from the consumer tool map reverse lookup and the error verdict
- **AND** a promoted tool used without error is compliant; a native tool outside the promoted set is non-compliant; an error-shaped result is never compliant

#### Scenario: Render interpolates the used tool

- **WHEN** a hint body is rendered for a scenario with a concrete used tool name
- **THEN** the body contains the exact used tool name in a DO-NOT form (via `{usedTool}`) and promoted tool names derived from the consumer-supplied tool map (via `{promoted}`, representative names)
- **AND** no SDK-hardcoded third-party names are required to render

### Requirement: Dual-face injection equivalence

The SDK SHALL guarantee equivalent scenario-hint injection on both platform faces (opencode and OMP): the same scenario key produces the same hint content through both adapter translation tables, verified by the SDK test suite.

#### Scenario: Both faces deliver same content

- **WHEN** a scenario hint is emitted on either platform face
- **THEN** the delivered content is identical for the same scenario key and payload

### Requirement: Tool-result error verdict

The canonical tool-result payload SHALL carry a normalized error verdict: `isError` (the platform error flag) OR a content-embedded error-shape verdict computed at adapter normalization (start-anchored serena markers and the line-anchored platform exit line). The adapter SHALL compute the verdict once during payload normalization; consumers SHALL check the verdict and SHALL NOT re-implement error-shape detection. Non-string content SHALL fail open (verdict false, never throws).

#### Scenario: Content-embedded error detected at normalization

- **WHEN** a tool result carries a content-embedded error shape (serena validation/oversize marker or a platform exit line) that does not set the platform error flag
- **THEN** the adapter normalization marks the error verdict true
- **AND** the consumer checks the verdict and skips hint attachment

#### Scenario: Consumer has no error-shape detection

- **WHEN** the consumer tree is inspected after the migration
- **THEN** no consumer-side error-shape detection module exists — the verdict comes from the SDK canonical payload only

#### Scenario: Non-string content fails open

- **WHEN** the tool-result content is not a string
- **THEN** the error verdict is false and normalization never throws

### Requirement: Scenario hook attachment

The SDK SHALL expose scenario-hint wiring as the `hints` capability object (`hints.use(fn, hook?)`) per the Built-in middleware modules requirement. The configuration-object form (`hints.use({entries, toolMap, feedback})`) SHALL be removed with no aliases, no re-exports, no deprecation paths. `fn` is the consumer-supplied display-decision middleware. Classification SHALL reuse the platform-native + consumer-map rule order (URI exemption, native tool-name sets, CLI-locate tokens, consumer extension map, fail-open) with native priority unchanged. The consumer extension map SHALL be CAPTURED at wiring time (`use(fn)` reads `fn.toolMap` once); mutating `fn.toolMap` after wiring SHALL NOT affect the already-wired chain. The middleware SHALL skip attachment when the classified invocation is compliant (used a promoted tool, not error-shaped): a compliant tool result SHALL pass through with zero hint append and zero feedback. Attachment SHALL execute through the middleware chain on the default `tool_result` canonical hook; the display function's returned text is what attaches.

#### Scenario: Attach wires the default tool_result seam

- **WHEN** a consumer wires `hints.use(fn)` without an explicit hook target
- **THEN** the scenario-hints middleware runs on the `tool_result` canonical event
- **AND** a successful non-compliant classified execution appends the display function's returned hint text to the result payload

#### Scenario: Attach targets any canonical hook

- **WHEN** a consumer passes an explicit hook target (single or array) to `hints.use`
- **THEN** the middleware runs on each named hook
- **AND** an unknown hook name fails loudly (named error, no silent skip)

#### Scenario: Repeated attach concatenates chains

- **WHEN** a consumer wires hint middleware to the same hook more than once (or alongside other middleware)
- **THEN** each registration appends to the existing chain (additive semantics — no overwrite, no shadowing)
- **AND** all attached middleware execute in registration order

#### Scenario: Unwire detaches the wiring

- **WHEN** a consumer calls `unwire()` on the hints capability's wiring
- **THEN** the middleware is removed from its hook
- **AND** subsequent classified executions attach no hint from that wiring

#### Scenario: Wiring captures the map snapshot

- **WHEN** a consumer wires `hints.use(fn)` and then mutates `fn.toolMap`
- **THEN** the already-wired chain keeps classifying with the map captured at wiring time (post-wiring mutation has no effect on the wired chain)

#### Scenario: Compliant invocation attaches nothing

- **WHEN** a tool result classified into a scenario is compliant (the tool name belongs to the scenario's promoted set and the result is not error-shaped)
- **THEN** the tool result passes through the chain with no hint block appended and no feedback line emitted (the display function receives `compliant: true`; the SDK hard floor attaches nothing regardless of its return)

#### Scenario: Non-compliant invocation attaches the rendered hint

- **WHEN** a tool result classified into a scenario is non-compliant (tool name outside the promoted set) and not error-shaped
- **THEN** the display function's returned text is appended verbatim to the tool result and a notify feedback line is emitted

### Requirement: Proactive feedback on hint attachment

When a consumer attaches information through the scenario-hint interface and a hint is successfully attached to a tool-result payload, the SDK SHALL proactively emit a `FeedbackLine` through the unified output/feedback interface (`createFeedbackChannel`), displaying the attached hint content to the user. The emission kind SHALL default to `notify`; the per-attach `feedback` config option SHALL be removed with the config shape (no `compliance` kind, no disable path — emission is notify on every attachment). Fail-open SHALL hold: a throwing delivery never throws into the event loop. On the OMP face, when the platform delivery surface `ctx.ui.notify` is absent, the delivery SHALL degrade to the `appendEntry` transcript channel so the attached guidance remains observable (or auditable as undelivered) instead of silently no-op'ing.

#### Scenario: Attachment emits notify by default

- **WHEN** a hint is successfully attached
- **THEN** the SDK emits `{ kind: 'notify', text: <attached hint> }` through the unified feedback channel
- **AND** the text is delivered to the user on both faces (omp notify / opencode toast with transcript fallback)

#### Scenario: OMP notify surface absent degrades to appendEntry

- **WHEN** a notify FeedbackLine is emitted on the OMP face and `ctx.ui` (or `ctx.ui.notify`) is absent
- **THEN** the delivery SHALL degrade to the `appendEntry` transcript channel rather than silently dropping the line
- **AND** when `appendEntry` is also unavailable, the delivery SHALL record the undelivered state (fail-open) without throwing into the event loop

#### Scenario: Compliance kind

- **WHEN** the config-shape feedback option is referenced
- **THEN** no `compliance` feedback kind exists and no per-attach `feedback` option is accepted — emission is notify on every successful attachment

#### Scenario: Feedback disabled

- **WHEN** a hint is successfully attached
- **THEN** no `feedback: false` disable path exists — a notify FeedbackLine is always emitted on attachment

#### Scenario: No feedback on compliant skip

- **WHEN** a tool result is compliant and the middleware skips attachment
- **THEN** no FeedbackLine is emitted for that tool result (the compliant path is silent)

#### Scenario: Feedback on attached hint

- **WHEN** a hint is successfully attached to a non-compliant tool result
- **THEN** a notify FeedbackLine carrying the attached hint body is emitted

### Requirement: Factory surface removed

The SDK SHALL maintain the removal of the factory surface (`createScenarioHints` and the `ScenarioHints` type) from the public barrel; no aliases, no re-exports, no deprecation paths. With the capability surface, the former attach interface (`attachScenarioHints`) SHALL also remain absent — the `hints` capability object is the only scenario-registry entry.

#### Scenario: Barrel without factory

- **WHEN** the SDK barrel is inspected
- **THEN** `createScenarioHints`, the `ScenarioHints` type, and `attachScenarioHints` are absent from the exported surface

### Requirement: Resident hook attachment

The SDK SHALL expose resident-prompt wiring as the `resident` capability object (`resident.use(config)`) per the Built-in middleware modules requirement. The former standalone `resident` middleware value is replaced by the capability; the resident block (`[resident]` marker + heading, one prefixed row per entry) SHALL be rendered and applied to the system prompt via the existing dedup/self-heal mechanism through the middleware chain on the default `before_agent_start` canonical hook. The target hook SHALL be parameterizable to any canonical event in the catalog (single or array); an unknown hook name SHALL fail loudly (named error). Repeated registration SHALL concatenate chains (additive semantics — no overwrite, no shadowing); `unwire()` SHALL detach. Resident content SHALL remain consumer-owned data captured at bind time; the SDK holds no resident content.

#### Scenario: Attach wires the default resident seam

- **WHEN** a consumer wires `resident.use(config)` without an explicit hook target
- **THEN** the resident middleware runs on the `before_agent_start` canonical event
- **AND** the rendered resident block is applied to the system prompt on both platform faces

#### Scenario: Attach targets any canonical hook

- **WHEN** a consumer passes an explicit hook target (single or array) to `resident.use`
- **THEN** the middleware runs on each named hook
- **AND** an unknown hook name fails loudly (named error, no silent skip)

#### Scenario: Repeated attach concatenates chains

- **WHEN** a consumer wires resident middleware to the same hook more than once
- **THEN** each registration appends to the existing chain (additive semantics)
- **AND** all attached middleware execute in registration order

#### Scenario: Unwire detaches the wiring

- **WHEN** a consumer calls `unwire()` on the resident capability's wiring
- **THEN** the middleware is removed from its hook
- **AND** subsequent system-prompt builds apply no resident block from that wiring

#### Scenario: Bind resident option removed

- **WHEN** a consumer inspects the public surface for a `resident` option on the bind path
- **THEN** the option is absent — the bind path accepts adapter + hooks only, and resident wiring is the `resident` capability (no aliases, no deprecation path)

#### Scenario: Resident content stays consumer-side data

- **WHEN** resident content is supplied for the resident capability
- **THEN** the content is consumer-owned data (`{ id, title, text }` entries) captured at bind time; the SDK holds no resident content

### Requirement: Middleware composition

The SDK SHALL expose per-canonical-hook middleware chains: for each canonical hook, a namespace SHALL accept middleware via `use(middleware)` — additive registration (multiple middleware on one hook concatenate into one chain, never shadowing), chainable (use returns the same namespace), detachable (`unwire()` removes an attached middleware), and unknown hook targets SHALL fail loudly with a named error. Capability objects (lifecycle / hints / resident) SHALL be sugar over this chain registry: each capability self-wires its middleware onto its default seam. `hooks.<hook>.use(mw)` SHALL remain the low-level escape hatch for custom middleware. There SHALL be exactly one registration surface for hook handling: the middleware chain. The platform adapter SHALL be bound to a chain registry so the platform-facing registration objects consumers wire into their platform entries are produced from the composed chains.

#### Scenario: Additive use on a canonical hook

- **WHEN** a consumer calls `hooks.toolResult.use(mw1)` then `hooks.toolResult.use(mw2)`
- **THEN** both middleware run in registration order on every `tool_result` dispatch, and neither shadows the other

#### Scenario: Capabilities assemble chains

- **WHEN** a consumer registers capability objects and custom middleware on the same canonical hook
- **THEN** all middleware run in registration order on every dispatch, and capabilities are indistinguishable from custom middleware in chain semantics (additive, unwire-able)

#### Scenario: Chainable and detachable

- **WHEN** a consumer calls `hooks.toolResult.use(mw1).use(mw2)` and later calls `hooks.toolResult.unwire(mw1)`
- **THEN** the chain runs `mw2` only, and unwire removes exactly the attached middleware

#### Scenario: Unknown hook fails loudly

- **WHEN** a consumer calls `use` on a hook name that is not a canonical event
- **THEN** the SDK throws a named error — no silent skip, no no-op namespace

### Requirement: Middleware signature

Middleware SHALL be Effect transformers: `(self: Effect<HandlerResult, CanonicalError, DeliveryContext>) => Effect<HandlerResult, CanonicalError, DeliveryContext>` — no explicit `next` continuation. Short-circuit SHALL be expressed by returning a terminal effect (succeed/fail) instead of running `self`; downstream steps then never execute. The canonical event payload SHALL be available through the effect environment (a service provided per dispatch), not as a positional parameter or closure.

#### Scenario: Pass-through composition

- **WHEN** a chain of two middleware runs on an event and neither returns a terminal effect
- **THEN** each runs in order and the final handler result is delivered once

#### Scenario: Short-circuit

- **WHEN** a middleware returns `Effect.succeed(...)` (or `Effect.fail(...)`) without running `self`
- **THEN** the rest of the chain never executes and the terminal result is delivered — no downstream middleware runs

#### Scenario: Event via the environment

- **WHEN** a middleware needs the canonical event
- **THEN** it reads it from the effect environment service provided per dispatch — no event parameter threading, no closure capture of the payload

### Requirement: Composed delivery services

The SDK SHALL provide the delivery and event services per dispatch through the execution path: the DeliveryContext (notify / appendEntry / mutate channels) and the per-dispatch canonical event SHALL be provided as Effect services before the chain runs (per-dispatch provision — `Effect.provideService`; the adapter, as the delivery translation boundary, constructs the platform delivery translation per event — that construction is adapter-owned translation, never consumer-visible dispatch internals). Built-in capability configuration SHALL NOT be Effect services: it is captured at bind time as plain objects. The SDK SHALL document an isolated-test path: consumers and tests run chains with substitute delivery services via service provision (substituting DeliveryContext directly — the pattern exercised by the SDK and consumer suites). The SDK SHALL NOT require consumers to hand-build delivery context objects in their dispatch code.

#### Scenario: Layer-provided delivery

- **WHEN** a chain executes
- **THEN** DeliveryContext and the canonical event are satisfied from the per-dispatch provision before the chain runs — no consumer-visible object-literal construction in the dispatch path; the adapter owns the platform delivery translation

#### Scenario: Config not a service

- **WHEN** a capability's middleware reads its configuration
- **THEN** it reads the configuration captured at bind time (plain object) — no config Service in the effect environment, no config Layer per dispatch

#### Scenario: Isolated test runtime

- **WHEN** a test wants to run a chain with a fake delivery channel
- **THEN** it provides the substitute DeliveryContext service directly on the chain (per-dispatch provision) and runs the chain against it

### Requirement: Single execution face

The SDK SHALL execute a chain as ONE Effect with a per-adapter async execution strategy: both the OMP face and the opencode face SHALL run the chain via the async path (`runPromise`) — the OMP platform awaits handler promises (handler contract `(event, ctx) => Promise<R | void> | R | void`, awaited by the extension runner). There SHALL be no synchronous execution face, no `LoudExecutionError`, and no sync/async discrimination machinery: a chain containing async programs SHALL be awaited and the settled result delivered on both faces. The former dual-face dispatch API SHALL remain removed; one execution entry remains.

#### Scenario: Synchronous chain on the sync face

- **WHEN** a chain contains only synchronous programs and executes on the OMP face
- **THEN** it runs and its result is delivered — execution is awaited per the async-face strategy; no synchronous execution entry exists

#### Scenario: Async chain on the sync face fails loudly

- **WHEN** a chain contains an async program
- **THEN** it is awaited on the async face and the settled result is delivered on both OMP and opencode — the former sync-face loud-failure path (`LoudExecutionError`) no longer exists

#### Scenario: Async chain on the async face

- **WHEN** a chain contains an async program and executes on either the OMP or opencode face
- **THEN** it is awaited and the settled result is delivered — no error, no partial delivery, no fire-and-forget

#### Scenario: No sync face exists

- **WHEN** the SDK public surface is inspected
- **THEN** no sync execution entry (`runChainSync`), no `LoudExecutionError`, and no async-blocking detection surface are exported

#### Scenario: OMP tool_result async chain delivers

- **WHEN** a consumer binds an async `tool_result` chain (e.g. an MCP round-trip) on the OMP face
- **THEN** the platform receives the awaited handler promise and the delivered result is observable — the round-1 LoudExecutionError production failure no longer occurs

### Requirement: Built-in middleware modules

The SDK SHALL expose the scenario-hints, resident, and lifecycle capabilities as capability objects composed with the chain registry: `hints` (scenario hints), `resident` (resident prompts), and `lifecycle` (signal-lifecycle echo). Capability method names SHALL NOT repeat the capability name (`hints.use()` / `resident.use()` / `lifecycle.echo()`). Each capability SHALL self-wire its middleware to a documented default canonical hook (`hints` → `tool_result`, `resident` → `before_agent_start`, `lifecycle` → the echo seam) and SHALL accept an explicit hook override. Capability configuration SHALL be captured at bind time as plain values — the hints display function is captured at bind time; no Effect config Services, no constructor arguments at middleware execution. The former standalone middleware values are replaced by the capabilities.

#### Scenario: Scenario hints as middleware

- **WHEN** a consumer wires `hints.use(fn)`
- **THEN** scenario hints classify SDK-side and append the display function's returned text on the tool-result payload through the middleware chain on the default `tool_result` seam, and proactive FeedbackLine emission (notify) is preserved

#### Scenario: Resident as middleware

- **WHEN** a consumer wires `resident.use({ content, feedback })`
- **THEN** the resident block is rendered and applied to the system prompt on the default `before_agent_start` seam through the middleware chain, with dedup/self-heal preserved

#### Scenario: lifecycle.echo capability

- **WHEN** a consumer registers `lifecycle.echo(config)`
- **THEN** the echo chain (run-frame identity echo rendering and application) runs on the lifecycle default seam and consumes the canonical event through the effect environment — no consumer-side platform shape descriptors are involved

#### Scenario: Hook override

- **WHEN** a consumer passes an explicit hook target (single or array of canonical event names) to a capability
- **THEN** the capability's middleware runs on each named hook
- **AND** an unknown hook name fails loudly (named error, no silent skip)

#### Scenario: Config via services

- **WHEN** a consumer binds capabilities
- **THEN** the configuration (the hints display function, resident content) is captured once at bind/composition time and is available to the middleware without per-dispatch Layer provision — no config Service in the effect environment, no constructor arguments, no global state

### Requirement: Public surface minimality

The SDK barrel SHALL export only symbols consumed by production consumers or required by the SDK's documented capability surface; dead or test-only public re-exports SHALL be removed under the no-backward-compatibility promise. The barrel SHALL NOT export: `BIND_TAG_SCHEMA` (zero consumers), `START_MARKERS` / `EXIT_LINE_MATCHER` / `isErrorShaped` (internal error-shape machinery), `PENDING_INTERFACES` (test-only). The interface-consistency test suite SHALL machine-assert the absence of dead public exports.

#### Scenario: Dead exports absent from barrel

- **WHEN** the barrel's export list is checked against the zero-consumer/test-only denylist
- **THEN** none of the denylisted symbols appear in the barrel exports

#### Scenario: Internals still usable by SDK code

- **WHEN** SDK-internal code needs error-shape detection or pending-interface entries
- **THEN** the symbols remain defined in their owning modules and reachable via module-relative imports (only the barrel re-export is removed)

### Requirement: Hint display-decision function

The display-decision middleware SHALL be a function `fn(ctx) => string | string[] | null`. `ctx` SHALL carry the classification verdict `{scenario?, compliant?}`, the invoked tool name `usedTool`, the normalized error verdict `errorShaped`, and the promoted tool set for the matched scenario. The promoted set SHALL be resolved from the CONSUMER MAP CAPTURED AT WIRING TIME (snapshot semantics — see Scenario hook attachment). The `hints.classify` face SHALL classify against the LATEST wiring's captured map snapshot (single source of truth; no divergence from active chains). The function SHALL decide display: return a string or string array (attached verbatim as hint text, multi-group preserved), or `null` to show nothing. The function SHALL compose text directly — no template marker language, no interpolation of `{usedTool}`/`{promoted}` markers. Fail-open SHALL hold: a throwing display function never throws into the event loop.

#### Scenario: Compliant invocation suppressed (hard floor)

- **WHEN** `ctx.compliant` is true
- **THEN** nothing attaches and no feedback line emits — the SDK discards any non-null display-function return (silent regardless of the fn's decision)

#### Scenario: Multi-group hint text

- **WHEN** the display function returns a string array
- **THEN** the entries attach in order, as written (group separator `; ` is a copy concern, not an SDK transform)

#### Scenario: Throwing display function

- **WHEN** the display function throws
- **THEN** the error is contained (fail-open), nothing attaches, and the run is unaffected

#### Scenario: Ctx carries classification and invocation facts

- **WHEN** the display function is invoked
- **THEN** its ctx carries `{scenario?, compliant?, usedTool?, errorShaped, promoted?}` with the promoted set resolved from the wiring-time map snapshot (SDK core stays free of third-party vocabulary)

#### Scenario: Classify reads the latest wiring snapshot

- **WHEN** a consumer wires fn A (map M1) then fn B (map M2) and calls `hints.classify`
- **THEN** classify resolves against M2 (the latest wiring's snapshot) while chain A continues classifying with M1 — no divergence between the classify face and the active chains

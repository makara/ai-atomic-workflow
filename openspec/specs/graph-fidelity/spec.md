# graph-fidelity Specification

## Purpose

The merged platform-seam module: executes the graph system's signal discipline on platform seams — per-call discipline echo, working-face context reduction (fidelity dedup/error, compression, consumed-elision), and observability accumulation — as one plugin whose transform chain is composed exactly once, publishable as an npm package. OMP distribution is the installed-plugin channel (`omp.extensions` manifest via `omp plugin`/npm), opencode resolves `exports["./server"]`, and the marketplace catalog entry is generated and mirror-pinned (ADR 0153).

## Requirements

### Requirement: Settlement feedback surfaces stay consistent across consumer docs

MODIFIED: consumer documentation (ADR index rows, ADR bodies, delivery skills, README) SHALL state that R2 cost economy (context management, settlement feedback) is ACTIVE since the rebuild (ADR 0186 supersedes the suspension, ADR 0175; first-principles graph-fidelity-context-management.md rev.7), and SHALL NOT narrate the pre-rebuild suspended state as current. The headroom MCP compressor SHALL NOT be named as a base-package surface — it is the graph-fidelity-context module's internal dependency. Historical records (CHANGELOG entries predating activation, ADR 0175 decision body, ADR historical records) SHALL be preserved as history with revision notes where they could be misread as current state. The settlement/telemetry narrative SHALL match the shipped implementation (first-sight processing, cache telemetry, notify/display via the interface layer).

#### Scenario: Index row states notify channel

- **WHEN** a reader checks the ADR index 0175 row
- **THEN** it states the record was superseded by 0186 (activation/rebuild) rather than the suspension as active

#### Scenario: Historical CHANGELOG entries preserved

- **WHEN** a reader opens CHANGELOG `[Unreleased]`
- **THEN** pre-activation suspension entries remain as historical facts, and a new entry states activation (ADR 0186, first-sight processing active)

#### Scenario: Index rows state suspension

- **WHEN** a reader checks the ADR index rows for 0171/0173/0174
- **THEN** they note the R2 activation (ADR 0186) rather than presenting notify/showToast settlement or compression as suspended

#### Scenario: First-principles doc states the redesign

- **WHEN** a reader opens `docs/first-principles/graph-fidelity-context-management.md`
- **THEN** the doc carries rev.7 with the SUSPENDED status removed, the redesigned fundamental requirements (R2 restructured, R3 cache utilization, tag-based classification), the implementation requirements (R10–R13 first-sight model), and the activation record reference (ADR 0186)

### Requirement: Single merged plugin module

**Before**: The platform-seam surface is delivered as ONE npm-publishable package (named by function, e.g. `graph-fidelity`) that absorbs the former signal-seams and context-fidelity packages; exactly one package name is referenced for both the OMP hook entry and the opencode plugin entry.

**After**: The platform-seam surface SHALL be delivered as TWO packages: the base package `@ai-atomic-workflow/graph-fidelity` (OMP hook entry + opencode plugin entry + interface export surface, zero runtime deps) and the additional reference package `@ai-atomic-workflow/graph-fidelity-context` (private, reference-only, not deployed). Exactly one package name SHALL be referenced per platform entry; no former package name (`signal-seams`, `context-fidelity`) SHALL be required. Both faces SHALL continue to derive the echo line from the same shared pure function.

#### Scenario: Single package name

- **WHEN** a consumer installs the base module
- **THEN** exactly the base package name is referenced for both the OMP hook and the opencode plugin, and no former package name is required

#### Scenario: Additional package not deployed

- **WHEN** a consumer installs the base module without the additional package
- **THEN** runtime behavior is unchanged (echo-only chain); the additional package is not loaded and not required

#### Scenario: Shared implementation core

- **WHEN** the OMP face and the opencode face run the discipline echo
- **THEN** both faces derive the echo line from the same pure function, and the generated lines are byte-identical

### Requirement: Transform-chain composition is single-source

**Before**: The base package's context transform pipeline composes the discipline echo only; the composition machinery lives in the base package (core chain modules + lifecycle facade).

**After**: The R1 signal chain (normalization, frame anchoring, echo rendering, chain application, resident injection machinery) SHALL be owned by the platform-hooks-sdk as a core capability. The base package adapters SHALL consume the chain from the SDK (create-factory + typed lifecycle contract) and SHALL hold only platform entry wiring, message-shape adaptation via SDK-provided shape descriptors, and discipline hints. Both platform faces SHALL continue to execute the same single composition in the same order.

#### Scenario: Both faces run the identical chain

- **WHEN** either platform delivers a message transcript to the base plugin
- **THEN** the messages pass through the same single composition sourced from the SDK, and chain order is asserted by exactly one test

#### Scenario: Change detection is single-source

- **WHEN** a transform pass changes no message
- **THEN** the chain reports no change once (one shared detection path), and adapters forward the transcript unchanged

#### Scenario: Adapter boilerplate is single-source

- **WHEN** the two face adapters are compared for the listed shape operations
- **THEN** each operation is implemented in exactly one shared location (the SDK), and the adapters contain only message-shape adaptation and hook-registration tables

#### Scenario: Cross-face echo byte-identity holds

- **WHEN** both faces render the discipline echo for the same frame facts
- **THEN** the generated lines are byte-identical

#### Scenario: Base ships no chain

- **WHEN** the base package source tree is inspected after migration
- **THEN** no chain implementation module (normalize/echo/runframe/resident machinery) remains in the base package, and the base imports the chain from the SDK

### Requirement: Discipline echo contract (anchored frame detection + canonical dedup)

The per-call discipline echo derives ONE `[seam]` line per LLM call from the most recent run frame and appends it to the most recent user-like message. "User-like" SHALL mean role `user`, `developer`, or `custom` (single-source `isUserLike(role)` predicate); OMP 17.2.15 delivers user input via `custom_message` converted to role `developer`, so user-role-only anchoring silently no-ops on sessions whose input arrives through custom messages (skill invocation, ask results, auto runs). The line SHALL be an identity pointer plus progress — `▣ [seam] node <id> · N/M` — carrying node id (pointer, never copying the frame's `declared operations`/`out of scope` clause) and the node progress segment (`N/M` from the frame when present). The value-ratio graphic segment (`│████░░│ cur/ref`) renders when benefit facts exist — the benefit ledger is the single render source (ADR 0190/0191); with no benefit facts the line renders without it. Metering deltas remain out of the line surface.

#### Scenario: Inline format pinned

- **WHEN** the spec's discipline-line format string is compared with the frame-contract pin
- **THEN** they are identical, and a test asserts the equality (spec-format-pin.test.ts)

#### Scenario: No frame degrades silently

- **WHEN** the outgoing messages contain no run-id anchored run frame
- **THEN** no echo line is appended and the request proceeds unchanged

#### Scenario: Documentation text never renders an echo

- **WHEN** the outgoing messages contain text with a `## Run Frame` heading and `node <word>` / `declared operations` prose (e.g. skill documentation) but no run-id anchored frame
- **THEN** no echo line is rendered — the doc text is never treated as a frame boundary

#### Scenario: Anchored frame renders

- **WHEN** the outgoing messages contain a run frame in the canonical shape `Run <uuid> · node <nodeId> · type <type> …` with progress `· 3/25`
- **THEN** the echo line renders `▣ [seam] node <nodeId> · 3/25` (identity pointer + progress — byte-identical to the pinned format, with no value-ratio bar, no budget/mode/flag segments)

#### Scenario: Canonical dedup skips identical echo

- **WHEN** the most recent user-like message already carries a line byte-equal to the exact canonical echo line for the current frame
- **THEN** no second line is appended (one seam line per user-like message)

#### Scenario: Non-canonical seam line is replaced

- **WHEN** the most recent user-like message carries a `[seam]`-prefixed line that is NOT the canonical line for the current frame (corrupted render, stale node, foreign marker)
- **THEN** the non-canonical line is stripped and the canonical line appended in its place — the session self-heals without manual cleanup

#### Scenario: Echo and elision agree on frames

- **WHEN** the same transcript whose frames sit in user-like role messages is processed by the echo renderer
- **THEN** the shared parser identifies the frame set from the anchored frames; the elision planner does not exist in the rebuilt R2 module (ADR 0186) — the echo renderer is the sole frame consumer

#### Scenario: Frame clause is not copied

- **WHEN** a main-node frame declares `[locate, read, write, review]` operations
- **THEN** the injected echo line contains the node id and deltas, and does not contain the `declared operations` or `out of scope` clause text

#### Scenario: One line per call, refreshed in place

- **WHEN** graph-fidelity processes an LLM call for an active node
- **THEN** at most one `[seam]` line is injected — byte-identical renders skip re-injection, changed renders replace the prior line in place (never accumulating)

#### Scenario: Echo appends to a developer-role user message

- **WHEN** the outgoing messages contain a run-id anchored frame and the most recent user-like message has role `developer` (OMP custom_message delivery shape) with no prior seam line
- **THEN** the echo line is appended to that developer-role message — the model-side seam renders on sessions with zero `user`-role messages

#### Scenario: Echo appends to a custom-role message

- **WHEN** the most recent user-like message has role `custom`
- **THEN** the echo line is appended to it (same anchor rule as `user`/`developer`)

#### Scenario: No user-like message falls back to the frame message

- **WHEN** the outgoing messages contain a run-id anchored frame but no user-like message exists (no `user`/`developer`/`custom` role)
- **THEN** the echo line is appended to the message carrying the latest anchored frame (ADR-0164 — the frame-derived discipline signal is never dropped on frame-only transcripts)

#### Scenario: No frame at all degrades silently

- **WHEN** the outgoing messages contain no run-id anchored frame
- **THEN** no echo line is appended and the request proceeds unchanged (fail-open)

### Requirement: Progress segment N/M

The echo line renders node progress as `<index>/<total>` when the total is known. The handler extends the Run Frame block with a `· N/M` segment (N = node index in run order, M = total node count from the run snapshot). The renderer includes the progress segment when the frame carries it, and degrades to the bare identity pointer when absent.

#### Scenario: Progress renders from frame N/M

- **WHEN** the frame block carries `· 3/25`
- **THEN** the echo line renders `node <id> · 3/25`, and a format pin test asserts the exact shape

#### Scenario: No progress without frame data

- **WHEN** the frame carries no N/M segment
- **THEN** the echo line renders the identity pointer alone (no fabricated progress)

### Requirement: Optional seams declared not shipped

Consumed-elision and session.compacting archive SHALL NOT ship functional claims; the module SHALL NOT claim either. Input-seam PCL marking IS SHIPPED (mechanical vocabulary detection only — marking, never routing, never rewriting the user's text; ADR 0171). Remaining optional seams (todo_reminder alignment) SHALL remain "Declared, not shipped" roadmap items with no functional claims. Subagent coverage SHALL NOT be an optional seam: echo observation events fire in subagent sessions on both platforms (platform-verified dispatch), skipping only frame-less requests.

#### Scenario: Roadmap wording

- **WHEN** the module README lists optional seams
- **THEN** only todo_reminder alignment is labeled as a not-shipped roadmap item with no code entry point claimed; PCL input-seam marking is listed as shipped (mark-only); no elision or archive claim appears anywhere

#### Scenario: Subagent coverage not optional

- **WHEN** module docs describe subagent behavior
- **THEN** they declare echo observation events fire in subagent sessions on both platforms (OMP preloaded extension paths; opencode shared prompt pipeline), frame-less requests skipped — no off-by-default seam offered to subagents

#### Scenario: Elision and archive seams functional

- **WHEN** a plugin is installed and a consumer node boundary is crossed, or platform compaction is about to run
- **THEN** the module SHALL NOT emit consumed-elision L2 pointers or plugin-authored compaction archive markers; the platform-native mechanisms own residue, and the seam output SHALL contain no elision/archive annotation from this module

### Requirement: Probe marked dev-only

The prompt-assembly-probe package is documented as a development-time contract-verification tool, not a runtime deliverable, and is not part of the install surface.

#### Scenario: Dev-only documentation

- **WHEN** the probe package README and the root README describe the probe
- **THEN** it is explicitly marked dev-only / non-runtime

### Requirement: Adapter typing against real platform types

**Before**: Real platform types SHALL appear in the platform-hooks-sdk adapter files only. graph-fidelity's platform entry points SHALL consume the SDK's platform-shaped registration result; graph-fidelity itself SHALL NOT declare platform contract types.

**After**: Real platform types and platform message models SHALL appear in the platform-hooks-sdk adapter files only. The base package SHALL consume platform message shapes and shape descriptors (message models, text extraction, shape readers) from the SDK adapters; graph-fidelity itself SHALL NOT declare platform contract types and SHALL NOT own platform message models.

#### Scenario: OMP factory typed

- **WHEN** the SDK OMP adapter is type-checked
- **THEN** its registration output satisfies `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`, with event handlers registered via `pi.on` against the typed event overloads

#### Scenario: opencode factory typed

- **WHEN** the SDK opencode adapter is type-checked
- **THEN** its registration output satisfies `{ server: Plugin }` where `Plugin = (input: PluginInput) => Promise<Hooks>`, and a test asserts the assignment compiles

#### Scenario: no duck-typed seam

- **WHEN** the SDK adapters directory is scanned for platform-type imports
- **THEN** the adapter files import the real platform type packages, and no adapter-local duck-typed message-model interface exists in the base package

#### Scenario: Shape descriptors adapter-owned

- **WHEN** the base adapters build the chain's shape parameters
- **THEN** they import the shape descriptors and message text extraction from the SDK adapters, and the base holds no platform message model definitions

### Requirement: Distribution channels declared

MODIFIED: the package SHALL declare the distribution channels each platform's loader actually consumes: an `omp.extensions` manifest field listing the OMP adapter entry (relative to the package root) for installed-plugin discovery, and an `exports["./server"]` entry for the opencode npm-package entry convention. The OMP installed-plugin channel SHALL be the single OMP distribution path — repo-dev installs use the `omp plugin` command (package path or npm name) and the marketplace catalog SHALL declare the graph-fidelity plugin entry with a non-empty package-domain description. The marketplace and package descriptions SHALL name the shipped base-package capabilities — headroom compression is removed from the capability list (it ships with the graph-fidelity-context module, whose own marketplace entry describes it).

#### Scenario: manifest declared

- **WHEN** the package.json is inspected
- **THEN** it declares `omp.extensions` containing `./dist/omp.js` and `exports["./server"]` pointing at `./dist/opencode.js`

#### Scenario: server entry declared

- **WHEN** the package exports are inspected
- **THEN** `exports["./server"]` resolves to the opencode adapter bundle, and a mirror test fails when the entry is missing

#### Scenario: deployed bundle loads without node_modules

- **WHEN** a bare folder copy of the package (no `node_modules` anywhere in its resolution chain) imports `dist/omp.js`
- **THEN** the import succeeds and the default export is the OMP extension factory — no `ResolveMessage` for `@modelcontextprotocol/sdk` or any other bare specifier

#### Scenario: opencode config uses the bundle

- **WHEN** `opencode.json` is inspected
- **THEN** its plugin array references `./packages/graph-fidelity/dist/opencode.js` and no tui-kind bundle reference exists anywhere in the repo

#### Scenario: plugin installed via omp plugin

- **WHEN** the package is installed with the `omp plugin` command
- **THEN** `omp plugin list` reports the plugin and the OMP face loads from `dist/omp.js` with no load error

#### Scenario: deploy copy comment accurate

- **WHEN** the repo tree is inspected
- **THEN** no generated deploy copy exists to carry a header comment — the installed-plugin channel replaces the native-scan shim, and no script emits one

#### Scenario: marketplace entry declared

- **WHEN** the marketplace catalog is inspected
- **THEN** it contains a graph-fidelity plugin entry whose description is the package-domain wording (non-empty), generated by the manifest generator

#### Scenario: no generated deploy copy

- **WHEN** the repo tree is inspected
- **THEN** `.omp/extensions/graph-fidelity.ts` does not exist and no script emits it

#### Scenario: Marketplace description reflects shipped capabilities

- **WHEN** the marketplace catalog entry is read
- **THEN** its description names the shipped capabilities: per-call discipline echo, errored-result fidelity reduction, PCL input-seam marking, and node-boundary settlement with measured metering — and SHALL NOT name headroom compression

#### Scenario: Package description reflects shipped capabilities

- **WHEN** the package.json description is read
- **THEN** it names the same shipped capability set (echo, errored-result reduction, PCL marking, settlement/metering) consistently with the marketplace entry wording — and SHALL NOT name headroom compression

### Requirement: Deploy mirror test tolerance

The deploy mirror test SHALL tolerate a missing `opencode.json` (untracked environment fact): the opencode registration assertion SHALL skip when the file is absent, never fail the suite on a fresh clone.

#### Scenario: Mirror test skips on missing config

- **WHEN** `opencode.json` does not exist at the repo root
- **THEN** the mirror test skips the opencode-registration assertion with a documented reason, and the suite stays green

### Requirement: External-dependent acceptance items marked blocked

An acceptance item whose verification depends on an external event (e.g. platform restart to observe session-level effects) SHALL be marked `blocked (external)` in the change's tasks and SHALL NOT be checked complete; its verification evidence SHALL be referenced from the verification record, and reverse-validation SHALL flag unverified completion claims.

#### Scenario: restart-dependent item not completed

- **WHEN** a tasks list contains an acceptance item requiring a platform restart to verify
- **THEN** the item is marked `blocked (external)` with the reason, never `[x]`, and the verification record references the pending evidence

### Requirement: Plugin closure end-to-end coverage

The graph-fidelity test suite SHALL exercise the opencode `server` plugin through its real registration surface — the `experimental.chat.messages.transform` hook with a mock `PluginInput` — not only the exported pure functions. The covered closure state SHALL include the environment mode read and the transform chain through the shared composition.

#### Scenario: Server plugin invoked end-to-end

- **WHEN** the test suite runs the opencode `server` default export with a mock plugin input and invokes its transform hook
- **THEN** the hook executes the full fidelity → compress → echo chain (the single composition), the env-mode read behaves as configured, and the input message array is not mutated

### Requirement: Duck-typed shape fallback coverage

The version-tolerance claims of the fidelity transform SHALL be evidenced by tests, not prose: every duck-typed fallback branch (kebab-case keys, `state: 'error'`, `arguments`/`tool` key forms, non-string tool-call ids, nested/cyclic parameter normalization) SHALL have at least one asserting test.

#### Scenario: Fallback branch matrix

- **WHEN** the test suite runs with shape-variant fixtures for each duck-typed fallback branch
- **THEN** each variant produces the documented behavior (errored-result error-text preservation, call-record extraction for the protection list, normalization) and no variant silently no-ops

### Requirement: Runframe edge semantics pinned

The shared frame parser (echo anchor) SHALL have pinned tests for its edge semantics: mode-word false positives in prose, explicit `manual` mode, multiple frames in one text, and malformed run ids.

#### Scenario: Parser edge fixtures

- **WHEN** the suite feeds the parser prose containing `mode auto` outside any frame, a text with two frames, an explicit `manual` mode, and non-hex run ids
- **THEN** the parse results match the documented semantics for each case: no false FRAME boundary is detected (heading-without-anchor and non-hex run ids never anchor)

### Requirement: Adapter immutability contract

All adapter transforms (echo, elision, fidelity) SHALL be tested with frozen input fixtures to prove the input message array is never mutated — including through the single chain and both platform seams.

#### Scenario: Frozen input passes through

- **WHEN** a frozen (deep-sealed) message array is passed through the chain and each adapter seam
- **THEN** the transform completes without mutation errors and the returned array preserves the original elements

### Requirement: Edge-unit and env-default coverage

The suite SHALL directly test the flag-state machine units, the no-user-input counting branch, the compact boundary, and the env-config defaults and observability edge paths (no-usage `message_end`, safe-wrap catch, malformed context events).

#### Scenario: Edge unit matrix

- **WHEN** the suite runs direct unit tests for each listed edge branch with both positive and negative fixtures
- **THEN** each branch's documented behavior is asserted, including graceful no-op degrade paths

### Requirement: Weak assertion replacement

Assertions that only prove weak proximity (string containment, call counts) SHALL be replaced by precise assertions that identify the affected part or payload.

#### Scenario: Precise assertions

- **WHEN** an errored-result reduction or observability behavior is asserted
- **THEN** the assertion locates the specific message part or entry payload being reduced/persisted, not an unanchored containment or a call-count proxy

### Requirement: Glyph-anchored single-line echo

The per-call discipline echo line SHALL render with a `▣` glyph prefix as the visual anchor, retaining the `[seam]` marker as the machine-grep anchor, and SHALL stay a single line within 140 characters.

#### Scenario: Echo carries glyph and machine anchors

- **WHEN** the adapter renders the discipline echo line for a node call
- **THEN** the line starts with `▣ [seam] ` and contains exactly one line, `▣ [seam] node <id> · …` within 140 characters

#### Scenario: Grep anchor survives the glyph upgrade

- **WHEN** a consumer greps a session transcript for `[seam]`
- **THEN** every rendered echo line matches, with the `▣` glyph preceding the marker

### Requirement: Frame format tolerance (markdown emphasis accepted)

The anchored frame parser SHALL accept markdown backtick-wrapped run-id and node-id segments in the frame line (`Run \`<runId>\` · node \`<nodeId>\``) in addition to the plain form. Documentation text without an anchored run line SHALL still never match a frame (the R5-1 corruption guard stays in force). Plain anchored frames SHALL keep their pinned byte-for-byte rendering.

#### Scenario: Backtick-wrapped run line renders an echo

WHEN a frame line reads `Run \`fb268b76-d2f2-4c32-98fc-999d757e58f2\` · node \`requirement/arch-review\``THEN anchored frame detection matches the frame with runId`fb268b76-d2f2-4c32-98fc-999d757e58f2`and nodeId`requirement/arch-review` AND the discipline echo renders with the resolved node id.

#### Scenario: Backtick-wrapped short hex prefix matches

WHEN a frame line reads `Run \`fb268b76\` · node \`requirement/scope-entry\`` THEN the frame is detected (hex run-id segment is accepted with or without backticks).

#### Scenario: Documentation text never matches

WHEN a text contains a `## Run Frame` heading and prose mentioning `node <word>` / `declared operations` but no anchored `Run <run-id> · node <id>` line (with or without backticks) THEN no frame is detected AND no echo is rendered.

#### Scenario: Plain anchored frame unchanged

WHEN a frame line reads `Run fb268b76-d2f2-4c32-98fc-999d757e58f2 · node requirement/arch-review` THEN detection and echo rendering stay byte-identical to the pinned baseline.

### Requirement: Tool-call extraction shape coverage

Tool-call extraction SHALL cover flat single-call part shapes (id/name/input at the part top level) in addition to `toolCalls` / `tool-calls` arrays. A flat shape SHALL NOT fail extraction silently — the call is recorded for the shared protection list.

#### Scenario: Flat single-call part extracted

- **WHEN** a tool part carries `id`, `name`, and `input` at the top level (no array wrapper)
- **THEN** extraction records the call without crashing (the record feeds protection evaluation; no dedup consumes it)

#### Scenario: Array shapes unchanged

- **WHEN** a tool part carries a `toolCalls` or `tool-calls` array
- **THEN** extraction behaves exactly as before (records each entry)

### Requirement: Context-seam failure diagnostics

The OMP context seam handler SHALL emit a one-line diagnostic to the process log (`console.warn`) when its transform chain throws, carrying the error message, and SHALL continue to degrade silently for the request (zero-deny: behavior unchanged, nothing injected into LLM context). The diagnostic SHALL fire ONLY on the failure path — normal requests emit no log output (zero-noise).

#### Scenario: Handler throw emits a diagnostic

WHEN the OMP context handler's transform chain throws (e.g. an unexpected message shape) THEN the handler logs one `console.warn` line containing the error message AND the handler still returns `undefined` (the request proceeds unchanged).

#### Scenario: Normal requests emit nothing

WHEN a context event processes successfully (with or without an echo frame) THEN no diagnostic is logged (zero-noise contract).

#### Scenario: Diagnostic never enters LLM context

WHEN a handler failure occurs THEN no diagnostic text is appended to any message in the outgoing array (process-log only).

### Requirement: Display layering semantics (model-side signal vs user-side display)

The display feedback SHALL be layered by consumer: the `context` seam echo is the model-side signal (per-call, agent-consumed), and the node-boundary custom message is the user-side display (per-node, operator-consumed). The display-minimalism three laws and display tiering semantics SHALL apply to both layers: at most one seam line per call (law 1), single-source metering rendered once and referenced elsewhere (law 2), every displayed line has a consumer and behavioral consequence (law 3). The prose-tier degrade baseline (no plugin) SHALL remain unchanged: single-line Checks block, no Context hints, minimal final report.

#### Scenario: Both layers render from the same source

- **WHEN** a node boundary settles and a per-call seam line was rendered
- **THEN** both the model-side seam line and the user-visible message derive from the same `renderEchoLine` output (single renderer, two delivery channels)

#### Scenario: Degrade baseline unaffected

- **WHEN** the graph-fidelity plugin is absent
- **THEN** the skill-side prose baseline (single-line Checks, no hints) renders exactly as before, with no user-visible custom messages

### Requirement: Checks/Run Frame execution discipline alignment

The handler SHALL assemble the Checks block exactly per the declared contract: single-line collapsed format in the prose tier (`## Checks: constraints ok · tools n/a · reasoning ok · ctx A <n> · B <n> · C <n> · L3 <n> · out ~<n> tok`) with violation rows expanding only when violated; and SHALL NOT assemble the prose Checks block in the mechanical tier (canonical `[seam]` line present — the mechanical single line is the only feedback). The Run Frame `declared operations` line SHALL list the out-of-scope set as the difference (`<read/write/locate minus declared>`), not a literal placeholder. This is an execution-discipline requirement on the handler agent; the contract text in the handler skill is authoritative and unchanged.

#### Scenario: Prose tier renders a single collapsed Checks line

- **WHEN** no canonical `[seam]` line is present in recent user messages and the node reports all-green rows
- **THEN** the node output closes with exactly one Checks line, collapsed, no per-axis rows

#### Scenario: Mechanical tier skips prose Checks

- **WHEN** a canonical `[seam]` line is present in recent user messages
- **THEN** no prose Checks block is assembled (violation markers still prefix the output when violations exist)

#### Scenario: Run Frame out-of-scope is the declared difference

- **WHEN** a main node declares operations `[locate, read, write]`
- **THEN** the frame's out-of-scope segment enumerates the difference between the declared set and the full read/write/locate surface, never a placeholder literal

### Requirement: Frame-contract pin suite degrades cleanly

The frame-contract pin suite SHALL skip cleanly — never fail the graph-fidelity package test run — when the handler skill source file (`packages/graph-workflow/skills/atom-phase-handler/SKILL.md`) is absent: the suite's skill-document pins are conditional on the skill artifact, and their absence SHALL produce per-test skips, not a collection-time failure.

#### Scenario: skill absent skips

- **WHEN** the graph-fidelity test suite runs without the atom-phase-handler SKILL.md present
- **THEN** the frame-contract pin tests are skipped (not failed) and the rest of the suite runs unchanged

#### Scenario: skill present pins

- **WHEN** the graph-fidelity test suite runs with the atom-phase-handler SKILL.md present
- **THEN** the frame-contract pins execute and assert the frame format, tier marker, Checks baseline, and mechanical-tier wording

### Requirement: Cross-package pin suites degrade cleanly

Cross-package pin suites (frame-contract, spec-format-pin) SHALL be uniformly skipIf-guarded: when the pinned source artifact is absent (a tree move or a fresh partial clone), the pin tests SKIP with a documented reason instead of failing the package suite — matching the frame-contract contract. The resident-hlt-pin suite is deleted with the HLT layer (ADR 0194 D7) and SHALL NOT be re-introduced.

#### Scenario: source absent skips

- **WHEN** the graph-fidelity test suite runs without the pinned source artifact (atom-phase-handler SKILL.md, change delta specs)
- **THEN** the affected pin tests are skipped (not failed) and the rest of the suite runs unchanged

#### Scenario: source present pins

- **WHEN** the pinned source artifact is present
- **THEN** the byte-equality/format pins execute and assert the contract

#### Scenario: resident-hlt pin stays deleted

- **WHEN** the graph-fidelity test tree is inspected
- **THEN** no resident-hlt pin suite exists and no test references HLT-REGISTRY.md as a pinned artifact

### Requirement: Build artifact delivery contract

The package SHALL build its adapter entries with the repo-standard bundler (`tsup`, esm format, tree-shaken, minified, no source maps, no type declarations for the adapter surface) into `dist/`. The build SHALL be a prerequisite of packaging (`prepack` runs the build) and the built artifacts SHALL be part of the published/installed file set (`files` includes `dist/`). Source edits take effect through a rebuild (`tsup --watch` for development); consumer manifests never reference `src/` adapter files. The bundled output directory and the type-emission output directory SHALL be distinct so that a bundler `clean` step cannot silently remove type declarations. A dist content contract test SHALL assert that every `exports` entry's declared target file exists after a build (including `exports["./interfaces"].types`), so a stale or partial build output fails the suite instead of breaking consumers at resolution time.

#### Scenario: Build produces three bundles

- **WHEN** `yarn build` runs in the package
- **THEN** `dist/omp.js` and `dist/opencode.js` exist and each imports with no bare specifier outside `node:` builtins, and no `dist/opencode-tui.js` is produced (the tui-kind bundle is deleted, ADR 0170)

#### Scenario: Minified and self-contained

- **WHEN** a bundle is inspected
- **THEN** it is minified, contains the inlined SDK client code (no `@modelcontextprotocol` import remains), and preserves the platform default-export shape (OMP factory function; opencode `{ server }`)

#### Scenario: prepack builds

- **WHEN** the package is packed for publishing
- **THEN** `prepack` runs the build first and `dist/` is included in the packed file set

#### Scenario: Type declarations survive a full build

- **WHEN** `yarn build` runs and the full build completes successfully
- **THEN** `exports["./interfaces"].types` points at an existing `.d.ts` file and every declared `exports` target exists on disk

#### Scenario: Stale or partial dist fails the content contract test

- **WHEN** the dist content contract test runs against a dist whose declared exports targets are missing (stale/partial build)
- **THEN** the test fails with the missing target path(s) named

### Requirement: Run-frame parsing is single-source

All "latest run frame" lookups (discipline echo anchor, platform adapter fallback) SHALL resolve through one core helper built on the anchored-frame parser; role filtering stays a caller-declared option.

#### Scenario: Echo anchor and elision window agree on the latest frame

- **WHEN** a transcript carries multiple anchored frames
- **THEN** the echo anchor selects the latest frame via the shared helper, with user-like-first role ordering — and no elision window exists to agree with, elision being removed (ADR 0170)

#### Scenario: Adapter fallback reuses the same helper

- **WHEN** no user-like message exists for echo anchoring
- **THEN** the opencode face falls back to the latest anchored frame via the same helper, not a private reimplementation

### Requirement: Headless delta authoring reads main spec requirement names

When generating a delta spec headlessly, MODIFIED requirement names MUST reference requirement names present in the target main spec; ADDED/REMOVED sections describe genuine additions/removals relative to the main spec as-read.

#### Scenario: MODIFIED references an existing requirement name

- **WHEN** a change modifies an existing requirement
- **THEN** the delta uses the main spec's actual requirement name (read before writing), and archive sync applies without name-mismatch failures

#### Scenario: Main specs have one writer

- **WHEN** a detailed-track implementation runs
- **THEN** openspec/specs/** main spec files are not edited by the implementation; openspec archive is the sole sync channel

### Requirement: PCL detection at the input seam

Mechanical PCL vocabulary detection runs on the platform's user-input event, which fires before the prompt flow. Detection marks matching utterances; it never routes and never rewrites the user's text. Routing execution stays owned by the agent.

#### Scenario: PCL utterances are detected before prompt processing

- **WHEN** a user submits a message containing a PCL vocabulary term
- **THEN** the input event marks the utterance as PCL-classified before any prompt processing, the message text passes through unmodified, and no routing action is taken by the module

### Requirement: Package surface contract

The package surface is minimal and accurate: the exports map SHALL expose only the plugin entries (`./omp`, `./server`); the root barrel and the `./interfaces` subpath SHALL NOT be published; exported symbols are consumed by the package or its documented plugin entry points (no test-only exports, no unpublished dead types); README claims match code reality (environment variable defaults, exported plugin names, documented commands); the test configuration includes coverage collection; opencode session-message retention is bounded.

#### Scenario: No test-only exports

- **WHEN** the package's exports map and barrel are inspected
- **THEN** only the plugin entries (`./omp`, `./server`) are published
- **AND** no test-only symbol and no unpublished dead type (e.g. an unused module interface type) is exported

#### Scenario: Documentation matches code

- **WHEN** README statements about configuration defaults, exported names, and commands are checked against source
- **THEN** they match, and no undocumented configuration surface exists

#### Scenario: Coverage is measurable

- **WHEN** the test suite runs with coverage
- **THEN** a coverage report is produced by the project's test configuration

#### Scenario: Session retention is bounded

- **WHEN** the opencode face accumulates session messages
- **THEN** retention is bounded by a documented limit

#### Scenario: Plugin-entry-only imports

- **WHEN** an external consumer imports the package
- **THEN** it imports through the plugin entry points only (`./omp`, `./server`)
- **AND** the root import and the `./interfaces` subpath are not available

#### Scenario: No consumer-side options slot

- **WHEN** the module factory is inspected
- **THEN** no mutable module-level options slot exists; per-server-call options are captured by the SDK adapter at bind time

#### Scenario: Pure bind-shell adapters

- **WHEN** an adapter file is inspected
- **THEN** it is a bind shell: module factory call, bind call, platform-entry shape export — no option-shape guard, no handler definition, no singleton assembly

### Requirement: Adapter hygiene — comments match code, no duplicated predicates, bounded session maps

Adapter-local code SHALL carry no drifted comments: seam claims name the hook that actually executes them. Adapter-local predicates SHALL NOT duplicate each other or the shared core ops. Session-learned maps SHALL NOT grow faster than the documented retention bound, and protection-list names SHALL never be evicted. Per-node metering SHALL attribute to the active node: on the opencode face every `session.idle` settles and resets the current node's ledger (cross-turn accumulation belongs to the current node; the next node starts clean). Queued settlement lines SHALL be consumed in order (a queue, not a single slot). Adapter-local helpers SHALL NOT duplicate each other: retention/eviction logic and boundary-state advancement exist once, in core, and adapters reference that single implementation.

#### Scenario: Comments name the real seam

- **WHEN** any adapter comment claims where a management action executes
- **THEN** the named hook matches the registration in the same file, and no comment claims a seam that carries no such work

#### Scenario: No duplicated predicate logic

- **WHEN** the adapter is scanned for predicate definitions
- **THEN** no two predicates in the same file express the same condition, and conditions available from shared core ops are not re-implemented locally

#### Scenario: Session maps respect the retention bound

- **WHEN** a session-learned map grows during a session
- **THEN** its size is bounded by the same documented limit as the session-message retention

#### Scenario: Protection names survive retention

- **WHEN** a session-learned map holds a call name on the protection list
- **THEN** that entry is never evicted by the retention bound — protected results stay protected on the event path

#### Scenario: Boundary-state advancement exists once

- **WHEN** platform-neutral boundary state (pending echo line, benefit, settlement) advances on either face
- **THEN** the advancement logic lives in core, and adapters only wire platform events to it — no adapter carries its own copy of the state machine

#### Scenario: Retention logic exists once

- **WHEN** session-learned maps reach the retention bound
- **THEN** eviction runs through a single shared helper; no adapter re-implements drop-oldest

#### Scenario: Every idle settles the active node (opencode)

- **WHEN** a `session.idle` event arrives with an anchored frame
- **THEN** the current node's ledger settles and resets — a second approval turn of the same node settles under the same node identity, never contaminating the next node's ledger

#### Scenario: Queued settlement lines drain in order

- **WHEN** multiple idles occur without an intervening transform
- **THEN** each queued settlement line appends on the next transcript in order — no queued line is overwritten

### Requirement: Package surface contract closes test-only exports

The package surface is minimal and accurate: exported symbols are consumed by the package or its documented public entry points. No re-export exists solely for test imports — tests import internal modules by direct path like package consumers do.

#### Scenario: No test-only re-exports

- **WHEN** the package's exported symbols are scanned for consumers within the package source
- **THEN** every exported symbol has at least one consumer in package source or a documented public entry point, and no adapter re-export exists whose only consumers are test files

### Requirement: Reference source discipline

The module SHALL treat `.refs/` as reference source only: it is never imported, read, or wired at runtime, and no test SHALL touch it (ADR 0149). Platform contracts and community solutions are understood from `.refs/` but implemented from the real platform packages and the project's own standards — no reference-tree code is copied (R6, anchor `docs/first-principles/graph-fidelity.md`).

#### Scenario: No runtime reference-tree usage

- **WHEN** the module's src and dist are scanned for `.refs` imports or reads
- **THEN** zero hits are returned

#### Scenario: Tests stay off the reference tree

- **WHEN** the module's test suite runs
- **THEN** no test reads, imports, or asserts against `.refs/` content (probe suite included — its npm-pinned platform package is the verification surface)

### Requirement: Internal path references current

Specification and probe references to module internals SHALL point at current paths (post-ADR 0175 relocation and post-split locations); no reference SHALL silently resolve to an empty path.

#### Scenario: Probe assertions evaluate real content

- **WHEN** the prompt-assembly-probe suite runs its fidelity assertions
- **THEN** they evaluate against the current module paths (relocated/current), not `''` from a missing file

### Requirement: Deny interface contract — extensibility seam

The interface encapsulation layer SHALL expose a deny contract through which platform write tools can be gated for in-project file writes. The contract SHALL declare (a) a writability determination (given a target path and the project environment, can a registered write engine cover the write?) and (b) an interception decision (given a platform write-tool invocation, deny or allow). The **built-in deny implementation is removed**: no core module provides a deny factory, and no adapter wires a built-in implementation. The contract exists as a type-only docking slot (`exports["./interfaces"]`, no runtime value); deny providers SHALL dock through the opencode adapter's `options.deny` embedding seam. The opencode `permission.ask` gate SHALL deny only when a provider is supplied and returns a denial; an absent provider SHALL no-op (fail-open). The OMP adapter face SHALL carry no deny wiring. Denial SHALL never target a registered write engine (serena) — only redundant platform paths.

#### Scenario: Contract exists in the interface layer

- **WHEN** the interface encapsulation layer is inspected
- **THEN** a deny contract is present alongside the existing signal and feedback contracts, declared with typed determination and interception payloads, and the interface layer contains no runtime value

#### Scenario: Built-in deny absent

- **WHEN** the module runs with default configuration (no deny provider supplied)
- **THEN** no built-in deny machinery exists in core or any adapter, no platform write-tool gating logic executes, and no platform write tool is ever denied

#### Scenario: Alternative deny docks without core change

- **WHEN** a deny provider is supplied via the opencode `options.deny` embedding seam
- **THEN** it docks against the contract with no modification to the core module or existing contracts, and the permission gate honors its interception decisions (fail-open on an absent provider)

#### Scenario: Adapters source the implementation from core

- **WHEN** either platform adapter is inspected for its deny implementation values
- **THEN** no adapter imports, defines, or re-exports a deny factory from core (core provides none); the opencode adapter sources a provider exclusively from its `options.deny` seam, and the OMP adapter sources none

#### Scenario: Match vocabulary is per-adapter and platform-evidenced

- **WHEN** the deny match set is inspected for each adapter
- **THEN** no built-in match vocabulary exists in the module (the built-in `OMP_WRITE_TOOLS` / `OPENCODE_WRITE_PERMISSIONS` sets are removed); providers supply their own vocabulary through the contract, and no entry names a registered write engine's bare tool names (`create_text_file`, `replace_content`, or their siblings)

#### Scenario: Match-set tests re-scoped to seam pins

- **WHEN** the deny tests run
- **THEN** no test asserts a built-in match set (the built-in vocabulary pin suites are removed); the re-scoped seam suite pins provider-supplied denial routing only — provider denial yields status `deny`, absent provider passes through

#### Scenario: Built-in deny absent in a default run

- **WHEN** the module runs with default configuration (no deny provider supplied)
- **THEN** no deny machinery loads or executes, and no platform write tool is ever denied

#### Scenario: OMP face has no deny wiring

- **WHEN** the OMP adapter initializes
- **THEN** no `tool_call` deny handler is registered and no deny-related code is imported

### Requirement: Built-in hints vocabulary

The built-in hint texts SHALL be single-sourced in `src/hints.ts` (renamed from `src/texts.ts`; the module directly exports the consumer `HintDisplayFn` that returns the block body for the classified scenario) and SHALL attach per their scenario trigger conditions, classified through the SDK unified scenario interface: platform-native write tools (`write`, `edit`, `ast_edit`) classify as the write scenario and attach the write hint (mutation engine + pre-edit consultation + verify-after + `register_edit` obligation); the native `read` tool classifies as the read scenario unconditionally (no path/extension/selector consultation — the file-type content axis is deleted per ADR 0204) and attaches the read hint; locate-class invocations — platform locate/search tools (`glob`, `grep`) or a shell command whose leading tokens include a locate command (`find`, `ls`, `fd`, `rg`, `ag`, `tree`, including chained forms with `rtk`/`proxy` wrapper stripped) — classify as the find scenario and attach the find hint. The display function SHALL judge compliance for consumer-promoted tools inline: `ctx.usedTool` matched against the module's inline tool-name sets (built from the tool-name arrays in `src/hints.ts` — both serena surface forms `serena_*` / `mcp__serena_*` plus `mcp__jcodemunch_*`) returns `null` (silent); no consumer-supplied classification extension map exists (PROMOTED_TOOL_MAP deleted). The SDK classify native rules (write/read/locate/CLI-locate/internal-URI exemption, `rtk` run prefix) remain the SDK hard floor.

#### Scenario: Platform write triggers serena hint

- **WHEN** a tool-call result for a platform-native write tool (`write`, `edit`, or `ast_edit`) is returned to the LLM and the invocation is non-compliant (native mutation tools are outside the promoted set)
- **THEN** the result carries the write scenario hint (mutation engine + pre-edit consultation + verify-after + `register_edit` obligation with n/a case), naming the used native tool in DO-NOT form

#### Scenario: Content read triggers serena hint

- **WHEN** a tool-call result for the platform content-read tool (`read`) is returned to the LLM and the invocation is non-compliant (native read is not a promoted read surface)
- **THEN** the result carries the read scenario hint unconditionally — no code-file path gate (the read class is unconditional; the file-type content axis is deleted per ADR 0204); the hint names the outline-first read flow (`get_file_outline` before opening, `get_symbol_source` for symbols, `get_context_bundle` for symbol+imports, `get_file_content` as last resort) and the used `read` tool in DO-NOT form

#### Scenario: Platform locate triggers jcodemunch hint

- **WHEN** a tool-call result for a platform locate/search tool (`glob` or `grep`) is returned to the LLM
- **THEN** the result carries the find scenario hint (query plane first — `search_text` / `search_symbols` / `find_references` / `find_importers` + symbolic-tool ground truth), naming the used locate tool in DO-NOT form

#### Scenario: CLI locate triggers jcodemunch hint

- **WHEN** a shell tool-call result whose leading token(s) include a locate command (`find`, `ls`, `fd`, `rg`, `ag`, `tree` — standalone or chained after `&&`/`||`/`;`/`|`, with `rtk`/`proxy` wrapper stripped) is returned to the LLM
- **THEN** the result carries the find scenario hint naming the CLI-locate substitute path (bash locate → query plane alternative)
- **AND** the hint content matches the classifier's CLI-locate trigger (no content–classification mismatch) — the DO-NOT name is the locate command itself (e.g. `find` / `rg` / `ls`), never the shell

#### Scenario: Selector-suffixed code reads fire read-guard

- **WHEN** a native `read` result carries `args.path` with a code extension followed by a selector suffix (`file.ts:50-200`, `file.ts:raw`, `file.ts:2-4:raw`)
- **THEN** the read scenario hint fires as usual — the selector suffix never gates or suppresses attachment (read classifies unconditionally; no extension judgment is consulted)

#### Scenario: Non-classified tools attach nothing

- **WHEN** a tool-call result for a tool with no scenario coverage is returned to the LLM
- **THEN** no hint is attached and the result passes through unchanged

#### Scenario: Vocabulary pinned to platform evidence

- **WHEN** the hints vocabulary tests run
- **THEN** at least one test per class asserts the vocabulary against the platform's real tool surface, and no speculative entry is asserted

#### Scenario: ast_edit joins the write class

- **WHEN** a tool-call result for the platform-native structural write tool `ast_edit` is returned to the LLM
- **THEN** the result carries the write scenario hint (same class as `write`/`edit`), naming `ast_edit` in DO-NOT form

#### Scenario: State-changing tools carry no read coverage

- **WHEN** `activate_project`, `onboarding`, or `open_dashboard` executes
- **THEN** no read-scenario hint attaches (state-changing setup tools are not reads)
- **AND** the tools carry no scenario coverage (fail-open)

#### Scenario: Hint tool names trace to reference sources

- **WHEN** a hint body tool name is audited
- **THEN** it traces to a `.refs` original flow cited in the tool-guidance derivation table (file:line)
- **AND** no invented tool name appears

#### Scenario: Run hint states full bash coverage

- **WHEN** the run scenario hint is emitted for a non-locate bash invocation without the wrapper prefix
- **THEN** the hint states that the invocation classifies as the run scenario (full bash coverage), the SAFE command set is presented as preferred examples (not an exhaustive allow-list), and the raw bash invocation is named in DO-NOT form with the wrapper rule

#### Scenario: Promoted read surface used

- **WHEN** a read-classified tool execution uses a promoted read surface (e.g. `serena_get_symbols_overview`, `mcp__jcodemunch_get_file_outline`) and the result is not error-shaped
- **THEN** the invocation is compliant — no read hint attaches and no feedback emits (the display function recognizes `ctx.usedTool` in its inline read set and returns `null`)

#### Scenario: Prefixed bash

- **WHEN** the caller runs bash with the project wrapper prefix (`rtk` or `rtk proxy`) and the command is not a CLI-locate chain
- **THEN** the invocation is compliant for the run scenario and no run hint attaches

### Requirement: Hint attachment seams

Hints SHALL be attached to tool-call results before the results reach the LLM, on both platform faces, without modifying the original result content (append-only). The OMP face SHALL attach hints through the post-execution `tool_result` hook, whose event carries the tool name, call id, input, and result content; the opencode face SHALL attach hints through the post-execution result hook. Attachment SHALL happen at most once per tool execution on both faces — the platform post-execution events fire once per execution, so no deduplication state is required — AND only when the invocation is non-compliant: a compliant execution (promoted tool used, no error) attaches nothing (see scenario-tool-hints Compliant invocation suppression). The OMP face SHALL NOT attach hints through the context seam: the OMP message model stores tool calls and results as separate top-level messages whose content blocks carry only text/image, so block-level seam matching never fires; attachment happens via the post-execution `tool_result` hook. The OMP face SHALL gate attachment on the canonical `errorShaped` verdict alone — the platform `isError` flag is already folded into the verdict at adapter normalization, so the dual-guard check (`isError === true` AND `errorShaped === true`) SHALL be collapsed to a single `errorShaped` check. The opencode face SHALL keep its existing `errorShaped` check.

#### Scenario: OMP attaches at the context seam

- **WHEN** the OMP face is inspected for context-seam hint attachment
- **THEN** no hint is attached through the context seam — the OMP message model stores calls and results as separate top-level messages with text/image content blocks only, so block-level seam matching never fires; attachment happens via the post-execution `tool_result` hook

#### Scenario: OMP attaches via the tool_result hook

- **WHEN** an OMP tool execution completes successfully, its tool matches a hint class, and the invocation is non-compliant
- **THEN** the hook override appends the hint text block to the result content before it reaches the LLM, and the original result content is unchanged

#### Scenario: opencode attaches at the post-execution hook

- **WHEN** an opencode tool executes, its result matches a hint class, and the invocation is non-compliant
- **THEN** the hint text is returned with the tool result before it reaches the LLM, and the original result output is unchanged

#### Scenario: Per-execution attachment (no re-attachment on replay)

- **WHEN** a historical tool result message reappears in a later request array
- **THEN** no hint is re-attached — attachment happened once at execution time (event-level, once per execution)

#### Scenario: Failed executions attach nothing

- **WHEN** a tool execution fails (error result)
- **THEN** no hint is attached and the error result passes through unchanged

#### Scenario: MCP proxy routes attach nothing

- **WHEN** a write or content-read tool invocation targets an MCP proxy route (`args.path` begins with `xd://`)
- **THEN** no hint is attached, regardless of the routed server — graph-ops, the read/write engine itself, and other MCP services all pass through without guidance

#### Scenario: Internal-URI routes attach nothing

- **WHEN** a write or content-read tool invocation targets a platform-internal URI route (`args.path` or `args.filePath` begins with any of `skill://`, `rule://`, `agent://`, `history://`, `artifact://`, `local://`, `memory://`, `mcp://`, `issue://`, `pr://`, `omp://`, or `xd://`)
- **THEN** no hint is attached, regardless of the routed server or resource — graph-ops, the read/write engine itself, skills, memories, artifacts, and other internal resources all pass through without guidance, on both adapter faces (path-keyed and filePath-keyed invocations alike)

#### Scenario: Network and remote targets keep the hint

- **WHEN** a content-read tool invocation targets a URL (`http://`, `https://`) or a remote path (`ssh://`) whose target may or may not be project content
- **THEN** the serena hint attaches as usual — the hint text's "in-project" qualifier stays the LLM-side domain judgment, per the round-2 ruling (no target-domain classification for open path/URL domains)

#### Scenario: File paths keep the hint

- **WHEN** a write or content-read tool invocation targets an ordinary file path (no URI scheme prefix)
- **THEN** the serena hint attaches as usual, regardless of whether the path is project content

#### Scenario: rtk-prefixed CLI locate still matches

- **WHEN** a bash command is prefixed with the `rtk` wrapper (`rtk ls`, `rtk find`, or `rtk proxy <command>`)
- **THEN** the wrapper tokens are skipped and the effective first token is matched against the CLI locate vocabulary — the jcodemunch hint attaches exactly as for a bare command

#### Scenario: Error-shaped results attach nothing

- **WHEN** a tool execution result text starts with a start-anchored error marker (`Invalid args`, `The answer is too long`) OR a line of the result text matches the platform exit-code shape — a full line of the form `Command exited with code <number>` (the platform bash shape places the exit line after stdout)
- **THEN** no hint is attached and the result passes through unchanged — the platform error flag alone does not cover content-embedded errors, and a bare-phrase match misses the shape distinction between an error line and a mere mention

#### Scenario: Prose mentions of error markers attach as usual

- **WHEN** a successful tool execution result text mentions the exit-code phrase without matching the error shape — the phrase appears mid-line, parenthesized, or without a trailing code number (e.g. documentation quoting the marker `Command exited with code`)
- **THEN** the hint attaches as usual — a mention is not an error, and guidance must not be lost on successful results

#### Scenario: Non-text results fail open

- **WHEN** a tool execution result text is not a string (missing, undefined, or structurally absent) and the error-shape predicate receives it
- **THEN** the predicate does not throw and no error skip is applied — attachment proceeds per the hint class (fail-open, consistent with the never-blocking hints philosophy)

#### Scenario: Attachment failure degrades silently

- **WHEN** hint determination or attachment throws
- **THEN** the result passes through unchanged, no hint is attached, and the platform loop is not broken

#### Scenario: OMP attachment single-verdict guard

- **WHEN** an OMP tool_result is evaluated for hint attachment
- **THEN** attachment is skipped when the canonical `errorShaped` verdict is true
- **AND** no separate platform `isError` check runs at the attachment site

#### Scenario: Compliant execution attaches nothing

- **WHEN** a tool execution uses a promoted tool for its scenario and the result is not error-shaped
- **THEN** no hint is attached and the result passes through unchanged — the compliant path is silent (no append, no feedback)

### Requirement: Interface phase completion for the context module

**Before**: The interface encapsulation layer implements the phases the context module docks through — SignalLifecycle landing/observation and DisplayFeedback notify/display — and the base package adapters own the platform hook registrations.

**After**: Platform hook registration is consumed from the platform-hooks-sdk: the graph-fidelity package binds its transform handlers through the SDK adapters (`bind(adapter, handlers)`) and wires the resulting platform-shaped registrations into its own platform entry points. The platform seam ownership moves to the SDK — graph-fidelity holds business logic (echo chain, transform composition) and SDK consumption, and no longer owns a platform-binding layer. The context module docks through the same SDK contract.

#### Scenario: Landing phase wired

- **WHEN** the SDK-wired OMP registration is active
- **THEN** the tool_result hook fires registered transforms before persistence (pre-persistence rewrite semantics preserved)

#### Scenario: Observation phase wired

- **WHEN** a message_end arrives with usage
- **THEN** the observation phase delivers cacheRead/cacheWrite to registered observers

#### Scenario: Notify/display delivered

- **WHEN** the context module renders a settlement line
- **THEN** the notify/display delivery carries it via the platform notification capability

### Requirement: SDK consumption for platform hook registration

graph-fidelity SHALL declare the platform-hooks-sdk as a dependency and SHALL perform all platform hook registration through its bind registry. The former platform-binding surface (hook registration, settlement queue, platform display delivery) SHALL be removed; dead exports (e.g. `createOpencodeContextHooks`) SHALL NOT survive the migration. Echo-chain and core transform logic SHALL remain in graph-fidelity unchanged in behavior.

#### Scenario: No residual binding layer

- **WHEN** the graph-fidelity source tree is inspected after migration
- **THEN** no file implements platform hook registration directly
- **AND** the dead `createOpencodeContextHooks` export is absent

#### Scenario: Behavior parity

- **WHEN** graph-fidelity's registered hooks fire on either platform
- **THEN** the echo/transform behavior matches the pre-migration behavior for identical inputs

### Requirement: Discipline module — ported hook capabilities

graph-fidelity SHALL ship a discipline delivery module (`src/discipline/`) that ports the serena + jcodemunch Claude Code hook capabilities onto the platform-hooks-sdk interface (OMP + opencode faces): a pure classification core (`classify.ts` — tool event → DisciplineKind: serena-remind / jcm-read-guard / jcm-edit-guard / write-reindex), hook-source hint texts (`texts.ts` — serena remind prompt face, jcm read-guard advisory for code-file reads and indexed-repo grep, jcm edit_guard consultation naming get_symbol_source / get_file_outline / get_blast_radius / find_references / search_text, post-edit register_edit reminder), a session boundary (`session.ts` — activate guidance + the resident discipline set), and a single facade (`buildDiscipline(activateGuidance) → Discipline { onToolResult, onSessionStart }`). Hint classes: native write tools (write/edit/ast_edit) → serena-remind + jcm-edit-guard; code-file native reads and locate classes → jcm-read-guard; serena write tools → write-reindex only. The facade exposes NO session-end seam.

#### Scenario: Every-match hints

- **WHEN** a tool call matches a discipline kind (native write/edit/ast_edit, code-file read, serena write)
- **THEN** the matching hint text is emitted on that tool result — every time, with no counter, threshold, or dedup state (ADR 0178)

#### Scenario: Zero deny

- **WHEN** any discipline classification matches
- **THEN** the output is a hint (guidance text) only — never a block, deny, or tool-call rejection (ADR 0146/0180)

#### Scenario: Edit consultation

- **WHEN** a native write tool is invoked (`write`, `edit`, or `ast_edit`)
- **THEN** the edit-guard consultation hint fires alongside serena-remind, naming the jcodemunch read tools to consult — worded forward-looking ("before the next edit…") so the post-execution attachment closes the consultation chain on the subsequent write
- **AND** when a serena write tool is invoked, the edit-guard hint does NOT fire (write-reindex only)

#### Scenario: Read-guard code-file type judgment

- **WHEN** a native `read` tool result carries an `args.path` whose file extension is in the code-suffix set (ported from the jcm hooks code-file extensions — selector suffixes stripped first)
- **THEN** the read-guard hint fires (code-file reads, every match, no size threshold)
- **AND** when the path is a non-code file (documentation, data, other) the read-guard hint SHALL NOT fire

#### Scenario: Session lifecycle

- **WHEN** a session starts on either platform face
- **THEN** the resident block carries PCL vocabulary, the activate guidance (two-step source-faithful instruction: activate via Serena's `activate_project` tool unless already done; read the Serena Instructions Manual if not yet; follow before doing anything else), and the discipline line composed from `discipline/texts.ts`
- **AND** the discipline facade exposes no session-end seam: no `session_shutdown`/dispose handler is registered on either face, and the observability pin SHALL assert the absence

#### Scenario: Face-seam delivery of dual-form serena write hints

- **WHEN** a tool named `serena_<write-tool>` or `mcp__serena_<write-tool>` (write tools: replace_content / replace_in_files / replace_symbol_body / rename_symbol / insert_before_symbol / insert_after_symbol / create_text_file / safe_delete_symbol) completes on either platform face
- **THEN** the delivery pin tests on BOTH adapter faces (opencode tool.execute.after, OMP tool_result) assert the write-reindex hint text is emitted and the edit-guard consultation hint text is NOT — dual-form prefix matching (`serena_` bare and `mcp__serena_`) pinned on both faces

#### Scenario: Face-seam delivery of write-reindex hint

- **WHEN** a serena write tool result arrives on either platform face
- **THEN** the delivery pin tests on BOTH adapter faces assert the write-reindex hint text (naming the mounted `mcp__jcodemunch_register_edit` obligation) is emitted end-to-end

### Requirement: Resident block discipline set

The graph-fidelity resident block SHALL contain three surfaces: the PCL vocabulary (atom-pilot source of truth), the full five-scenario enumeration entry (decision-time — each scenario's operation flow and concrete tool names stated once, find/read/write/verify/run, single-sourced with the hint blocks), and the independent jcodemunch entry (compressed full-coverage enumeration of the jcodemunch prompt-policy tool set, single-sourced with the scenario hint blocks). The five-scenario enumeration SHALL be DERIVED from the hint blocks in `src/hints.ts` (renamed from `src/texts.ts`) and the consumer tool-name arrays (single source — a derivation over the block source and tool-name data, no parallel hand-written wording), rendering each scenario's representative promoted tool names; the derivation SHALL NOT consume a classification extension map (PROMOTED_TOOL_MAP deleted — representative names come from the tool-name arrays grouped by scenario, `register_edit` appended beyond the cap). The derivation output SHALL stay within the resident budget by listing representative names per scenario rather than full block bodies. The activate guidance entry and the code-exploration entry SHALL NOT exist (removed per ADR 0208). No discipline line SHALL be resident-carried. No session-boundary module SHALL exist. The resident block SHALL carry no scenario selector line and no cold-read pointer.

#### Scenario: Resident contains the discipline line

- **WHEN** the resident block is rendered on either platform face
- **THEN** it contains the PCL vocabulary, the five-scenario enumeration entry, and the jcodemunch entry — NO discipline line (byte-pin asserted: no `[resident] Discipline:` entry on both faces), NO activate guidance entry, NO code-exploration entry, no session-boundary-derived entry
- **AND** no `onSessionStart` or `session.ts` import exists in the consumer tree

#### Scenario: Resident content is single-sourced

- **WHEN** the resident block entries are compared with their sources
- **THEN** the five-scenario enumeration is DERIVED from the five-scenario content and the tool-name arrays in `src/hints.ts` (no third copy of the wording exists) and the PCL vocabulary from the atom-pilot source, and the jcodemunch entry is composed from the same reference-source extraction table as the scenario hint blocks (`src/resident-data.ts` — flattened from `src/core/` — is the single consumer-side composition home)

#### Scenario: Resident seam is SDK-owned

- **WHEN** the consumer binds its handlers through the SDK with resident content supplied
- **THEN** the SDK wires the resident seam on both faces and the consumer carries no per-face resident handler
- **AND** no consumer-side error-shape detection module exists (the error verdict comes from the SDK canonical tool-result payload)

#### Scenario: No HLT instruction text

- **WHEN** the resident block is rendered on either platform face
- **THEN** no HLT-registry instruction text is present (byte-level absence asserted)

#### Scenario: Activate exclusion during active graph run

- **WHEN** an active graph run is executing
- **THEN** no resident text demands activation before the pilot's first action — the activate guidance entry is removed entirely (activation guidance stays platform-native), so nothing in the resident block conflicts with the pilot first-action rule

#### Scenario: Resident posture names representative tools

- **WHEN** the resident five-scenario enumeration entry is inspected
- **THEN** each scenario line names its concrete promoted tools (find — `search_text` / `search_symbols` / `find_references` / `find_importers`; read — `get_file_outline` / `get_symbol_source` / `get_context_bundle` / `get_file_content`; write — serena write family + `register_edit`; verify — `get_diagnostics_for_file` / `find_dead_code` / `get_untested_symbols` / `check_references`; run — platform shell with the `rtk` wrapper prefix)
- **AND** the register_edit obligation uses the single "while the index is in use" condition with the explicit n/a case

#### Scenario: Enumeration and hints wording single-sourced

- **WHEN** the resident enumeration and the corresponding hint block both describe a scenario
- **THEN** the tool names and operation-flow wording match (the enumeration is derived from the block source and the tool-name arrays — no second hand-written copy)
- **AND** a resident-content pin asserts the derivation matches the block source per scenario

#### Scenario: Resident injection is decision-time only

- **WHEN** a session begins with the discipline module active
- **THEN** the resident block is injected before any tool selection with the PCL + five-scenario enumeration + jcodemunch entry
- **AND** injection never touches tool invocation payloads

#### Scenario: Jcodemunch entry covers the full source policy

- **WHEN** the jcodemunch resident entry is compared against the "Other AI Agents" block in `.refs/jcodemunch-mcp/AGENT_HOOKS.md`
- **THEN** every tool name in the source block appears in the entry (compressed form — one line per use-case group, "use-case → tool names"), and no tool name is invented outside the source
- **AND** the session-start sequence order (`resolve_repo` → `index_folder` → `suggest_queries`) is preserved

### Requirement: Consumer test ownership boundary

graph-fidelity tests SHALL exercise the consumer-facing surface of the package (adapter wiring, platform-entry shapes, consumer content data, dual-face byte identity, spec↔renderer pins) and SHALL NOT re-test behavior owned by the platform-hooks-sdk test suite (resident block rendering/application, fidelity chain application, identity echo rendering, middleware chain semantics). Each observable contract SHALL have exactly one owning test suite; where a consumer test currently duplicates SDK-owned coverage, the duplication SHALL be removed and only the consumer-specific assertion retained.

#### Scenario: Duplicated SDK-owned coverage removed

- **WHEN** a graph-fidelity test asserts SDK-owned behavior (renderResidentBlock / applyResidentBlock / applyResidentToSystem / applyFidelityChain / renderIdentityEcho semantics)
- **THEN** the assertion is removed unless it adds a consumer-specific contract pin (dual-face byte identity or spec↔renderer consistency)

#### Scenario: Contract pins survive

- **WHEN** the slim-down removes duplicated coverage
- **THEN** the dual-face byte-identity assertions (echo rendering identical across OMP/opencode faces) and the spec↔renderer pin (spec-format assertions) remain present

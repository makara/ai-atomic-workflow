# graph-fidelity Specification

## Purpose

The merged platform-seam module: executes the graph system's signal discipline on platform seams — per-call discipline echo, working-face context reduction (fidelity dedup/error, compression, consumed-elision), and observability accumulation — as one plugin whose transform chain is composed exactly once, publishable as an npm package. OMP distribution is the installed-plugin channel (`omp.extensions` manifest via `omp plugin`/npm), opencode resolves `exports["./server"]`, and the marketplace catalog entry is generated and mirror-pinned (ADR 0153).

## Requirements

### Requirement: Settlement feedback surfaces stay consistent across consumer docs

Consumer documentation (ADR index rows, ADR bodies, CHANGELOG, delivery skills, README) SHALL state that R2 cost economy (context management, settlement feedback) is SUSPENDED pending redesign (ADR 0175), and SHALL NOT narrate notify/showToast settlement or class-driven compression as the implemented seam. Historical records (CHANGELOG entries predating the change, ADR historical decision bodies) SHALL be preserved as history, with revision notes where they could be misread as current state.

#### Scenario: Index row states notify channel

- **WHEN** a reader checks the ADR index 0171 row
- **THEN** it states the R2 suspension revision note (0175) rather than the `ctx.ui.notify` channel as active

#### Scenario: Historical CHANGELOG entries preserved

- **WHEN** a reader opens CHANGELOG `[Unreleased]`
- **THEN** pre-suspension entries remain as historical facts, and a new entry states the suspension (ADR 0175, identity-only echo)

#### Scenario: Index rows state suspension

- **WHEN** a reader checks the ADR index rows for 0171/0173/0174
- **THEN** they note the R2 suspension (ADR 0175) rather than presenting notify/showToast settlement or compression as active

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

The context transform pipeline composes the discipline echo only. The working-face reduction stages (errored-result fidelity reduction, headroom compression) are REMOVED from the runtime chain — R2 cost economy is suspended (ADR 0175). Both platform faces execute the same echo-only composition, differing only in message shape adaptation and hook registration. Face adapters contain no duplicated domain logic: text joining, working-text selection, result-id scanning, seam-line stripping, mode lookup, and frame lookup are implemented once in the shared shape seam.

#### Scenario: Both faces run the identical chain

- **WHEN** either platform delivers a message transcript to the plugin
- **THEN** the messages pass through the same single composition in the same order (echo stage only, no reduction stages), and chain order is asserted by exactly one test

#### Scenario: Change detection is single-source

- **WHEN** a transform pass changes no message
- **THEN** the chain reports no change once (one shared detection path), and adapters forward the transcript unchanged

#### Scenario: Adapter boilerplate is single-source

- **WHEN** the two face adapters are compared for the listed shape operations
- **THEN** each operation is implemented in exactly one shared location, and the adapters contain only message-shape adaptation and hook-registration tables

#### Scenario: Cross-face echo byte-identity holds

- **WHEN** both faces render the discipline echo for the same frame facts
- **THEN** the generated lines are byte-identical

### Requirement: Discipline echo contract (anchored frame detection + canonical dedup)

MODIFIED: The per-call discipline echo derives ONE `[seam]` line per LLM call from the most recent run frame and appends it to the most recent user-like message. "User-like" SHALL mean role `user`, `developer`, or `custom` (single-source `isUserLike(role)` predicate); OMP 17.2.15 delivers user input via `custom_message` converted to role `developer`, so user-role-only anchoring silently no-ops on sessions whose input arrives through custom messages (skill invocation, ask results, auto runs). The line SHALL be an identity pointer plus progress — `▣ [seam] node <id> · N/M` — carrying node id (pointer, never copying the frame's `declared operations`/`out of scope` clause) and the node progress segment (`N/M` from the frame when present). The value-ratio graphic segment (`│████░░│ cur/ref`) is REMOVED: the R2 cost-economy surface is suspended (ADR 0175), so no benefit data feeds the line. Metering deltas remain out of the line surface.

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
- **THEN** the shared parser identifies the frame set from the anchored frames; the elision planner no longer exists (removed with the R2 suspension, ADR 0175) — the echo renderer is the sole frame consumer

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

The OMP face SHALL be typed against the platform's real extension contract — a default-export factory `(pi: ExtensionAPI) => void | Promise<void>` importing `ExtensionAPI` from `@oh-my-pi/pi-coding-agent` — and the opencode face SHALL be typed against the platform's real plugin contract — a default-export `{ server: Plugin }` importing `Plugin` from `@opencode-ai/plugin`. No invented platform interfaces (duck-typed stand-ins) SHALL be used as the adapter contract; test type-level assertions SHALL pin both factory shapes.

#### Scenario: OMP factory typed

- **WHEN** the OMP adapter module is type-checked
- **THEN** its default export satisfies `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`, with event handlers registered via `pi.on` against the typed event overloads

#### Scenario: opencode factory typed

- **WHEN** the opencode adapter module is type-checked
- **THEN** its default export satisfies `{ server: Plugin }` where `Plugin = (input: PluginInput) => Promise<Hooks>`, and a test asserts the assignment compiles

#### Scenario: no duck-typed seam

- **WHEN** the adapters directory is scanned for platform-type imports
- **THEN** both adapter files import the real platform type packages, and no adapter-local `OmpHookApi`-style interface exists

### Requirement: Distribution channels declared

The package SHALL declare the distribution channels each platform's loader actually consumes: an `omp.extensions` manifest field listing the OMP adapter entry (relative to the package root) for installed-plugin discovery, and an `exports["./server"]` entry for the opencode npm-package entry convention. The OMP installed-plugin channel SHALL be the single OMP distribution path — repo-dev installs use the `omp plugin` command (package path or npm name) and the marketplace catalog SHALL declare the graph-fidelity plugin entry with a non-empty package-domain description. The extension entries SHALL be built, self-contained artifacts under `dist/` (adapter entry points compiled with all dependencies inlined, `node:` builtins external, platform type-only imports type-erased) — consumer manifests reference `dist/` bundles, never `src/` adapters (ADR 0166). No tui-kind bundle exists (opencode-tui.ts deleted, ADR 0170); opencode.json references the opencode server bundle only.

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
- **THEN** its description names the shipped capabilities: per-call discipline echo, errored-result fidelity reduction, class-driven headroom compression, PCL input-seam marking, and node-boundary settlement with measured metering

#### Scenario: Package description reflects shipped capabilities

- **WHEN** the package.json description is read
- **THEN** it names the same shipped capability set (echo, errored-result reduction, class-driven compression, PCL marking, settlement/metering) consistently with the marketplace entry wording

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

### Requirement: HLT core requirement resident entry

The `[resident]` block SHALL carry a distilled HLT core requirement entry (`HLT_CORE_REQUIREMENT`): the six-line essence — registered-call shape `{intent, tool, args, bound}`, in-project code → serena (locate may route through jcodemunch), verify-after-write, code cells fail loudly (never silent degrade), registered tool capability never restricted (the deny capability targets redundant platform paths only — a registered write engine is never denied), and a cold-read pointer to HLT-REGISTRY.md. The entry SHALL be unconditional: style rows (caveman/rtk/ponytail) are absent outright (the mode knob was removed with the R2/R1 decoupling, ADR 0175) while the HLT core requirement always stays (PCL treatment — correctness over style). The block render/dedup follows the canonical rules. The clarification wording SHALL be sweep-verified: no residual old-phrase text ("Tool capability is never restricted (zero deny)" or "zero denial, the agent's tool capability is never restricted") SHALL remain anywhere in the module's skill/registry sources (`packages/graph-workflow/`), and a sweep test SHALL assert zero matches.

#### Scenario: Resident block contains HLT core requirement

- **WHEN** the resident block renders for either platform face
- **THEN** it contains a `[resident] hlt:`-prefixed entry whose text is byte-equal to the pinned `HLT_CORE_REQUIREMENT` constant (wording: registered capability never restricted; redundant platform paths may be denied), and a byte-pin test asserts both faces render it identically

#### Scenario: Off mode keeps HLT core requirement

- **WHEN** resident entries are selected (the `GRAPH_FIDELITY_MODE` knob was removed with the R2/R1 decoupling — ADR 0175; style rows are absent outright, so the HLT entry is the unconditional correctness set)
- **THEN** style entries (caveman/rtk/ponytail) are never present while the HLT core requirement entry always is — a mode-matrix test is inapplicable (no knob exists; the stronger form holds: style rows absent entirely, HLT entry unconditional)

#### Scenario: Dedup applies to the new entry

- **WHEN** the block already contains a byte-equal HLT core requirement line
- **THEN** no duplicate line is appended (canonical dedup), and the existing line is refreshed in place

#### Scenario: Registered engine never denied

- **WHEN** the deny capability is engaged and a registered write engine (serena) invocation occurs
- **THEN** the invocation is never denied — denial applies only to redundant platform write paths under the serena-writable condition

#### Scenario: Zero deny preserved

- **WHEN** the resident block assembles or the adapter hook runs
- **THEN** no registered tool is restricted, blocked, or redirected — denial applies only to redundant platform write paths while a registered write engine covers the target (serena-writable condition), and injection failure degrades to no-injection (undefined), never denial of a registered engine

#### Scenario: Wording sweep finds no old phrase

- **WHEN** the wording sweep test runs across the module's skill/registry sources in `packages/graph-workflow/`
- **THEN** zero matches for the old zero-deny phrasing remain, and the pinned `HLT_CORE_REQUIREMENT` wording (registered capability never restricted) is the only phrasing present

### Requirement: Cross-package pin suites degrade cleanly

Cross-package pin suites (resident-hlt-pin, frame-contract, spec-format-pin) SHALL be uniformly skipIf-guarded: when the pinned source artifact is absent (a tree move or a fresh partial clone), the pin tests SKIP with a documented reason instead of failing the package suite — matching the frame-contract contract.

#### Scenario: source absent skips

- **WHEN** the graph-fidelity test suite runs without the pinned source artifact (atom-kernel SKILL.md / HLT-REGISTRY.md, atom-phase-handler SKILL.md, change delta specs)
- **THEN** the affected pin tests are skipped (not failed) and the rest of the suite runs unchanged

#### Scenario: source present pins

- **WHEN** the pinned source artifact is present
- **THEN** the byte-equality/format pins execute and assert the contract

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

The package surface is minimal and accurate: exported symbols are consumed by the package or its documented public entry points (no test-only exports); README claims match code reality (environment variable defaults, exported plugin names, documented commands); the test configuration includes coverage collection; opencode session-message retention is bounded.

#### Scenario: No test-only exports

- **WHEN** the package's exported symbols are scanned for consumers within the package source
- **THEN** every exported symbol has at least one consumer in package source or a documented public entry point

#### Scenario: Documentation matches code

- **WHEN** README statements about configuration defaults, exported names, and commands are checked against source
- **THEN** they match, and no undocumented configuration surface exists

#### Scenario: Coverage is measurable

- **WHEN** the test suite runs with coverage
- **THEN** a coverage report is produced by the project's test configuration

#### Scenario: Session retention is bounded

- **WHEN** the opencode face accumulates session messages
- **THEN** retention is bounded by a documented limit

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

### Requirement: Hints contract — extensibility seam

The interface encapsulation layer SHALL expose a hints contract through which additional user-level information is attached to tool-call results before the results reach the LLM. The contract SHALL declare a hint decision (given a tool invocation, what hint text — if any — to attach) and the attached text SHALL be user-level information consumed by the LLM, equal in status to user-provided guidance. The interface layer SHALL remain type-only: contract types are declared in the interface surface, and the built-in hint implementation lives in core. Built-in hints SHALL be identified by a distinct name that does not collide with the agent-type advisory vocabulary (`## Agent hints:`); the distinction SHALL be documented in the contract comments.

#### Scenario: Contract exists in the interface layer

- **WHEN** the interface encapsulation layer is inspected
- **THEN** a hints contract is present alongside the signal, feedback, and deny contracts, declared with typed hint-decision payloads, and the interface layer contains no runtime value (implementation factories live in core)

#### Scenario: Hint text equals user-level info

- **WHEN** a hint is attached to a tool-call result
- **THEN** the attached text is delivered to the LLM as guidance of the same status as user information, and the LLM is the sole consumer

#### Scenario: Name collision avoided

- **WHEN** the hints contract and its hint texts are scanned
- **THEN** they are not labeled as agent-type hints, and the documentation distinguishes tool-result hints from `## Agent hints:` agent-type advisory

### Requirement: Built-in hints vocabulary

The built-in hints SHALL be driven by a data-driven, platform-evidenced vocabulary of three classes: write tools, content-read tools, and locate tools. A platform-native write tool (`write`, `edit`) or content-read tool (`read`) invocation SHALL attach a hint to use the registered engine (serena) next time. A locate-class invocation — platform locate/search tools (`glob`, `grep`) or a shell command whose first token is a locate command (`find`, `ls`, `fd`, `rg`, `ag`, `tree`) — SHALL attach a hint to use jcodemunch next time. Vocabulary entries SHALL be platform-evidenced and pin-tested; no speculative tool names SHALL be added. Hint frequency SHALL NOT be constrained by the interface contract; the implementation decides attachment policy.

#### Scenario: Platform write triggers serena hint

- **WHEN** a tool-call result for a platform-native write tool (`write` or `edit`) is returned to the LLM
- **THEN** the result carries a hint to use serena for the next in-project write

#### Scenario: Content read triggers serena hint

- **WHEN** a tool-call result for a platform content-read tool (`read`) is returned to the LLM
- **THEN** the result carries a hint to use serena for the next in-project read

#### Scenario: Platform locate triggers jcodemunch hint

- **WHEN** a tool-call result for a platform locate/search tool (`glob` or `grep`) is returned to the LLM
- **THEN** the result carries a hint to use jcodemunch for the next file locate

#### Scenario: CLI locate triggers jcodemunch hint

- **WHEN** a shell tool-call result whose command first token is a locate command (`find`, `ls`, `fd`, `rg`, `ag`, `tree`) is returned to the LLM
- **THEN** the result carries a hint to use jcodemunch for the next file locate

#### Scenario: Non-classified tools attach nothing

- **WHEN** a tool-call result for a tool outside the three classes is returned to the LLM
- **THEN** no hint is attached and the result passes through unchanged

#### Scenario: Vocabulary pinned to platform evidence

- **WHEN** the hints vocabulary tests run
- **THEN** at least one test per class asserts the vocabulary against the platform's real tool surface, and no speculative entry is asserted

### Requirement: Hint attachment seams

Hints SHALL be attached to tool-call results before the results reach the LLM, on both platform faces, without modifying the original result content (append-only). The OMP face SHALL attach hints through the post-execution `tool_result` hook, whose event carries the tool name, call id, input, and result content; the opencode face SHALL attach hints through the post-execution result hook. Attachment SHALL happen at most once per tool execution on both faces — the platform post-execution events fire once per execution, so no deduplication state is required. The OMP face SHALL NOT attach hints through the context seam: the OMP message model stores tool calls and results as separate top-level messages whose content blocks carry only text/image, so block-level seam matching never fires; attachment happens via the post-execution `tool_result` hook. Content-embedded error results SHALL attach no hint — start-anchored serena markers (`Invalid args`, `The answer is too long`) begin the text, and the platform exit line is line-anchored (a full line of the form `Command exited with code <number>`, following stdout in the platform's bash output shape); prose mentions of the exit phrase SHALL NOT suppress attachment. Non-string result text SHALL NOT throw in the error-shape predicate — it fails open (no skip). Hints are user-level information (equivalent to user text, consumer = the LLM); they never block, gate, or modify tool behavior, and a determination or attachment failure degrades silently.

#### Scenario: OMP attaches at the context seam

- **WHEN** the OMP face is inspected for context-seam hint attachment
- **THEN** no hint is attached through the context seam — the OMP message model stores calls and results as separate top-level messages with text/image content blocks only, so block-level seam matching never fires; attachment happens via the post-execution `tool_result` hook

#### Scenario: OMP attaches via the tool_result hook

- **WHEN** an OMP tool execution completes successfully and its tool matches a hint class
- **THEN** the hook override appends the hint text block to the result content before it reaches the LLM, and the original result content is unchanged

#### Scenario: opencode attaches at the post-execution hook

- **WHEN** an opencode tool executes and its result matches a hint class
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

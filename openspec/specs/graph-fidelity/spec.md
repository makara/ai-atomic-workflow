# graph-fidelity Specification

## Purpose

The merged platform-seam module: executes the graph system's signal discipline on platform seams — per-call discipline echo, context fidelity reduction, and observability accumulation — as one plugin with an explicit transform chain, publishable as an npm package. OMP distribution is the installed-plugin channel (`omp.extensions` manifest via `omp plugin`/npm), opencode resolves `exports["./server"]`, and the marketplace catalog entry is generated and mirror-pinned (ADR 0153).

## Requirements

### Requirement: Single merged plugin module

The platform-seam surface is delivered as ONE npm-publishable package (named by function, e.g. `graph-fidelity`) that absorbs the former signal-seams and context-fidelity packages. The package exposes an OMP hook entry and an opencode plugin entry from shared pure functions.

#### Scenario: Single package name

- **WHEN** a consumer installs the platform-seam module
- **THEN** exactly one package name is referenced for both the OMP hook and the opencode plugin, and no former package name (`signal-seams`, `context-fidelity`) is required

#### Scenario: Shared implementation core

- **WHEN** the OMP face and the opencode face run the discipline echo
- **THEN** both faces derive the echo line from the same pure function, and the generated lines are byte-identical

### Requirement: Single opencode plugin with explicit transform chain

The opencode face registers exactly ONE plugin whose messages.transform applies context-fidelity operations first (identical-call dedup, errored-result reduction) and the discipline echo second. The chain order is explicit and tested.

#### Scenario: One registration

- **WHEN** opencode loads the platform-seam module
- **THEN** exactly one plugin entry exists in the opencode plugin configuration, and it performs both fidelity reduction and discipline echo in one transform pass

#### Scenario: Echo after fidelity

- **WHEN** a request's message array passes through the transform
- **THEN** fidelity reduction is applied before the `[seam]` echo line is appended, and a test asserts this order

### Requirement: Discipline echo contract (unchanged semantics, unified spelling)

The per-call discipline echo derives one `[seam]` line from the most recent `## Run Frame` block in the outgoing message array and appends it to the most recent user message. The function is named `renderDisciplineLine`; the rendered line uses the inline format `[seam] node <id> declares <operations> · out of scope: <list> — per run frame`. The format string in this capability's spec matches the pinned frame-contract test byte-for-byte, and a test asserts the spec string equals the pinned format.

#### Scenario: Inline format pinned

- **WHEN** the spec's discipline-line format string is compared with the frame-contract pin
- **THEN** they are identical, and a test asserts the equality

#### Scenario: No frame degrades silently

- **WHEN** the outgoing messages contain no run frame
- **THEN** no echo line is appended and the request proceeds unchanged

### Requirement: Context fidelity operations (opencode face)

Identical tool-call dedup (keep latest, supersede older results with a recoverable marker) and errored-result fidelity reduction apply on the opencode face within the single transform chain.

#### Scenario: Duplicate call dedup

- **WHEN** two identical tool calls appear in the message array
- **THEN** the older result is replaced by a recoverable superseded marker and the latest result is kept

### Requirement: Observability accumulation with tool execution events

The OMP face accumulates observability facts from platform events — `message_end` (usage), `auto_compaction_end`, `ttsr_triggered` (platform TTSR trigger observation — the project rule file is deleted, so triggers reflect platform-native built-in rules only), and `tool_execution_*` — and persists them via `appendEntry` as a non-LLM session entry. Tool activity facts are included in the accumulated receipt. Observability persistence SHALL be OMP-only — the only face with a native session-entry API; the opencode absence is a declared platform difference, with audit facts on the opencode face carried by the agent-side Checks block.

#### Scenario: Tool execution counted

- **WHEN** a tool execution event fires
- **THEN** the accumulator records the tool activity and persists the updated facts via `appendEntry`

#### Scenario: Usage and compaction counted

- **WHEN** message_end and auto_compaction_end events fire
- **THEN** requests/inputTokens/cacheRead/cacheWrite and compaction counts accumulate and persist

#### Scenario: Boundary documented

- **WHEN** the capability docs describe observability
- **THEN** they state OMP-only persistence (appendEntry) and the opencode absence as a declared platform difference, not an omission to be silently tolerated

#### Scenario: Platform TTSR triggers counted

- **WHEN** the OMP adapter observes `ttsr_triggered`
- **THEN** the accumulator SHALL increment ttsrTriggers and persist the fact — the count reflects platform-native rule triggers, never a project rule (deleted)

### Requirement: Optional seams declared not shipped

Optional seam capabilities (input-seam PCL marking, L3 consumed degrade, session.compacting preserve, todo_reminder alignment) are documented as "Declared, not shipped" roadmap items, with no functional claims. Subagent coverage is NOT an optional seam: the echo and observation events fire in subagent sessions on both platforms (platform-verified dispatch), skipping only frame-less requests.

#### Scenario: Roadmap wording

- **WHEN** the module README lists optional seams
- **THEN** they are labeled as not-shipped roadmap items and no code entry point is claimed for them

#### Scenario: Subagent coverage not optional

- **WHEN** the module docs describe subagent behavior
- **THEN** they declare the echo and observation events fire in subagent sessions on both platforms (OMP preloaded extension paths; opencode shared prompt pipeline), with frame-less requests skipped — and no off-by-default seam is offered for subagents

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

The package SHALL declare the distribution channels each platform's loader actually consumes: an `omp.extensions` manifest field listing the OMP adapter entry (relative to the package root) for installed-plugin discovery, and an `exports["./server"]` entry for the opencode npm-package entry convention. The OMP installed-plugin channel SHALL be the single OMP distribution path — repo-dev installs use the `omp plugin` command (package path or npm name) and the marketplace catalog SHALL declare the graph-fidelity plugin entry with a non-empty package-domain description. No generated deploy copy exists: the native-scan shim (`.omp/extensions/graph-fidelity.ts`) is retired and no generator emits it.

#### Scenario: manifest declared

- **WHEN** the package.json is inspected
- **THEN** it declares `omp.extensions` containing the OMP adapter entry and `exports["./server"]` pointing at the opencode adapter

#### Scenario: server entry declared

- **WHEN** the package exports are inspected
- **THEN** `exports["./server"]` resolves to the opencode adapter module, and a mirror test fails when the entry is missing

#### Scenario: deploy copy comment accurate

- **WHEN** the repo tree is inspected
- **THEN** no generated deploy copy exists to carry a header comment — the installed-plugin channel replaces the native-scan shim, and no script emits one

#### Scenario: plugin installed via omp plugin

- **WHEN** the package is installed with the `omp plugin` command
- **THEN** `omp plugin list` reports the plugin and the OMP face loads from the package entry

#### Scenario: marketplace entry declared

- **WHEN** the marketplace catalog is inspected
- **THEN** it contains a graph-fidelity plugin entry whose description is the package-domain wording (non-empty), generated by the manifest generator

#### Scenario: no generated deploy copy

- **WHEN** the repo tree is inspected
- **THEN** `.omp/extensions/graph-fidelity.ts` does not exist and no script emits it

### Requirement: External-dependent acceptance items marked blocked

An acceptance item whose verification depends on an external event (e.g. platform restart to observe session-level effects) SHALL be marked `blocked (external)` in the change's tasks and SHALL NOT be checked complete; its verification evidence SHALL be referenced from the verification record, and reverse-validation SHALL flag unverified completion claims.

#### Scenario: restart-dependent item not completed

- **WHEN** a tasks list contains an acceptance item requiring a platform restart to verify
- **THEN** the item is marked `blocked (external)` with the reason, never `[x]`, and the verification record references the pending evidence

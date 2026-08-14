# prompt-assembly-probe Specification

## Purpose

TBD - created by archiving change prompt-assembly-probe. Update Purpose after archive.

## Requirements

### Requirement: Probe suite instruments platform prompt assembly and seams

MODIFIED: the `prompt-assembly-probe` package SHALL ship a unit-test suite that instruments the OMP prompt-assembly process and platform seams (per npm dependency `@oh-my-pi/pi-coding-agent@17.2.12`, exact pin) and documents platform facts against the signal-distribution seam map: which platform mechanisms and seams exist, where signals land, and which coordinates are mapped or backlog. The suite is external boundary observation — it documents platform capability; it is NOT evidence that the repo's standard is implemented (conformance evidence lives in the repo's own contract/mechanical tests). The suite SHALL run under the repository's standard test toolchain (`yarn`/vitest) — the `bun` runner dependency is a hallucinated requirement and is removed.

#### Scenario: six probe groups

- **WHEN** `yarn vitest run packages/prompt-assembly-probe` runs (or the root `yarn test` gate, which includes the package)
- **THEN** six probe groups execute: A section placement, B rule-bucket funnel, D reclassification + steering envelope, E R4 fidelity dual-face (OMP native seams + opencode primitives), F slot/seam inventory (position coordinates per seam map; no S4 slot; send-path trio before_agent_start/context/before_provider_request present), G seam live assertions (context rewrite effective, input/tool_call/tool_result event signatures vs npm dist, installed-plugin presence via `omp plugin list`)

#### Scenario: assertion matrix keyed

- **WHEN** an assertion fails
- **THEN** the failure names its seam-map coordinate (e.g. "R4 broken — context seam absent from npm dist") and records it as a platform fact gap, never silently skipping

### Requirement: Input/output extraction per run

Each probe group SHALL dump a structured `{input, output, assertions}` record to `packages/prompt-assembly-probe/outputs/<group>.json` on every run, so the prompt-assembly inputs and outputs are auditable artifacts.

#### Scenario: outputs directory

- **WHEN** the suite runs
- **THEN** `outputs/` contains one JSON file per group with the captured inputs, the rendered/derived outputs, and the assertion results.

### Requirement: npm-only dependencies, zero .refs

MODIFIED: The probe package SHALL resolve all platform modules from npm (`@oh-my-pi/pi-coding-agent@17.2.12` exact; `pi_natives` platform binary via npm optional dependencies, vendored fallback at `packages/prompt-assembly-probe/vendor/` when optional install fails). The package SHALL NOT import, read, or reference `.refs/` in any test, script, or config. The package SHALL NOT require `bun` — all test files SHALL import from `vitest` (API-compatible spellings) so the suite runs under the repo-standard toolchain without a separate runner.

#### Scenario: vendored fallback

- **WHEN** the npm optional natives binary is not installed
- **THEN** the documented manual contingency applies: download `pi_natives.darwin-arm64.node` (same version) into the platform loader's candidate path (`node_modules/@oh-my-pi/pi-natives/native/`) and re-run; the `packages/prompt-assembly-probe/vendor/` directory is reserved for a future committed fallback and is not wired.

#### Scenario: vitest-only runner

- **WHEN** the suite runs on a clean checkout with `yarn install` (no bun install step, no `.bun` store)
- **THEN** all six groups load under vitest with no bun-specific imports and no runner-specific setup; fs-level signature, slot, and distribution assertions execute, and platform-runtime assertions (groups A/B/D runtime probes, G live seam) skip with a documented reason — the pinned npm platform package is bun-runtime-bound (pi-utils `Bun.env` top-level, pi-natives `import.meta.dir` loader)

#### Scenario: full assertions under platform runtime

- **WHEN** the suite runs under the bun runtime (the OMP platform's native runtime) with the vitest-compatible imports
- **THEN** all 19 assertions execute, including the runtime-bound platform probes and live seam assertions

#### Scenario: no .refs leakage

- **WHEN** a grep for `.refs` runs over `packages/prompt-assembly-probe`
- **THEN** zero hits are returned.

### Requirement: R4 fidelity dual-face assertion (native tier)

Probe group E SHALL assert both faces per the native tier: the opencode face (graph-fidelity package) SHALL contain the fidelity primitives (errored-result reduction marker, structural protection set — no dedup keep-latest, no supersede markers: identical-call dedup is REMOVED, ADR 0170); the OMP face SHALL assert the native mechanisms — the `context` event exists in the npm dist, the `compaction.supersedeReads` setting exists with default-on semantics, and the `compaction.dropUseless` setting exists. No "OMP face absent" assertion exists. Assertions SHALL pin the current source layout: primitive names as exported (`fidelityCandidates`, `ERROR_MARKER`) and the marker constant at its definition site (`reduce.ts`), never at a re-import site. The deleted `buildFidelityPlan`/`SUPERSEDED_MARKER` symbols SHALL NOT be asserted (removed, ADR 0170).

#### Scenario: opencode face present

- **WHEN** group E scans `packages/graph-fidelity/src/core/transform.ts` and `packages/graph-fidelity/src/core/reduce.ts`
- **THEN** it finds `fidelityCandidates` and the `ERROR_MARKER` export, and the marker text `[input removed due to failed tool call]` at the `reduce.ts` definition site — and `buildFidelityPlan` / `SUPERSEDED_MARKER` are never asserted as present (absence assertions guard against stale pins, ADR 0170)

#### Scenario: OMP native tier asserted

- **WHEN** group E scans the npm `pi-coding-agent` dist and settings schema
- **THEN** it finds the `context` event emission path, `supersedeReads` (default on), and `dropUseless`, and records them as the native tier in the outputs JSON

### Requirement: G-group seam live assertions

MODIFIED: the suite SHALL include a G group that live-asserts seam behavior against the npm dist: registering a `context` handler SHALL modify the outgoing message array (rewrite effective); the `input`, `tool_call`, and `tool_result` event signatures SHALL match the npm dist types; the send-path trio (`before_agent_start`, `context`, `before_provider_request`) SHALL be present. G-group assertions guard against reference-tree drift (same discipline as the D-group envelope-tag fact).

#### Scenario: context rewrite effective

- **WHEN** group G registers a context handler that appends a marker line
- **THEN** the next transformed message array contains the marker — the seam rewrite is proven live

#### Scenario: seam signatures pinned

- **WHEN** group G inspects the npm dist
- **THEN** the input/tool_call/tool_result event signatures and the send-path trio are pinned in the outputs JSON

#### Scenario: installed plugin discovered

- **WHEN** group G runs `omp plugin list` (OMP CLI available)
- **THEN** the graph-fidelity plugin is reported among the installed plugins; the check is skip-guarded when the CLI is unavailable (native-scan deploy discovery is retired, ADR 0153)

### Requirement: CI-runnable

The full six-group suite SHALL run in CI via the repo-standard `yarn`/vitest toolchain with npm-installed dependencies; no platform install, no local OMP checkout, no Rust build, and no separate `bun` runner is required.

#### Scenario: clean checkout run

- **WHEN** the suite runs on a clean checkout with `yarn install`
- **THEN** all six groups execute and produce outputs, with no `.refs` access

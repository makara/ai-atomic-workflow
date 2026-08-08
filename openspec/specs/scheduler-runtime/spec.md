# scheduler-runtime Specification

## Purpose

Runtime assembly (handler/FSM/persistence composition). Asset: `packages/graph-scheduler/src/scheduler-runtime.ts`.

## Requirements

### Requirement: Runtime assembly and config resolution

System SHALL provide a `createRuntime(config?)` factory that assembles all layers (filesystem, database, FSM, handlers, registry) into a working `SchedulerRuntime`. Config SHALL be resolved with priority: programmatic override → environment variables → config.json → built-in defaults — environment variables SHALL override config.json values. Relative paths in config.json SHALL resolve against the project root (process working directory) — never against the config file location or a nested directory. All path-valued dbPath sources (override, environment, config.json) SHALL resolve relative values against the project root the same way; `:memory:` and absolute paths pass through unchanged.

#### Scenario: createRuntime assembles full stack

- **WHEN** `createRuntime()` is called with optional config overrides
- **THEN** libsql connection SHALL be opened at the configured dbPath
- **THEN** the parent directory of dbPath SHALL be created if missing (in-memory databases excluded)
- **THEN** DDL migration SHALL run (idempotent)
- **THEN** all layers (graph loader, FSM, phase handlers, persistence) SHALL be wired into a single ManagedRuntime — no agent-registry layer exists
- **THEN** the returned `SchedulerRuntime` SHALL expose Promise-typed methods bridging Effect to caller

#### Scenario: Config resolution merges sources

- **WHEN** no config file exists — built-in defaults apply (in-memory database, project-relative taskflow dir)
- **WHEN** `.graph-scheduler/config.json` exists — its values override defaults
- **WHEN** environment variables are set (e.g., `GS_DB_PATH`) — they override config file values
- **WHEN** programmatic override is passed to `createRuntime()` — it takes highest priority

#### Scenario: Relative dbPath resolves against project root

- **WHEN** config.json declares a relative dbPath (e.g. `.graph-scheduler/data/graph-scheduler.db`)
- **THEN** the path SHALL be resolved against the project root (process working directory), independent of the config file location
- **THEN** the resolved absolute path SHALL be used for the libsql connection — spawn working directory SHALL NOT change the effective database location
- **WHEN** dbPath is `:memory:` or an absolute path — the value SHALL be used as-is

#### Scenario: Environment variable overrides config file value

- **WHEN** both `.graph-scheduler/config.json` (with `dbPath`) and `GS_DB_PATH` are set
- **THEN** the environment variable value SHALL win — the libsql connection SHALL open at the env-specified path, not the config.json path

#### Scenario: Relative env dbPath resolves against project root

- **WHEN** `GS_DB_PATH` is set to a relative path (e.g. `data/gs.db`)
- **THEN** the path SHALL be resolved against the project root (process working directory) before opening the libsql connection
- **THEN** spawn working directory SHALL NOT change the effective database location
- **WHEN** `GS_DB_PATH` is `:memory:` or an absolute path — the value SHALL be used as-is

#### Scenario: Programmatic override dbPath normalizes relative values

- **WHEN** `createRuntime({ dbPath: '<relative-path>' })` is called with a relative dbPath
- **THEN** the relative path SHALL resolve against the project root before opening the connection — same rule as config.json and env sources

#### Scenario: Missing database parent directory does not fail startup

- **WHEN** `createRuntime()` runs in a fresh checkout where `.graph-scheduler/data/` does not exist
- **THEN** the parent directory SHALL be created automatically
- **THEN** runtime initialization SHALL complete without error — MCP server startup SHALL NOT fail on missing directories

#### Scenario: Database open failure reports actionable error

- **WHEN** the libsql connection cannot be opened (e.g. permission denied on the resolved path)
- **THEN** the error SHALL include the resolved absolute dbPath and the `GS_DB_PATH` environment variable as override hint

#### Scenario: Config with removed agentRegistry field is rejected

- **WHEN** project config contains an `agentRegistry` field
- **THEN** config validation SHALL fail with an error naming the field as removed
- **AND** setup scaffolding SHALL not emit it

#### Scenario: Agent registry resolves handler and entry skill

- **WHEN** dispatching any main/approval phase
- **THEN** `handlerSkill` SHALL be the constant `atom-phase-handler` — no project config or builtin registry consulted
- **THEN** the phase's entry skill SHALL come from `phase.skill` (missing → configuration error per graph-phase-dispatch)

### Requirement: Composition flow passes artifact context via context channel

The system SHALL allow orchestration flow phases to pass artifact context (e.g. requirement artifacts via `node:` channels — arch-review-loop → spec-implement, adopt-with-docs → spec-implement) into the composed entry phase through explicit channels, instead of static `with` placeholder values. Static `with` values SHALL act as fallback only when no upstream flow output is present. Channel declarations SHALL be resolved against the dispatched entry skill's `## Context Requirements` contract — a channel that is not a direct dependency SHALL use an explicit `node:` prefix, and a `channels` entry duplicating a `dependsOn` node SHALL be reported as a redundant-declaration warning, not silently ignored.

#### Scenario: Flow output drives composed entry

- **WHEN** arch-review-loop runs its implement flow phase producing the review report (`node:review/review-accept` output)
- **THEN** the spec-implement entry phase (spec-extract) SHALL receive the report via its context channel
- **THEN** spec-extract SHALL operate on the report's change scope rather than the static placeholder value

#### Scenario: Static with value remains fallback

- **WHEN** the composed graph is invoked without an upstream flow output
- **THEN** the static `with` placeholder SHALL be used as the default target
- **THEN** the composed entry SHALL proceed with its normal flow instead of skipping it

#### Scenario: Orchestration e2e asserts real artifact targets

- **WHEN** an orchestration end-to-end test executes a composition run (arch-review-loop / openspec-apply) with a named artifact target
- **THEN** the test SHALL assert the composed skeleton acted on the named target, not on placeholder literals

#### Scenario: Cross-level channel declared with node prefix

- **WHEN** an entry phase consumes an upstream output that is not in its `dependsOn` closure (e.g. a sibling graph's output node)
- **THEN** the phase SHALL declare the corresponding `node:<id>` entry in its `channels`
- **THEN** resolution SHALL inject that upstream output

#### Scenario: Duplicate dependsOn entry warns

- **WHEN** a phase declares a `channels` entry whose nodeId is already in its `dependsOn`
- **THEN** validation SHALL emit a redundant-declaration warning naming the entry — the entry SHALL NOT be silently ignored

### Requirement: Implementation track post-approval archive

The implementation track (spec-implement, and the openspec-apply / openspec-engineer graphs) SHALL include an archive phase after the change acceptance approval, dispatching the atom-openspec-archive capability. Skill descriptions SHALL not promise pipeline integration absent from the graph.

#### Scenario: Archive runs after acceptance

- **WHEN** an implementation-track run reaches the acceptance approval and the decision continues
- **THEN** an archive phase SHALL execute after the acceptance node
- **THEN** the archive phase SHALL receive the acceptance decision as its upstream input

#### Scenario: No orphan archive promise

- **WHEN** a skill description references a pipeline position (e.g. "post-approval")
- **THEN** the referenced graph SHALL contain the corresponding phase, or the description SHALL be corrected

### Requirement: Bin entries directly executable

The single graph-scheduler bin (MCP Server `atom-graph-scheduler`) SHALL be directly executable from PATH after global installation — the entry file carries a bun shebang, and direct invocation SHALL NOT depend on a `bun <name>` prefix. The CLI bin `atom-graph-config` SHALL be deleted — no PATH-executable CLI entry SHALL remain; its init/validate/show responsibilities SHALL be taken over by the setup skill (graph-setup-skill capability) and the runtime load prerequisite (graph-scheduling capability).

#### Scenario: MCP server bin direct execution

- **WHEN** the platform invokes `atom-graph-scheduler` directly in any way other than `"command": "bun", "args": ["atom-graph-scheduler"]`
- **THEN** the entry SHALL be launched by the bun interpreter and the MCP stdio handshake SHALL establish normally
- **AND** startup SHALL NOT fail with an `import: command not found`-style error due to a missing shebang

#### Scenario: CLI bin direct execution

- **WHEN** a user attempts to execute `atom-graph-config validate --cwd <repo>` from PATH
- **THEN** the command SHALL NOT exist (bin entry removed)
- **AND** validation SHALL run automatically via the graph load prerequisite, and configuration scaffolding SHALL be executed by the setup-atomic-workflow skill

### Requirement: Shebang survives reinstall

The shebang of the MCP Server entry file (`server.ts`) SHALL be on the first line of the file, and any build/repackaging flow SHALL preserve its presence — especially when the bin points to a source TS file (rather than a build artifact). The CLI entry (`src/cli/entry.ts`) and its shebang SHALL be deleted together with the bin.

#### Scenario: Reinstall preserves executability

- **WHEN** a user reinstalls the graph-scheduler package globally
- **THEN** the newly generated `atom-graph-scheduler` symlink SHALL be directly executable
- **AND** its behavior SHALL be identical to the first installation

### Requirement: Schema validation failure SHALL hint at stale server process

When graph loading fails schema validation and the graph file was modified after the server process started, the error SHALL include a stale-process hint telling the operator to restart the graph-scheduler MCP server. The server start time SHALL be captured at module load time (process-level constant).

#### Scenario: File modified after server start

- **WHEN** `loadAndValidate` fails schema validation on a graph file whose `mtimeMs` is greater than the server start time
- **THEN** the error message SHALL append a hint: graph file modified after server start — restart the graph-scheduler MCP server if this file validates with current sources (stale process)

#### Scenario: File older than server start

- **WHEN** `loadAndValidate` fails schema validation on a graph file whose `mtimeMs` is not greater than the server start time
- **THEN** the error SHALL NOT include the stale-process hint

### Requirement: graph_init report SHALL include serverStartedAt

The graph_init maintenance report SHALL expose the MCP server process start time as an ISO 8601 `serverStartedAt` field.

#### Scenario: Report carries server start time

- **WHEN** an operator invokes graph_init
- **THEN** the report SHALL contain `serverStartedAt` with the module-load timestamp of the server process

#### Scenario: Field absent before restart

- **WHEN** an operator reads the report from a server started before this feature shipped
- **THEN** `serverStartedAt` MAY be absent — consumers SHALL treat it as unknown, not as an error

### Requirement: Workspace-iterating publish scripts

Root SHALL provide `publish:all` (iterate publish) and `publish:dry` (iterate dry-run preflight) scripts; the publish iteration SHALL cover non-private workspaces only.

#### Scenario: Dry-run preflight

- **WHEN** `yarn publish:dry` runs
- **THEN** every non-private workspace executes an npm publish dry-run, any failure fails the whole command, and zero errors is the precondition for publishing

#### Scenario: Full publish

- **WHEN** `yarn publish:all` runs
- **THEN** `@ai-atomic-workflow/graph-scheduler` and `@ai-atomic-workflow/graph-workflow` publish in order, and the private root package is not published

### Requirement: Public access level declaration

The publish access level SHALL be declared via `npmPublishAccess: public` in `.yarnrc.yml`, not via CLI flags.

#### Scenario: Config-based access level

- **WHEN** `.yarnrc.yml` is inspected
- **THEN** it contains `npmPublishAccess: public` — publish defaults to public, accidental private publish is impossible

### Requirement: Pre-publish build and test gate

graph-scheduler SHALL complete build and tests before publish (or pack); any failure SHALL abort the publish.

#### Scenario: Build failure aborts

- **WHEN** `yarn npm publish` (or `yarn pack`) triggers prepack and `yarn build` fails
- **THEN** the publish/pack is aborted and no package with missing `dist/` or source-state artifacts is produced

#### Scenario: Test failure aborts

- **WHEN** `yarn test` fails during the prepack phase
- **THEN** the publish/pack is aborted

### Requirement: Yarn 4 hook semantics

The publish gate SHALL use the `prepack` hook — the lifecycle yarn 4 executes on publish/pack; `prepublishOnly` MUST NOT be used as the publish gate (yarn 4 does not run it — silently ineffective).

#### Scenario: prepack triggers on publish

- **WHEN** `yarn npm publish` or `yarn pack` executes
- **THEN** the prepack script runs (build + test)

### Requirement: Typecheck delegates to packages

`yarn typecheck` SHALL complete via per-package self-check — the root SHALL NOT compile sources directly; workspaces without compilable TS input SHALL be skipped without failing the root command.

#### Scenario: Root command delegates to packages

- **WHEN** `yarn typecheck` runs
- **THEN** each non-private workspace `typecheck` script executes in sequence, and any failure fails the whole command

#### Scenario: Package with no compilable input does not block silently

- **WHEN** a workspace tsconfig has no compilable TS input (e.g. a markdown-only skills package)
- **THEN** its typecheck SHALL report TS18003 and the include SHALL be corrected to point at real TS sources — the root command MUST NOT swallow the error

### Requirement: Lint exempts config-class files

ESLint SHALL NOT apply type-aware rules to build/test config files (e.g. `packages/*/vitest.config.*`); `yarn lint` SHALL exit with zero errors.

#### Scenario: Config file project classification

- **WHEN** `yarn lint` runs and the repo contains `packages/<pkg>/vitest.config.ts`
- **THEN** that file is covered by ignores and does not report "not found by the project service"; lint passes with zero errors

### Requirement: Test discovery whitelist

Root `yarn test` SHALL discover only `packages/**/*.test.ts`; test files in any vendor/reference directory (`.refs/` etc.) MUST NOT run as part of the root test command.

#### Scenario: Vendor tests excluded

- **WHEN** root `yarn test` runs and `.refs/` contains test files
- **THEN** those files do not run; root tests cover only the two packages' own suites

#### Scenario: New top-level directory immune by default

- **WHEN** a new top-level directory containing `*.test.ts` files is added that is not a packages workspace
- **THEN** root `yarn test` does not execute those tests (outside the whitelist — no exclusion list maintenance required)

### Requirement: Per-package typecheck ownership

Each workspace `typecheck` script SHALL compile its own real TS sources — graph-workflow compiles `tests/**/*.ts`, graph-scheduler compiles `src/**/*.ts` and `server.ts`.

#### Scenario: Package-level type gate

- **WHEN** `yarn workspace @ai-atomic-workflow/graph-workflow typecheck` runs
- **THEN** its tsconfig include points at actual TS files and the command exits zero (no TS18003 no-input error)

### Requirement: Input-stage reset in the FSM

The scheduler runtime SHALL implement one activation reset rule: on run start, and on any backward reset (gate branchTo / graph_jump) whose target is an input node, all input nodes SHALL reset to pending and SHALL be the only eligible nodes until the input stage completes; author nodes resume after. The prologue-specific reset branch (keyed on flattened in-degree-0 entry) SHALL be replaced by the general input-node rule.

#### Scenario: Input stage dispatches first

- **WHEN** a run starts or a reset targets an input node
- **THEN** resolveReady SHALL select only input nodes until all input nodes are done, then author nodes

#### Scenario: Injection at load

- **WHEN** a graph loads
- **THEN** default input nodes (`run-mode` when approval/gate consumers exist, `constraints` always) SHALL be injected unless the graph declares same-kind nodes

### Requirement: REQ-A1: LICENSE file SHALL exist at repository root

The repository root SHALL contain a `LICENSE` file whose content is the full MIT license text (including the "MIT License" heading and the license body).

#### Scenario: LICENSE exists and is full MIT text

- **WHEN** the `LICENSE` file at the repository root is inspected
- **THEN** the file SHALL exist
- **AND** its content SHALL start with "MIT License" and include the complete license terms

### Requirement: REQ-A2: package.json SHALL declare MIT license

All three `package.json` files (root, `packages/graph-scheduler/`, `packages/graph-workflow/`) SHALL contain `"license": "MIT"`.

#### Scenario: All three package.json files declare license

- **WHEN** the `license` field of the three `package.json` files is parsed
- **THEN** all three SHALL be `"MIT"`

### Requirement: REQ-B1: Both packages SHALL use @ai-atomic-workflow scope naming

`packages/graph-scheduler/package.json` SHALL use the name `@ai-atomic-workflow/graph-scheduler`; `packages/graph-workflow/package.json` SHALL use the name `@ai-atomic-workflow/graph-workflow`. The global install command in the README (root + graph-scheduler package) SHALL use the scope name.

#### Scenario: Package names carry scope and install commands stay in sync

- **WHEN** the `name` field of both packages' `package.json` is parsed and the README install commands are grepped
- **THEN** scheduler SHALL be `@ai-atomic-workflow/graph-scheduler` and workflow SHALL be `@ai-atomic-workflow/graph-workflow`
- **AND** `npm install -g @ai-atomic-workflow/graph-scheduler` SHALL appear in the README (root + scheduler package)
- **AND** the README SHALL NOT contain a bare `npm install -g graph-scheduler` command

### Requirement: REQ-C1: Version SHALL be unified at 0.1.0

All three `package.json` files SHALL use `"version": "0.1.0"` (both packages publish with the same version number during the alpha phase).

#### Scenario: All three versions identical

- **WHEN** the `version` field of the three `package.json` files is parsed
- **THEN** all three SHALL be `"0.1.0"`

### Requirement: REQ-D1: graph-scheduler SHALL have a non-empty description

`packages/graph-scheduler/package.json` SHALL contain a non-empty `description`.

#### Scenario: description exists

- **WHEN** the `description` field of `packages/graph-scheduler/package.json` is parsed
- **THEN** the field SHALL exist and be a non-empty string

### Requirement: REQ-D2: Both packages SHALL include keywords

Both packages' `package.json` SHALL contain a non-empty `keywords` array (including the common items graph/workflow/dag/fsm/taskflow/agent/automation/mcp/orchestration; graph-scheduler additionally includes mcp-server, effect-ts).

#### Scenario: keywords array is non-empty and contains common items

- **WHEN** the `keywords` field of both packages' `package.json` is parsed
- **THEN** both SHALL be non-empty arrays
- **AND** both SHALL include "graph" and "mcp"
- **AND** scheduler SHALL include "mcp-server" and "effect-ts"

### Requirement: REQ-D3: Both packages SHALL include author

Both packages' `package.json` SHALL include `author` (name: makarawang, email: makara15@gmail.com — consistent with the marketplace.json owner).

#### Scenario: author matches marketplace owner

- **WHEN** the `author` field of both packages' `package.json` is parsed and compared with the `.claude-plugin/marketplace.json` owner
- **THEN** both SHALL be `{ "name": "makarawang", "email": "makara15@gmail.com" }`

### Requirement: REQ-D4: Both packages SHALL include repository

Both packages' `package.json` SHALL include `repository` (the GitHub URL `https://github.com/makara/ai-atomic-workflow.git` plus each package's `directory` subpath).

#### Scenario: repository points to the correct repo and subpaths

- **WHEN** the `repository` field of both packages' `package.json` is parsed
- **THEN** both `url` values SHALL be `https://github.com/makara/ai-atomic-workflow.git`
- **AND** scheduler `directory` SHALL be `packages/graph-scheduler` and workflow SHALL be `packages/graph-workflow`

### Requirement: REQ-D5: Both packages SHALL include homepage

Both packages' `package.json` SHALL include `homepage` (`https://github.com/makara/ai-atomic-workflow#readme`).

#### Scenario: homepage exists

- **WHEN** the `homepage` field of both packages' `package.json` is parsed
- **THEN** both SHALL be `https://github.com/makara/ai-atomic-workflow#readme`

### Requirement: REQ-D6: Both packages SHALL include bugs

Both packages' `package.json` SHALL include `bugs` (`https://github.com/makara/ai-atomic-workflow/issues`).

#### Scenario: bugs points to the issue tracker

- **WHEN** the `bugs` field of both packages' `package.json` is parsed
- **THEN** both SHALL be `{ "url": "https://github.com/makara/ai-atomic-workflow/issues" }`

### Requirement: REQ-D7: Both packages SHALL include a files whitelist

Both packages' `package.json` SHALL include a `files` whitelist: graph-scheduler = `server.ts`, `src/`, `dist/`, `graphs/`, `package.json`, `README.md`; graph-workflow = `skills/`, `package.json`, `README.md`.

#### Scenario: pack contents restricted to the whitelist

- **WHEN** `npm pack --dry-run` is executed on both packages
- **THEN** the scheduler tarball SHALL contain `server.ts`, `src/`, `graphs/` (9 graphs + registry.json)
- **AND** the workflow tarball SHALL contain exactly 13 SKILL.md files + 2 seeds files + `package.json` + `README.md`

### Requirement: REQ-D8: Both packages SHALL declare engines

`packages/graph-scheduler/package.json` SHALL include `engines` (bun >= 1.0.0, node >= 22.0.0); `packages/graph-workflow/package.json` SHALL include `engines` (node >= 20.0.0).

#### Scenario: engines declares runtime constraints

- **WHEN** the `engines` field of both packages' `package.json` is parsed
- **THEN** scheduler SHALL include `bun >= 1.0.0` and `node >= 22.0.0`
- **AND** workflow SHALL include `node >= 20.0.0`

### Requirement: REQ-V1: Both packages SHALL pass pack validation

Executing `npm pack --dry-run` on both packages SHALL succeed (exit 0), and the tarball metadata (name/version) SHALL match package.json.

#### Scenario: pack succeeds and metadata matches

- **WHEN** `npm pack --dry-run` is executed on both packages
- **THEN** the command SHALL finish with exit 0
- **AND** the scheduler tarball SHALL be named `ai-atomic-workflow-graph-scheduler-0.1.0.tgz`
- **AND** the workflow tarball SHALL be named `ai-atomic-workflow-graph-workflow-0.1.0.tgz`

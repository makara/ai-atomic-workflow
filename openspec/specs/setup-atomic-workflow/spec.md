# setup-atomic-workflow Specification

## Purpose

Project graph configuration initialization. Assets: `packages/graph-workflow/skills/setup-atomic-workflow/SKILL.md`.

## Requirements

### Requirement: Four-step setup flow

The setup skill SHALL follow Explore → Present → Confirm → Write. Explore SHALL detect existing state (`.graph-scheduler/` dir, config.json, graphs/, constraints.md) and present it — reading config.json, listing graph files, and extracting constraint rules. Present SHALL offer recommended defaults first (per atom-kernel approval() rules). Confirm SHALL confirm dbPath/taskflowDir/registryPaths one item per turn, recommendation first. Write SHALL copy seed files only.

#### Scenario: Fresh project scaffold

- **WHEN** user runs setup in a project with no `.graph-scheduler/` directory
- **THEN** Explore reports absent state, Present offers default layout, Confirm iterates dbPath/taskflowDir/registryPaths
- **AND** Write creates config.json + constraints.md seeds with defaults derived from the single source of truth

#### Scenario: Existing partial layout

- **WHEN** a project has `.graph-scheduler/config.json` but no graphs/ or constraints.md
- **THEN** Explore reports the partial state
- **AND** Write fills only the missing files without touching existing ones

### Requirement: Seed files derived from runtime defaults

Seed config.json SHALL be generated from the same function that produces runtime defaults (`createDefaultConfig()` / `BUILTIN_*` constants exported from graph-scheduler runtime). No hand-written literals SHALL duplicate default layout values in the skill directory — seeds SHALL carry provenance comments pointing at the source module.

#### Scenario: Default drift locked

- **WHEN** a runtime default (e.g. dbPath fallback, builtin taskflow dir) changes
- **THEN** scaffolded seed content changes with it
- **AND** a test asserting "scaffold defaults == runtime defaults" SHALL pass

### Requirement: Idempotent writes

Write SHALL never overwrite existing files — create gaps only. The run SHALL output a created/existed inventory mirroring the retired IInitReport.

#### Scenario: Re-run produces no change

- **WHEN** setup runs twice on the same project
- **THEN** the second run writes nothing, reports all files as existed
- **AND** re-running asserts no file content changed

### Requirement: Self-check step

After Write, the skill SHALL re-read every written file and verify JSON/YAML parses. Parse failure SHALL be reported as a failed step with the file path, not silently accepted.

#### Scenario: Corrupt seed detection

- **WHEN** a seed file write produces unparseable content
- **THEN** self-check reports the file path and parse error
- **AND** setup ends in a failed state

### Requirement: Skill discoverability

The skill description SHALL carry trigger phrases ("initialize graph-scheduler project config", "setup .graph-scheduler", "create config.json", "setup-atomic-workflow") per atom-skill-spec so both users and graph dispatch can reach it.

#### Scenario: Trigger phrase lookup

- **WHEN** a user or graph requests setup of `.graph-scheduler` config
- **THEN** the phrase matches the skill description
- **AND** dispatch loads setup-atomic-workflow

### Requirement: Skill name setup-atomic-workflow

The setup skill SHALL be named `setup-atomic-workflow` — directory `packages/graph-workflow/skills/setup-atomic-workflow/`, frontmatter `name: setup-atomic-workflow`, body self-references updated. The legacy name `atom-graph-setup` SHALL NOT be referenced anywhere live (docs swept); archived change history stays frozen.

#### Scenario: Skill resolves by new name

- **WHEN** a user or graph loads `setup-atomic-workflow`
- **THEN** the skill SHALL load with frontmatter name matching the directory
- **AND** `atom-graph-setup` SHALL no longer resolve (no live callers exist)

### Requirement: Full-registry contract validation on graph_init

graph_init SHALL scan the project taskflow dir + built-in graphs + graph-workflow skills package and run the full entry-skill contract alignment with orphan detection enabled (`validateEntrySkillContracts(..., { checkOrphans: true })`) — orphan skills, graph-level upstream coverage, per-phase forward/reverse channel checks all execute. Violations SHALL be returned with the MCP response; idempotent — repeated runs report the same state without side effects.

#### Scenario: Orphan skill reported

- **WHEN** a skill in the skills package declares graph-callable Context Requirements but no graph phase dispatches it
- **THEN** graph_init SHALL report the orphan skill with its contract summary
- **AND** no graph run is required for the check to fire

#### Scenario: Channel deletion surfaces

- **WHEN** a graph phase's channels no longer cover its entry skill contract Reference/Files entries
- **THEN** graph_init SHALL report the missing entry naming phase and graph
- **AND** the report matches load-time validation output for the same graph

#### Scenario: Idempotent health check

- **WHEN** graph_init runs twice on the same project
- **THEN** both runs SHALL report identical validation results

### Requirement: Config health report

graph_init SHALL report project config state: config.json existence, schema validity, dbPath parent directory existence (non-:memory:), taskflowDir existence. Missing config.json SHALL NOT block the graph validation portion — both reports SHALL be returned together.

#### Scenario: Malformed config reported

- **WHEN** `.graph-scheduler/config.json` contains invalid JSON or fails ConfigFileSchema
- **THEN** graph_init SHALL report the config error with the failing path
- **AND** graph validation results SHALL still be returned

#### Scenario: Missing config reported

- **WHEN** `.graph-scheduler/config.json` does not exist
- **THEN** graph_init SHALL report config as missing (defaults apply at runtime)
- **AND** NOT block graph validation

### Requirement: Runtime config failure diagnostics

resolveConfig SHALL emit a debugLog `config_error` event (path + parse/schema reason) when config.json exists but fails to load — malformed config never degrades silently. Missing config SHALL NOT log (defaults are the documented behavior).

#### Scenario: Broken config logged

- **WHEN** config.json is invalid JSON or schema-mismatched and a runtime is created
- **THEN** a `config_error` debugLog entry SHALL carry the path and reason
- **AND** runtime SHALL fall back to defaults as before

### Requirement: skillsDir configurable

config.json SHALL accept an optional `skillsDir` field (resolved relative to project root). Load-time alignment and graph_init validation SHALL prefer it; absent → fall back to repo-root and package-sibling probing. The global-install degradation warning SHALL be emitted once per process, not per load.

#### Scenario: Global install points at skills package

- **WHEN** a project sets `skillsDir` to a graph-workflow skills package path
- **THEN** load-time alignment SHALL run against that package (D6 checks active)
- **AND** graph_init SHALL use the same path

#### Scenario: skillsDir absent keeps probing

- **WHEN** config.json has no `skillsDir`
- **THEN** probing order SHALL remain repo-root then package-sibling
- **AND** behavior SHALL be unchanged from the pre-config fallback

### Requirement: marketplace.json SHALL be valid JSON

The `.claude-plugin/marketplace.json` file SHALL parse successfully as JSON. No trailing commas or other syntax errors SHALL be present.

#### Scenario: Syntax validation passes

- **WHEN** `.claude-plugin/marketplace.json` is parsed with a JSON parser (e.g. `python3 -c "import json; json.load(open('.claude-plugin/marketplace.json'))"`)
- **THEN** parsing SHALL succeed without error

#### Scenario: Trailing comma regression is detected

- **WHEN** a trailing comma is introduced inside the plugins array
- **THEN** the file SHALL fail JSON parsing at the offending line

### Requirement: Plugin 1 skills SHALL match disk truth

The `ai-atomic-workflow` plugin's `skills` list SHALL declare exactly the skill directories present under the repo-root `skills/` directory. Deleted skills SHALL NOT be declared; existing undeclared skills SHALL be declared.

#### Scenario: Plugin 1 declares exactly the 15 on-disk skills

- **WHEN** the repo-root `skills/` directory contains 15 skill directories
- **THEN** plugin 1 `skills` SHALL contain exactly those 15 paths
- **AND** SHALL NOT contain the removed docs skills (atom-docs-writer, atom-sync-docs, docs-categories, docs-guide, docs-maintain)
- **AND** SHALL contain atom-hello and presentation-design

### Requirement: SKILL.md frontmatter SHALL be YAML-strict-compliant

Every SKILL.md under `packages/graph-workflow/skills/` and the repo-root `skills/` SHALL parse under a strict YAML frontmatter parser (as used by the skills CLI). Unquoted plain-scalar values SHALL NOT contain `: ` (colon+space); description values containing it SHALL be double-quoted.

#### Scenario: Skills CLI discovers all graph-workflow skills

- **WHEN** running `npx skills add ./packages/graph-workflow/skills -l`
- **THEN** the preview SHALL list exactly the 10 graph-workflow skills

#### Scenario: Strict parse of any SKILL.md frontmatter

- **WHEN** a SKILL.md description contains `Trigger: ` or any `: ` sequence inside a plain scalar
- **THEN** the description SHALL be quoted so a strict YAML parser accepts the frontmatter

### Requirement: Tree-subpath install source SHALL be documented as independent channel

The install docs SHALL provide a tree-subpath install command for graph-workflow skills that does not depend on marketplace.json parseability, and SHALL state its verification gate.

#### Scenario: Tree-subpath source lists exactly 10 skills

- **WHEN** running `npx skills add https://github.com/makara/ai-atomic-workflow/tree/main/packages/graph-workflow/skills -l`
- **THEN** the preview SHALL list exactly the 10 graph-workflow skills

#### Scenario: Repo-root source lists the full set

- **WHEN** running `npx skills add makara/ai-atomic-workflow -l`
- **THEN** the preview SHALL list at least 25 skills (15 legacy + 10 graph-workflow)

### Requirement: Plugin 2 SHALL declare all graph-workflow skills

The `graph-workflow` plugin's `skills` list SHALL declare every skill in `packages/graph-workflow/skills/`, so Claude Code marketplace installs the full set of built-in graph skills.

#### Scenario: Plugin 2 declares the full 10-skill set

- **WHEN** `packages/graph-workflow/skills/` contains 14 skill directories (atom-doc-lifecycle, atom-doc-maintain, atom-domain-spec, atom-spec-maintain, atom-adr-maintain, atom-graph-design, atom-graph-spec, atom-graph-writer, atom-kernel, atom-phase-handler, atom-pilot, atom-scope-interview, atom-skill-spec, setup-atomic-workflow)
- **THEN** plugin 2 `skills` SHALL declare all 14 paths
- **AND** `atom-tool-detection` SHALL NOT appear
- **AND** `atom-doc-maintenance` and `atom-openspec-archive` SHALL NOT appear (removed)

### Requirement: skills.sh.json SHALL conform to the skills.sh schema

The repo-root `skills.sh.json` SHALL be valid JSON conforming to `https://skills.sh/schemas/skills.sh.schema.json`: each grouping object SHALL use a `title` field (not `name`), with at least one skill per group and no unknown fields.

#### Scenario: Groupings use schema-required title field

- **WHEN** `skills.sh.json` is validated against the skills.sh schema
- **THEN** every grouping object SHALL have a non-empty `title` and a non-empty `skills` array
- **AND** no grouping object SHALL contain the unsupported `name` field

#### Scenario: Invalid file falls back to default list

- **WHEN** `skills.sh.json` is missing or invalid
- **THEN** the skills.sh repo page SHALL use the default list derived from CLI discovery (marketplace.json plugin declarations)

### Requirement: Grouping coverage SHALL include graph-workflow skills

The optional groupings SHALL cover the graph-workflow skills and MCP instruction skills so the repo page is scannable.

#### Scenario: Graph Workflow group lists the atom-* skills

- **WHEN** the repo page renders with the customized groupings
- **THEN** a "Graph Workflow" group SHALL list the 11 graph-workflow skills
- **AND** MCP instruction skills (mcp-headroom, mcp-jcodemunch, mcp-serena) SHALL be grouped or explicitly ungrouped per `notGrouped`

### Requirement: Scaffold SHALL include the attached-doc directory

- **WHEN** the setup skill scaffolds a project
- **THEN** it SHALL create `.graph-scheduler/graphs/` (existing behavior) AND `.graph-scheduler/docs/` — the maker-journey attached-doc home
- **AND** the write step SHALL be idempotent (fill gaps only, never overwrite) — the docs/ directory SHALL be created only when missing

#### Scenario: Fresh project scaffold includes docs dir

- **WHEN** setup-atomic-workflow runs on a project without `.graph-scheduler`
- **THEN** the created inventory SHALL include `.graph-scheduler/docs/`
- **AND** the self-check SHALL verify the directory exists

#### Scenario: Re-run adds nothing

- **WHEN** setup-atomic-workflow re-runs on a fully scaffolded project
- **THEN** the inventory SHALL report existed for all pieces, including docs/ — no writes, no errors

### Requirement: Seed literals single-sourced

setup-atomic-workflow/SKILL.md SHALL NOT re-encode seed layout values (dbPath, taskflowDir, registryPaths) as body literals — `./seeds/config.json` is the single source; the body SHALL reference it by pointer and may describe the seed's role without duplicating its values.

#### Scenario: No literal duplication

- **WHEN** reading setup-atomic-workflow/SKILL.md body
- **THEN** the seed values exist only in `seeds/config.json` (and its provenance source `createDefaultConfig()`)
- **AND** body references to the seed use `./seeds/config.json`

### Requirement: Portable provenance references

setup-atomic-workflow/SKILL.md SHALL reference code provenance by name, never by project-specific file path — the body SHALL NOT hardcode paths outside the skill set, convention layer, and workflow artifacts.

#### Scenario: Name-only provenance

- **WHEN** searching setup-atomic-workflow/SKILL.md for file paths
- **THEN** no project-specific source paths appear — provenance is named (`createDefaultConfig()`)

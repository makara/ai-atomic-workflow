# hlt-heat-layering Specification

## Purpose

Heat-based allocation of the High-Level Tool Registry: scenario-keyed registration (target domain × operation → exactly one adapter), hot placement of core scenario rows in atom-kernel, heat layering across MCP families (serena/jcodemunch/graph-scheduler/headroom), allocation single-home. No fallback, no judgment surface.

## Requirements

### Requirement: Registry key is scenario (target domain × operation)

The registry SHALL key every execution entry by scenario — a pair of target domain and operation class. Target domains SHALL be: in-project code, in-project non-code text (indexed: yaml/toml/json/OpenAPI/Ansible; unindexed: markdown/plain text), in-project special types (sqlite/image/PDF/archive/notebook/non-UTF-8), out-of-project (any path, any type). Operations SHALL be: locate, read, write, verify, run, compress. Every scenario SHALL map to exactly one adapter (one-adapter rule); a scenario with zero or multiple adapters SHALL be a validation error — except permissive cells declared as such (see ADDED In-project non-code text read/write). Every scenario entry SHALL declare its obligations (e.g. register_edit, compress trigger) and its n/a rules (structural impossibility with the reason); an obligation SHALL be satisfiable within its scenario — an obligation whose scope exceeds the adapter's reach SHALL be a validation error; obligations SHALL never be inherited from another domain's default. Formal enforcement SHALL be scenario-table-driven: each tool call resolves (target path + type) → scenario → adapter; a call whose tool is not the scenario's designated adapter SHALL be denied naming the scenario's adapter; scenarios without a designated adapter row (unassigned), target types outside the domain enumeration (unknown types), and calls whose tool is not any scenario's designated adapter (unknown tools — MCP or otherwise) SHALL pass through — never block what we cannot classify; no global tool-denial set SHALL apply; designated adapter families (serena/jcodemunch/headroom) SHALL never be denied; rules SHALL equal scenario rows (no global tool-denial sets); the contract SHALL be platform-neutral, per-platform application (extension API, permission ruleset) being an implementation concern.

#### Scenario: In-project code locate

- **WHEN** an agent locates a symbol in an in-project code file
- **THEN** the adapter SHALL be jcodemunch (search_symbols/find_references/check_references/get_blast_radius/plan_turn) followed by serena LSP ground-truth confirmation (find_symbol/find_referencing_symbols) before mutation
- **AND** the mapping SHALL be resolvable from the SKILL.md core scenario rows without cold read

#### Scenario: In-project code read/write/verify

- **WHEN** an agent reads, edits, or verifies an in-project code file
- **THEN** the adapter SHALL be serena (overview → sliced read_file for read; LSP symbol edits + diagnostics + re-read for write/verify)
- **AND** the mapping SHALL be resolvable from the SKILL.md core scenario rows

#### Scenario: Out-of-project files

- **WHEN** an agent reads or writes a file outside the project root
- **THEN** the adapter SHALL be the platform-native read/write (absolute-path passthrough); serena SHALL be `n/a: project-root-bound` and jcodemunch SHALL be `n/a: not indexed`

#### Scenario: In-project special types

- **WHEN** an agent reads an in-project sqlite/image/PDF/archive/notebook or non-UTF-8 file
- **THEN** the adapter SHALL be the platform-native read (sqlite selectors, archive members, image, PDF, notebook dispatch); serena SHALL be `n/a: UTF-8 text only`, jcodemunch SHALL be `n/a: not indexed`

#### Scenario: Unknown scenario fails validation

- **WHEN** the registry is validated
- **THEN** every scenario key SHALL have exactly one adapter entry (permissive cells excepted), and a missing or ambiguous mapping SHALL be a validation error

#### Scenario: register_edit scoped to indexed targets

- **WHEN** an agent edits an in-project code file or an indexed non-code-text subtype (yaml/toml/json/OpenAPI/Ansible)
- **THEN** the entry SHALL require `jcodemunch register_edit` while the index is mounted

#### Scenario: register_edit n/a for unindexed targets

- **WHEN** an agent edits markdown, plain text, or an out-of-project file
- **THEN** the entry SHALL declare `n/a: not indexed` and the obligation SHALL be absent

#### Scenario: Scenario-row allow

- **WHEN** a tool call's target resolves to a scenario whose adapter is that tool
- **THEN** the call SHALL be allowed

#### Scenario: Scenario-row deny

- **WHEN** a tool call's target resolves to a scenario whose adapter is a different tool
- **THEN** the call SHALL be denied naming the scenario's designated adapter

#### Scenario: Unassigned scenario passthrough

- **WHEN** a tool call's target resolves to a scenario with no designated adapter row (unassigned scenario)
- **THEN** the call SHALL pass through to platform-native tools — no denial
- **AND** no global tool-denial set SHALL apply

#### Scenario: Unknown target type passthrough

- **WHEN** a tool call targets a file type outside the domain enumeration (unknown type)
- **THEN** the target SHALL NOT be classified as code
- **AND** the call SHALL pass through — no denial

#### Scenario: Adapter families never denied

- **WHEN** a tool call uses a designated adapter family tool (serena/jcodemunch/headroom)
- **THEN** the call SHALL never be denied by the scenario table

### Requirement: Core scenario rows SHALL be hot-placed; full table cold single-home

The atom-kernel SKILL.md §High-Level Tool Registry SHALL embed the core scenario rows: target-domain enumeration (in-project code / in-project non-code text indexed+unindexed / in-project special types / out-of-project / run / compress) and the core operation (locate/read/write/verify/run/compress) → designated adapter mapping with named n/a reasons. The full scenario table (all entries, validation rules, edge n/a) SHALL stay in HLT-REGISTRY.md as the cold archive. An executor SHALL resolve adapter assignment for core operations from the hot surface without cold-reading the archive. Registry Injection blocks SHALL carry the scenario key — `## Registry: <tool> — scenario: <domain> x <operation> -> <adapter>` — so the dispatched node receives adapter assignment with the entry; undeclared classes SHALL degrade to the SKILL.md core scenario rows; injection SHALL be the assignment authority and the executor SHALL NOT re-classify by judgment.

#### Scenario: Core adapter resolved from hot surface

- **WHEN** an executor needs the adapter for a core operation on a known target domain
- **THEN** the SKILL.md core scenario rows SHALL provide the mapping
- **AND** no cold read of HLT-REGISTRY.md SHALL be required

#### Scenario: Full table stays cold

- **WHEN** a registry author or validator needs the complete scenario table
- **THEN** HLT-REGISTRY.md SHALL hold the full table, entries, and validation rules
- **AND** the SKILL.md core rows SHALL NOT duplicate entry anatomy

#### Scenario: Declared class injection carries scenario key

- **WHEN** a node declares an operation class with a registry entry
- **THEN** the injected `## Registry:` block SHALL include the scenario key (domain x operation -> adapter)
- **AND** the executor SHALL use the injected assignment without re-classification

#### Scenario: Undeclared class degrades to core rows

- **WHEN** a node declares no operation class for an operation it performs
- **THEN** the executor SHALL resolve the adapter from the SKILL.md core scenario rows
- **AND** no cold read SHALL be required for core operations

### Requirement: Hot tool parameter surfaces SHALL be hot-placed; full tables single-home

The hot tool parameter surfaces (serena: replace_content/replace_in_files/create_text_file/read_file/get_diagnostics_for_file/search_for_pattern; jcodemunch: search_symbols/find_references/check_references/get_blast_radius/register_edit/search_text/get_file_content) SHALL be resolvable from the hot path (atom-kernel SKILL.md compact tables or registry-injection-carried) without cold-reading the schemas files. Full parameter tables SHALL stay in SERENA/JCODEMUNCH-SCHEMAS.md (single-home); the SKILL.md hot surface SHALL carry only the compact form.

#### Scenario: Hot param resolved without cold read

- **WHEN** an executor needs parameters for a hot tool
- **THEN** the SKILL.md compact table or injection block SHALL provide them
- **AND** no schemas cold read SHALL be required

#### Scenario: Full tables stay single-home

- **WHEN** the complete parameter table for a hot tool is needed
- **THEN** it SHALL be found in the schemas file
- **AND** the SKILL.md hot surface SHALL carry only the compact form

### Requirement: Graph-scheduler family SHALL be hot-declared

The graph-scheduler tool parameter tables (graph_start/graph_advance/graph_status/graph_list/graph_force_end/graph_jump/graph_init/graph_clean_completed/graph_clean_all) SHALL be hot in atom-pilot §MCP Reference with an explicit heat annotation: execution-hot tools (graph_start/graph_advance/graph_jump/graph_force_end) vs operation-cold tools (graph_status/graph_list/graph_init/graph_clean_*) — one table, same lifecycle, no split.

#### Scenario: Graph-scheduler params hot

- **WHEN** the pilot loop dispatches a graph call
- **THEN** the parameter table SHALL be in atom-pilot §MCP Reference
- **AND** the heat annotation SHALL be explicit

### Requirement: Headroom compress contract SHALL be MCP-authoritative

The headroom compress contract SHALL be the MCP form: headroom_compress (content -> {compressed, hash, tokens_before/after, transforms}), headroom_retrieve (hash -> original), headroom_stats. Proxy forms (headroom proxy / platform plugins) SHALL be deployment instances, never the contract authority. The hash contract SHALL honor the CCR TTL (default 1800s session-scale, overridable) — retrieval within TTL restores the original; after TTL the entry SHALL declare `n/a: expired`. Health gate: proxy unreachable SHALL surface `[HEADROOM PROXY DOWN]` as a deployment-fault marker (not a contract surface); honest 0% (cold start) SHALL surface `[HEADROOM COLD]`. Platform-specific deployment forms SHALL NOT alter the contract.

#### Scenario: Compress and retrieve via MCP

- **WHEN** an agent compresses a >threshold read via headroom_compress MCP
- **THEN** the result SHALL carry a hash and the original SHALL be retrievable via headroom_retrieve within the TTL
- **AND** headroom_compress MCP SHALL be the contract tool

#### Scenario: Proxy is deployment instance

- **WHEN** a platform uses the proxy form
- **THEN** the contract SHALL remain the MCP tools
- **AND** proxy unreachable SHALL surface `[HEADROOM PROXY DOWN]` as deployment-fault marker, never silently

#### Scenario: Compress trigger

- **WHEN** a read result exceeds the compress threshold
- **THEN** the entry SHALL require headroom compression with hash retention for retrieval

### Requirement: Allocation SHALL be single-home

Each tool parameter table SHALL live in exactly one file — the schemas files (SERENA/JCODEMUNCH-SCHEMAS.md) hold parameter tables; HLT-REGISTRY entries SHALL reference tools by name and SHALL NOT restate parameter tables. An allocation audit SHALL confirm single-home per tool and delete duplicates.

#### Scenario: Schema parameters single-home

- **WHEN** a tool's parameter table is located
- **THEN** it SHALL appear in exactly one schemas file
- **AND** HLT-REGISTRY entries SHALL reference the tool without restating its parameters

#### Scenario: Duplicate tables deleted

- **WHEN** an allocation audit finds a parameter table duplicated between schemas and HLT-REGISTRY entries
- **THEN** the duplicate SHALL be deleted from the entry
- **AND** the entry SHALL reference the schemas home

### Requirement: In-project non-code text read/write SHALL use platform-native tools

The in-project non-code text read/write scenario SHALL be a permissive cell: platform-native read/write is the adapter and platform-native tool calls on text targets SHALL be allowed, never denied. Locate SHALL remain per ADR 0138: indexed subtypes → jcodemunch; unindexed → serena search_for_pattern. register_edit SHALL remain scoped per subtype: indexed targets unconditional while the index is mounted; unindexed targets `n/a: not indexed`.

#### Scenario: Text read native

- **WHEN** an agent reads an in-project markdown/plain/yaml/toml/json file
- **THEN** the platform-native read tool SHALL be allowed

#### Scenario: Text write native

- **WHEN** an agent writes an in-project markdown/plain/yaml/toml/json file
- **THEN** the platform-native write/edit tools SHALL be allowed

#### Scenario: Text locate unchanged

- **WHEN** an agent locates content in an in-project non-code text file
- **THEN** the adapter SHALL be jcodemunch (indexed subtypes) or serena search_for_pattern (unindexed)
- **AND** no platform-native search tool SHALL be mandated or denied by this scenario

# DDD Domains Standard and Index

> This file = the repo's fine-grained DDD domain standard + index single source; `docs/domains/` directory tree forbidden. Granularity: one domain per skill / per graph / per feature point. References: clean-ddd-hexagonal (bounded context / subdomain classification / dependency rules) + codebase-design (seam / depth / locality / leverage). Division of labor: this file governs "who owns what"; glossary governs term disambiguation. No duplication.

## Design Requirements

Binding constraints on domain design (split, boundary, kind, naming) - standing equal to `.graph-scheduler/constraints.json`; every maintenance pass reads and complies. User-proposed, grill-confirmed via the estate-maintain user-request pass; recorded as bullets, one simple sentence each. Requirements never create domains and never substitute asset-derived provenance.

- Domain index covers only packages/-owned domains (skill/graph/engine-feature) and necessary supporting domains (e.g. test, release).
- No Doc-Family domain kind - documentation standards are carried by skills and other documents.
- No Virtual domain kind - virtual specs deduplicate into their corresponding entity domains.
- Deleted-domain spec content: non-packages content deleted outright; packages-related content merges into the corresponding entity domain spec.
- domains.md, openspec/specs, and docs/adr content pure English — all prose (titles, headings, paragraphs, tables, list items, link text); code/identifiers/paths untouched.
- Existing non-English content in domains.md, openspec/specs, and docs/adr translated to English.

## Split Standard

### Granularity Rules

|Rule|Content|
|-|-|
|R1|Each skill = one domain (`packages/graph-workflow/skills/` 14)|
|R2|Each graph = one domain (`packages/graph-scheduler/graphs/` 9)|
|R3|Each engine feature point = one domain (graph-scheduler module family, e.g. fsm / run-record / approval / gate / routing / constraints / channels / prologue)|
|R4|Domain index scope per Design Requirements (packages/-owned + necessary supporting domains)|

### Naming Conventions

- Domain ID = asset name, strictly matched, kebab-case, **prefix kept** (`atom-pilot` → domain `atom-pilot`; `arch-review-loop` → domain `arch-review-loop`).

### kind Classification (per Current State)

|kind|Meaning|Domain count|
|-|-|-|
|`skill`|Built-in skill domain|17|
|`graph`|Built-in graph domain|9|
|`engine-feature`|Engine feature-point domain|25|

### Status Tags

`active` (current) / `retired` (superseded or removed capability — keeps a row marked retired for trace) / `deprecated` (legacy — takes no row, annotation only). Legacy skills under root `skills/` (9 SKILL.md on disk) noted as a whole, not listed as index rows.

## Dependency Rules

- Inter-domain dependencies declared **one-way**, cycles forbidden.
- Layer alignment (clean-ddd-hexagonal dependency direction): `engine-feature` (infrastructure) → `graph` (orchestration) → `skill` (primitive) → pure primitive layer; `skill` domains do not depend on `engine-feature` implementation details.
- Entry skills depend on their dispatch/spec primitives (e.g. `atom-pilot` → `atom-phase-handler`; `atom-phase-handler` → `atom-kernel`) — reference relations are dependencies.
- Declare upstream/downstream when adding a domain; violation = documentation defect.
- **Upstream declaration rule**: the "Dependencies" column of each detail table declares downstream (whom this domain depends on); upstream (who depends on this domain) = mechanical reverse lookup of the Dependencies columns — scan the Dependencies column of every detail table; every row containing the target domain ID is its upstream. Dependency direction is queryable: downstream via the Dependencies column, upstream via reverse lookup, closed in both directions.

## Overview Table

|ID|kind|Section|Status|Subdomain|
|-|-|-|-|-|
|atom-atomic-step|skill|Skill domain — SUPERSEDED (ADR 0117/0120): Atomic Step Protocol chapter deleted, superseded by the High-Level Tool Registry (ADR 0119); standalone skill deleted|retired|retired|
|atom-kernel|skill|Skill domain|active|core|
|atom-pilot|skill|Skill domain|active|core|
|atom-phase-handler|skill|Skill domain|active|core|
|atom-scope-interview|skill|Skill domain|active|core|
|entry-skill-contract|skill|Skill domain|active|core|
|atom-mcp-contract|skill|Skill domain — SUPERSEDED (ADR 0120): merged into atom-kernel (HLT Registry + tool schemas + schema-first protocol); standalone skill deleted|retired|retired|
|atom-skill-spec|skill|Skill domain|active|core|
|atom-graph-spec|skill|Skill domain|active|core|
|atom-graph-design|skill|Skill domain|active|core|
|atom-graph-writer|skill|Skill domain|active|core|
|atom-doc-lifecycle|skill|Skill domain|active|supporting|
|atom-doc-maintain|skill|Skill domain|active|supporting|
|atom-domain-spec|skill|Skill domain|active|supporting|
|atom-spec-maintain|skill|Skill domain|active|supporting|
|atom-adr-maintain|skill|Skill domain|active|supporting|
|setup-atomic-workflow|skill|Skill domain|active|supporting|
|e2e-minimal|graph|Graph domain|active|core|
|arch-review|graph|Graph domain|active|core|
|arch-review-loop|graph|Graph domain|active|core|
|adopt-with-docs|graph|Graph domain|active|core|
|openspec-apply|graph|Graph domain|active|core|
|openspec-engineer|graph|Graph domain|active|core|
|spec-implement|graph|Graph domain|active|core|
|graph-generate|graph|Graph domain|active|core|
|estate-maintain|graph|Graph domain|active|core|
|scheduler-runtime|engine-feature|Engine-feature domain|active|core|
|fsm|engine-feature|Engine-feature domain|active|core|
|graph-definition|engine-feature|Engine-feature domain|active|core|
|graph-registry|engine-feature|Engine-feature domain|active|core|
|graph-generate-identity|engine-feature|Engine-feature domain|active|core|
|phase-handler|engine-feature|Engine-feature domain|active|core|
|approval|engine-feature|Engine-feature domain|active|core|
|auto-decision-rationale|engine-feature|Engine-feature domain|active|core|
|context-channels|engine-feature|Engine-feature domain|active|core|
|channels-context-model|engine-feature|Engine-feature domain|active|core|
|context-delivery-fidelity|engine-feature|Engine-feature domain — SUPERSEDED (ADR 0115) then retired (ADR 0121): machinery stays deleted; channel file consumption follows the HLT read chain|retired|retired|
|structural-channel-materialization|engine-feature|Engine-feature domain — RETIRED (ADR 0121): scheduler materialization (map headers/contextBytes) removed; HLT single standard — see tool-usage-contract, graph-mcp-api, atom-kernel|retired|retired|
|run-record|engine-feature|Engine-feature domain|active|core|
|graph-mcp-api|engine-feature|Engine-feature domain|active|core|
|activation-prologue|engine-feature|Engine-feature domain|active|core|
|constraint-layering|engine-feature|Engine-feature domain|active|core|
|branch-route-enforcement|engine-feature|Engine-feature domain|active|core|
|todo-lifecycle|engine-feature|Engine-feature domain — todo node-boundary lifecycle (per-node scratchpads, handler boundary clears, todo() spelling, graph todo-ignorant; usage agent-discretionary within boundary — projection retired per ADR 0122)|active|core|
|tool-usage-contract|engine-feature|Engine-feature domain — tool usage contract (deterministic triggers, class-based Tool usage check + violation markers, pilot stats, headroom three-state gate)|active|core|
|high-level-tool|engine-feature|Engine-feature domain — High-Level Tool Registry (ADR 0119/0123): closed tool set, two-tier structure (core classes serena single-tool no fallback / utility classes optional), entry anatomy (contract/chain/enforcement/tier), class-based verification|active|core|
|serena-single-engine|engine-feature|Engine-feature domain — serena single-engine execution (ADR 0123): core classes (locate/read/write/verify/run) chain length exactly 1, sole tool serena, zero fallback, unavailable → loud failure; intra-serena tiering (symbol LSP / FS all languages); run via platform shell (bash, rtk prefix) per the run chain (ADR 0125); register_edit conditional on jcodemunch use|active|core|
|omp-adapter|engine-feature|Engine-feature domain — OMP platform adapter prototype: HLT enforcement seam on the OMP extension surface (tool_call fail-closed gate, setActiveTools crop, lifecycle signals — dispatch arm / terminal disarm incl. agent_end fail-safe); prototype at .omp/|active|core|
|mutation-plane|engine-feature|Engine-feature domain — mutation + ground-truth plane (ADR 0128): serena sole engine for write/verify classes|active|core|
|query-plane|engine-feature|Engine-feature domain — query plane (ADR 0128): jcodemunch first-class for locate/search/analyze, read-only|active|core|
|atomic-step-flows|engine-feature|Engine-feature domain — atomic steps follow fixed cross-plane flows (ADR 0128): index → confirm → mutate → register → verify|active|core|

51 domains total (17 skill — 15 active + 2 retired — + 9 graph + 25 engine-feature — 23 active + 2 retired). Status: 47 active + 4 retired.

## Skill Domains (17 · 15 active + 2 retired)

|Domain ID|Description|Asset|Aggregate specs|Dependencies|Subdomain|
|-|-|-|-|-|-|
|atom-atomic-step|SUPERSEDED (ADR 0117/0120) — Atomic Step Protocol chapter deleted; superseded by the High-Level Tool Registry (ADR 0119, step = registered tool call); standalone skill deleted; spec removed with the ASP chapter (ADR 0120)|— (deleted)|— (spec removed)|atom-mcp-contract, atom-graph-spec (historical)||retired|
|atom-kernel|Platform primitives + sole reference skill — task()/approval()/interview()/judge() + High-Level Tool Registry (closed tool set, two-tier structure — core classes serena single-tool no fallback, utility classes optional; tool schemas for serena/jcodemunch/headroom/graph-scheduler; ADR 0119/0123) + todo() boundary-clear spelling (ADR 0112; projection retired ADR 0122) + graph tool detection|`packages/graph-workflow/skills/atom-kernel/SKILL.md`|`openspec/specs/atom-kernel/spec.md`|— (platform layer)||core|
|atom-pilot|Graph lifecycle management — execute→advance loop|`packages/graph-workflow/skills/atom-pilot/SKILL.md`|`openspec/specs/atom-pilot/spec.md`|atom-phase-handler, atom-kernel||core|
|atom-phase-handler|Central dispatch — main/approval/gate single-node routing|`packages/graph-workflow/skills/atom-phase-handler/SKILL.md`|`openspec/specs/atom-phase-handler/spec.md`|atom-kernel||core|
|atom-scope-interview|Parameterized entry procedure — caller-declared contract (Topics / Output fields / Behavior flags), zero reverse references, delegates to interview() consensus (ADR 0126)|`packages/graph-workflow/skills/atom-scope-interview/SKILL.md`|`openspec/specs/atom-scope-interview/spec.md`|atom-kernel||core|
|entry-skill-contract|Entry-skill callee contract pattern (ADR 0126) — task text is the parameter channel; behavior = f(declared parameters), never caller identity; packages/-only ownership boundary|Shared assets: `packages/graph-workflow/skills/atom-scope-interview/SKILL.md`, `packages/graph-workflow/skills/atom-graph-spec/SKILL.md` (§Entry-Skill Contract Declarations)|`openspec/specs/entry-skill-contract/spec.md`|atom-kernel||core|
|atom-mcp-contract|SUPERSEDED (ADR 0120) — merged into atom-kernel (HLT Registry + tool schemas + schema-first protocol); standalone skill deleted; spec retired via retire_capabilities|— (deleted)|— (spec retired)|—||retired|
|atom-skill-spec|SKILL.md format reference|`packages/graph-workflow/skills/atom-skill-spec/SKILL.md`|`openspec/specs/atom-skill-spec/spec.md`|—||core|
|atom-graph-spec|.taskflow.yaml format reference|`packages/graph-workflow/skills/atom-graph-spec/SKILL.md`|`openspec/specs/atom-graph-spec/spec.md`|—||core|
|atom-graph-design|Graph topology design entry skill — loads atom-graph-spec, designs phase list (dependsOn/when/channels); trigger: graph-generate spec phase|`packages/graph-workflow/skills/atom-graph-design/SKILL.md`|`openspec/specs/atom-graph-design/spec.md`|atom-graph-spec||core|
|atom-graph-writer|Graph YAML generation entry skill — loads atom-graph-spec, validates topology, writes `.taskflow.yaml`; trigger: graph-generate implement phase|`packages/graph-workflow/skills/atom-graph-writer/SKILL.md`|`openspec/specs/atom-graph-writer/spec.md`|atom-graph-spec||core|
|atom-doc-lifecycle|End-of-workflow closure deep module — close() contract (reverse-validated archive + ADR decision-fold + index rebuild)|`packages/graph-workflow/skills/atom-doc-lifecycle/SKILL.md`|`openspec/specs/atom-doc-lifecycle/spec.md`|—||supporting|
|atom-doc-maintain|Doc estate maintenance deep module — maintain() contract (trigger classification/doc classification/maintenance rules/consistency gate) + Format Reference|`packages/graph-workflow/skills/atom-doc-maintain/SKILL.md`|`openspec/specs/atom-doc-maintain/spec.md`|atom-domain-spec||supporting|
|atom-domain-spec|docs/domains.md format reference — DDD split principles per clean-ddd-hexagonal (bounded-context judgment + core/supporting/generic subdomain classification) + domain-modeling ubiquitous language; 10-100 count bound + kind layering; reverse-analysis provenance (asset→domain, no asset no domain, no forward design); evolution four-step; head-position Design Requirements constraint block (constraints.json equal standing) + linkage rule (spec/ADR only inside domain lists)|`packages/graph-workflow/skills/atom-domain-spec/SKILL.md`|`openspec/specs/atom-domain-spec/spec.md`|—||supporting|
|atom-spec-maintain|openspec/specs estate maintenance contract — reverse-analysis triple diff (actual capabilities ↔ domains.md ↔ spec dirs) → minimal change (delta specs only) → openspec-sync-specs → archive; spec dirs ↔ domain IDs 1:1|`packages/graph-workflow/skills/atom-spec-maintain/SKILL.md`|`openspec/specs/atom-spec-maintain/spec.md`|atom-domain-spec, atom-doc-maintain||supporting|
|atom-adr-maintain|ADR estate alignment contract — status verification vs decision reality; stale chains folded via atom-doc-lifecycle fold machinery; index rebuild; archive hygiene; dead citations repointed|`packages/graph-workflow/skills/atom-adr-maintain/SKILL.md`|`openspec/specs/atom-adr-maintain/spec.md`|atom-doc-lifecycle, atom-doc-maintain||supporting|
|setup-atomic-workflow|Project graph config initialization|`packages/graph-workflow/skills/setup-atomic-workflow/SKILL.md`|`openspec/specs/setup-atomic-workflow/spec.md`|—||supporting|

Domain spec: one per domain (47 registered; graph-generate carries the merged maker-journey requirements (former workflow-scenarios aggregate); retired atom-mcp-contract, atom-atomic-step, context-delivery-fidelity, structural-channel-materialization specs deleted with retirement; channel-tiers orphan retired with its three-tier content merged into channels-context-model; domains without an independent behavior contract register Purpose only).

## Graph Domains (9 · Status active)

|Domain ID|Description|Asset|Aggregate specs|Dependencies|Subdomain|
|-|-|-|-|-|-|
|e2e-minimal|Minimal main→approval loop demo|`packages/graph-scheduler/graphs/e2e-minimal.taskflow.yaml`|`openspec/specs/e2e-minimal/spec.md`|—||core|
|arch-review|Requirement production, standalone (scope-entry → arch-review report → review-accept)|`packages/graph-scheduler/graphs/arch-review.taskflow.yaml`; produces `docs/reports/`|`openspec/specs/arch-review/spec.md`|atom-scope-interview||core|
|arch-review-loop|Three-stage loop (requirement production → adopt → implement; single loop)|`packages/graph-scheduler/graphs/arch-review-loop.taskflow.yaml`; produces `docs/reports/`|`openspec/specs/arch-review-loop/spec.md`|arch-review, adopt-with-docs, spec-implement, atom-scope-interview||core|
|adopt-with-docs|Requirement adoption (adopt stage) + spec production: standalone raw-idea entry; composed → report input, record appended as dated appendix (standalone: grilling-derived `docs/adopt/<date>-<slug>.md`, never asked); ADR decision always user-confirmed; adopted requirements materialize as the OpenSpec change|`packages/graph-scheduler/graphs/adopt-with-docs.taskflow.yaml`; produces `docs/adopt/`|`openspec/specs/adopt-with-docs/spec.md`|atom-scope-interview||core|
|openspec-apply|Apply change → dual-axis review → bounded rework → plain archive (openspec-archive-change)|`packages/graph-scheduler/graphs/openspec-apply.taskflow.yaml`|`openspec/specs/openspec-apply/spec.md`|openspec-archive-change||core|
|openspec-engineer|Detailed implementation (spec synthesis→tickets→tdd→dual review→lifecycle closure)|`packages/graph-scheduler/graphs/openspec-engineer.taskflow.yaml`|`openspec/specs/openspec-engineer/spec.md`|atom-doc-lifecycle||core|
|spec-implement|Pure implementation of an existing change (extract→track gate→apply/engineer; no spec generation; tracks own post-archive closure)|`packages/graph-scheduler/graphs/spec-implement.taskflow.yaml`|`openspec/specs/spec-implement/spec.md`|openspec-apply, openspec-engineer||core|
|graph-generate|Graph production — the maker journey (name states the operation): concrete 7-phase graph (entry → spec → spec-accept → implement → review → gate → accept); single kind (graph), single operation (create); entry confirms graph name + topology scope + save location (default `.graph-scheduler/graphs/`), no CONTEXT.md dependency; implement writes `.taskflow.yaml` + registry entry + attached doc (`.graph-scheduler/docs/<name>.md`); no skill co-production|`packages/graph-scheduler/graphs/graph-generate.taskflow.yaml`; produces `.graph-scheduler/graphs/`, `.graph-scheduler/docs/`|`openspec/specs/graph-generate/spec.md` (maker-journey requirements — merged from workflow-scenarios)|atom-scope-interview, atom-graph-spec||core|
|estate-maintain|Estate maintenance graph — entry (trigger classification: domain-change/skill-change/proactive + workstream selection) → domains-index (atom-doc-maintain) / specs-sync (atom-spec-maintain) / adr-align (atom-adr-maintain) → review (consistency gate + reverse-validation + read-only deployment-mirror check) → accept|`packages/graph-scheduler/graphs/estate-maintain.taskflow.yaml`|`openspec/specs/estate-maintain/spec.md`|atom-scope-interview, atom-doc-maintain, atom-spec-maintain, atom-adr-maintain, atom-domain-spec, atom-doc-lifecycle||core|

## Engine-Feature Domains (23 active · 2 retired)

|Domain ID|Description|Asset|Aggregate specs|Dependencies|Subdomain|
|-|-|-|-|-|-|
|scheduler-runtime|Runtime assembly (handler/FSM/persistence wiring)|`packages/graph-scheduler/src/scheduler-runtime.ts`|`openspec/specs/scheduler-runtime/spec.md`|fsm, graph-definition, graph-registry, phase-handler, run-record, graph-mcp-api, activation-prologue, constraint-layering||core|
|fsm|Pure-function state machine core (START/COMPLETE/JUMP/FORCE_END)|`packages/graph-scheduler/src/fsm/transition.ts`, `packages/graph-scheduler/src/fsm/events.ts`, `packages/graph-scheduler/src/fsm/effects.ts`, `packages/graph-scheduler/src/fsm/state-machine.ts`|`openspec/specs/fsm/spec.md`|— (pure functions, zero dependencies)||core|
|graph-definition|Graph definition loading/validation/flattening/topology/contract checks/routing semantics + data shapes (zod schemas + shared types)|`packages/graph-scheduler/src/graph-definition.ts`, `packages/graph-scheduler/src/flow-flatten.ts`, `packages/graph-scheduler/src/topology.ts`, `packages/graph-scheduler/src/types.ts`, `packages/graph-scheduler/src/schemas/phase.ts`, `packages/graph-scheduler/src/schemas/node-state.ts`, `packages/graph-scheduler/src/schemas/config.ts`, `packages/graph-scheduler/src/schemas/index.ts`, `packages/graph-scheduler/src/schemas/registry-entry.ts`, `packages/graph-scheduler/src/schemas/taskflow.ts`, `packages/graph-scheduler/src/schemas/effect-wrapper.ts`|`openspec/specs/graph-definition/spec.md`|graph-registry, context-channels||core|
|graph-registry|Multi-registry merging (built-in + project)|`packages/graph-scheduler/src/registry-loader.ts`|`openspec/specs/graph-registry/spec.md`|—||core|
|graph-generate-identity|Maker-graph identity — graph name states the operation, top-level `description`, registry project-first precedence with `resolvedFrom`, load-probe validation, runId-scoped outputs|`packages/graph-scheduler/src/registry-loader.ts` (project-first shadowing), `packages/graph-scheduler/src/graph-loader.ts` (resolvedFrom/resolvedPath/description), `packages/graph-scheduler/src/api/crud.ts` (graph_start identity fields), `packages/graph-scheduler/src/scheduler-runtime.ts` (identity banner types)|`openspec/specs/graph-generate-identity/spec.md`|graph-registry, graph-mcp-api||core|
|phase-handler|Three handler types (main/approval/gate) + decision persistence|`packages/graph-scheduler/src/phase-handler/types.ts`, `packages/graph-scheduler/src/phase-handler/main-handler.ts`, `packages/graph-scheduler/src/phase-handler/approval-handler.ts`, `packages/graph-scheduler/src/phase-handler/gate-handler.ts`, `packages/graph-scheduler/src/phase-handler/index.ts`, `packages/graph-scheduler/src/phase-handler/errors.ts`|`openspec/specs/phase-handler/spec.md`|context-channels||core|
|approval|approval() decision primitive — the single mode-aware single-decision UI that absorbs question() (ADR 0133); card format rules + mode dispatch (manual card / auto with recommendation executes / auto no-recommendation card); implementation in phase-handler (approval-handler.ts) + atom-kernel (§approval() contract)|`openspec/specs/approval/spec.md`|phase-handler||core|
|auto-decision-rationale|Auto-approval decision rationale — `rationale` field persisted on the Run Mode auto path (observable output basis, F6); manual choices omit it|`packages/graph-scheduler/src/phase-handler/types.ts` (IApprovalDecision.rationale), `packages/graph-scheduler/src/phase-handler/approval-handler.ts` (auto path persistence)|`openspec/specs/auto-decision-rationale/spec.md`|phase-handler||core|
|context-channels|Context contract parsing + channel resolution|`packages/graph-scheduler/src/context/contracts.ts`, `packages/graph-scheduler/src/context/resolve-channels.ts`|`openspec/specs/context-channels/spec.md`|—||core|
|context-delivery-fidelity|RETIRED (ADR 0121) — machinery removed (0114 retained); channel file consumption follows the HLT read chain (atom-kernel Entry: read); judgment-domain verbatim invariant retained|—|— (spec deleted)|tool-usage-contract||retired|
|structural-channel-materialization|RETIRED (ADR 0121) — scheduler materialization (map headers/contextBytes) removed from code/tests/fields; HLT single standard|— (files deleted)|— (spec deleted)|tool-usage-contract, graph-mcp-api||retired|
|channels-context-model|Two-scope context model — global channel (`context:`, config default layer) + node channels (output streams, read edges, promotion); uniform phase channels; single judgment-domain formula|Shared assets — behavior spec of the channels feature point; implementation files owned by graph-definition / graph-mcp-api / constraint-layering (schemas, flow-flatten, snapshot, config.json)|`openspec/specs/channels-context-model/spec.md`|context-channels, graph-definition, phase-handler||core|
|run-record|Run record persistence (libsql) + snapshot reconstruction|`packages/graph-scheduler/src/lib/db/repository.ts`, `packages/graph-scheduler/src/lib/db/schema.ts`, `packages/graph-scheduler/src/lib/db/migration.ts`, `packages/graph-scheduler/src/lib/db/helpers.ts`, `packages/graph-scheduler/src/api/run-caches.ts`, `packages/graph-scheduler/src/api/fsm-reconstruct.ts`; produces `.taskflow/outputs/`|`openspec/specs/run-record/spec.md`|fsm||core|
|graph-mcp-api|9 MCP tools (CRUD/query/maintenance) + DTO + server process support|`packages/graph-scheduler/src/api/crud.ts`, `packages/graph-scheduler/src/api/snapshot.ts`, `packages/graph-scheduler/src/api/query.ts`, `packages/graph-scheduler/src/api/maintenance.ts`, `packages/graph-scheduler/src/api/graph-loader.ts`, `packages/graph-scheduler/src/runtime-start.ts`, `packages/graph-scheduler/src/debug.ts`, `packages/graph-scheduler/src/filesystem.ts`|`openspec/specs/graph-mcp-api/spec.md`|run-record, graph-definition, fsm||core|
|activation-prologue|Prologue node (run-mode confirmation + constraints loading)|`packages/graph-scheduler/src/prologue.ts`|`openspec/specs/activation-prologue/spec.md`|constraint-layering||core|
|constraint-layering|Three-layer constraint system (global/instructions/standards) + injection + validation|`.graph-scheduler/constraints.md`, `.graph-scheduler/config.json`|`openspec/specs/constraint-layering/spec.md`|—||core|
|branch-route-enforcement|Branch-route activation engine enforcement — a branch-route approval decision must not rely on caller re-transmission; a missed branchTo fails loudly (InvalidStateTransitionError), never drains silently|`packages/graph-scheduler/src/fsm/transition.ts` (branch-route enforcement)|`openspec/specs/branch-route-enforcement/spec.md`|fsm||core|
|todo-lifecycle|Todo node-boundary lifecycle — platform todo lists are per-node execution scratchpads; handler clears at dispatch/completion (unconditional, all node types); todo() kernel spelling (clear-only, no-todo platform no-op); graph stays todo-ignorant; usage agent-discretionary within the boundary (projection contract retired per ADR 0122)|Shared assets — behavior spec of the todo-boundary feature point; implementation in atom-phase-handler (§Todo Lifecycle) + atom-kernel (todo() spelling)|`openspec/specs/todo-lifecycle/spec.md`|atom-phase-handler, atom-kernel||core|
|tool-usage-contract|Tool usage contract — deterministic triggers (8KB output → headroom_compress; register_edit while jcodemunch in use; serena-only core tiers per HLT Registry); class-based Tool usage check (per declared class, auto violation markers, missing block = all-class violation); pilot tools stats; headroom three-state health gate|Shared assets — behavior spec of the tool-usage feature point; implementation in atom-kernel (§HLT Registry) + atom-phase-handler (§Tool Usage Check — class-based) + atom-pilot (Tools stats)|`openspec/specs/tool-usage-contract/spec.md`|atom-kernel, atom-phase-handler, atom-pilot||core|
|high-level-tool|High-Level Tool Registry (ADR 0119/0123) — two-tier structure: core classes (locate/read/write/verify/run) chain length exactly 1, sole tool serena, zero fallback; utility classes (compress/review/archive/graph-ops/register_edit) optional with use cases + n/a rules; entry anatomy (contract: I/O + verify + conditional index obligations; chain: intra-serena tiering; enforcement: per-platform views, deferred; tier marker); step = registered tool call `{ intent, tool, args, bound }` (legacy 8-field shape rejected); phase `operations:` + skill `Operation classes` feed handler injection + class-based verification|Shared assets — behavior spec of the HLT feature point; implementation in atom-kernel (§HLT Registry + §Tool Schemas) + atom-graph-spec (operations field) + atom-skill-spec (Operation classes subsection) + atom-phase-handler (Registry Injection) + graph-scheduler (hlt-classes.ts, PhaseSchema)|`openspec/specs/high-level-tool/spec.md`|atom-kernel, atom-graph-spec, atom-skill-spec, atom-phase-handler||core|
|serena-single-engine|Serena single-engine execution (ADR 0123) — core-class contract: locate/read/write/verify/run chains length exactly 1, sole tool serena, zero fallback (unavailable → loud failure); intra-serena tiering (symbol LSP / FS all languages) closes the coverage gap inside one dependency; run via platform shell (`bash`, rtk prefix) per the run chain (ADR 0125); register_edit conditional on jcodemunch use|Shared assets — behavior spec of the serena-single-engine feature point; implementation in atom-kernel (§HLT Registry core entries + §Tool Schemas) + .graph-scheduler/constraints.md (rule 8)|`openspec/specs/serena-single-engine/spec.md`|high-level-tool, tool-usage-contract, atom-kernel||core|
|omp-adapter|OMP platform adapter prototype — HLT enforcement seam on the OMP extension surface: tool_call fail-closed gate + setActiveTools crop + lifecycle signals (dispatch carriers arm; approval/gate/null + force_end + agent_end disarm — restriction lifecycle ⊆ driving run lifecycle); subagent-delegation boundary recorded (platform hooks main-agent-scoped); xd:// device-partition classification|`.omp/extensions/hlt-policy.ts`, `.omp/extensions/hlt-policy.test.ts`|`openspec/specs/omp-adapter/spec.md`|serena-single-engine, high-level-tool, atom-kernel||core|
|mutation-plane|Mutation + ground-truth plane — serena sole engine for write/verify classes in the HLT registry (ADR 0128); LSP-accurate semantics, safety-guarded editing, diagnostics-backed verification|Shared assets — behavior spec of the two-plane feature point; implementation owned by high-level-tool / serena-single-engine|`openspec/specs/mutation-plane/spec.md`|high-level-tool, serena-single-engine||core|
|query-plane|Query plane — jcodemunch first-class engine for locate/search/analyze in the HLT registry (ADR 0128); read-only by charter; results carry confidence/freshness metadata|Shared assets — behavior spec of the two-plane feature point; implementation owned by high-level-tool|`openspec/specs/query-plane/spec.md`|high-level-tool||core|
|atomic-step-flows|Atomic steps follow fixed cross-plane flows (ADR 0128) — every atomic operation (query/read/create/delete/edit/verify/review) follows a fixed cross-plane tool sequence: index → confirm → mutate → register → verify; predictable and auditable execution|Shared assets — behavior spec of the cross-plane flow feature point; implementation owned by high-level-tool / serena-single-engine|`openspec/specs/atomic-step-flows/spec.md`|high-level-tool, serena-single-engine||core|

## Asset Reverse Mapping (Asset → Domain)

|Asset|Domain|
|-|-|
|`packages/graph-workflow/skills/<name>/SKILL.md` (14)|Same-named skill domain|
|`packages/graph-scheduler/graphs/<name>.taskflow.yaml` (9) + `registry.json`|Same-named graph domain; registry.json additionally noted under graph-registry|
|`packages/graph-scheduler/src/fsm/` (4 files), `packages/graph-scheduler/src/topology.ts`, `packages/graph-scheduler/src/flow-flatten.ts`, `packages/graph-scheduler/src/graph-definition.ts`, `packages/graph-scheduler/src/types.ts`, `packages/graph-scheduler/src/schemas/` (7 files), `packages/graph-scheduler/src/context/` (3 files), `packages/graph-scheduler/src/phase-handler/` (6 files), `packages/graph-scheduler/src/lib/db/` (4 files), `packages/graph-scheduler/src/api/` (7 files), `packages/graph-scheduler/src/prologue.ts`, `packages/graph-scheduler/src/registry-loader.ts`, `packages/graph-scheduler/src/scheduler-runtime.ts`, `packages/graph-scheduler/src/runtime-start.ts`, `packages/graph-scheduler/src/debug.ts`, `packages/graph-scheduler/src/filesystem.ts`|Corresponding engine-feature domain (see detail tables)|
|`docs/domains.md`|governance asset — no domain row (index format governed by atom-domain-spec, maintenance by atom-doc-maintain)|
|`README.md` (root), `CHANGELOG.md` (root), `docs/README.zh-CN.md`, `docs/CHANGELOG.zh-CN.md`, `docs/readme-blueprint.md`, `docs/glossary.md`, `docs/workflow.md`, `docs/philosophy.md`, `docs/design.md`, `docs/conventions.md`, `docs/requirements.md`, `docs/feedback.md`, `docs/constraints.md`, `docs/core-requirements.md`, `docs/specs/` (27 files), `docs/platform/` (README.md + 10 subdirectories), `docs/dev/`, `docs/designs/`, `docs/grill/`, `docs/tickets/`, `docs/agents/` (4 files)|governance assets — no domain row|
|`docs/adr/`|governance assets — no domain row (lifecycle per atom-doc-lifecycle / atom-adr-maintain)|
|`standards/`|governance assets — no domain row (rules carried by CODING-STANDARDS files + constraints channel)|
|`docs/reports/`|arch-review / arch-review-loop (artifacts)|
|`docs/adopt/`|adopt-with-docs (artifacts)|
|`.taskflow/outputs/`|run-record / phase-handler (runtime artifacts)|
|Root `skills/` (9 SKILL.md, retired; 17 historical directories)|Takes no row — noted as a whole as retired|

**Completeness rule**: every asset maps to exactly one domain (or explicitly noted as shared/artifact); every domain has at least one asset; any asset without a domain = documentation defect. Domain IDs strictly match asset names; asset paths written in full path form so validation is mechanical.

## Evolution Rules

Add/modify/delete a domain follows a four-step process:

1. **Intent** — why the domain is needed (new asset? unclear boundary?)
2. **Boundary** — boundary against adjacent domains; kind classification
3. **Asset registration** — all assets into the mapping table, updated in both directions
4. **Naming de-duplication** — domain ID strictly matches asset name, globally unique

Companion: this file forbids building a `docs/domains/` directory tree; a new asset not registered = evolution violation.

## Linkages

- glossary "domain index" entry (docs/glossary.md) — defines this file's responsibility and boundary.
- CONTEXT.md Docs map — references this file.

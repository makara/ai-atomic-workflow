# atom-kernel Specification

## Purpose

Platform primitives — task()/approval()/interview()/todo() + graph tool detection (platform layer). Asset: `packages/graph-workflow/skills/atom-kernel/SKILL.md`.

## Requirements

### Requirement: task() — sub-agent dispatch

MODIFIED: the subgraph-delegation structured-output-package paragraph stays removed (no boundary batch, no structured output package — round-12 deletion stands). Node-level `task()` dispatch and the receipt contract (status + declared fields + output-location pointer(s) + artifact references, compressed) remain unchanged. The agent-hints consumption note is restored: when dispatching sub-agents for a node, the executing agent SHALL prefer the agent types declared in the node's `## Agent hints` block (priority-ordered — first available wins), falling back to the platform default when the declared types are unavailable or the node declares none. The receipt contract carries no agent fact (Card 9 unchanged).

#### Scenario: Node-level task dispatch

- **WHEN** a main node dispatches platform sub-agents via task()
- **THEN** the dispatch SHALL follow the standard task() contract with a compact structured receipt
- **AND** the dispatch SHALL prefer agent types from the node's `## Agent hints` block (priority-ordered, first available wins) when present

#### Scenario: No subgraph batch surface

- **WHEN** a composed subgraph's members execute
- **THEN** they SHALL dispatch through the advance loop as peer nodes — no batch, no structured output package

#### Scenario: No hint — default applies

- **WHEN** a main node declares no `agent` hints
- **THEN** the dispatch SHALL use the platform default agent type without warning

### Requirement: question() — single-decision UI

MODIFIED：approval() 保留为单形态决策 UI（卡片 + 推荐标记 + 自定义输入），移除 mode 维度。question() 吸收史保留（ADR 0133 历史），运行语义中无 mode 分发。main 分支路由场景：`routingActions`（continue|retry|jump）映射为卡片选项，选择结果经 branchTo 驱动路由/节点激活。auto-mode 场景名保留为历史标记（run mode 已移除，ADR 0215），场景体确认无 auto 执行路径。

#### Scenario: question presents single decision

- **WHEN** `approval({ header, options, custom: true })` 被调用
- **THEN** 用户 SHALL 看到决策卡（header 为主题，options 为选项）——无 mode 条件

#### Scenario: Eight format rules enforced

- **WHEN** `approval()` 呈现卡片
- **THEN** 8 条格式规则生效（header 名词短语 ≤30 字符等）——无 mode 相关规则

#### Scenario: Auto mode executes the recommendation

- **WHEN** approval() 被调用（run mode 已移除）
- **THEN** 无 auto 执行路径——推荐仅标记为默认选项，卡片恒呈现，用户选择返回

#### Scenario: Auto mode without recommendation presents a card

- **WHEN** approval() 被调用（run mode 已移除）
- **THEN** 卡片恒呈现——不存在"auto 无推荐"条件分支，任何上下文均呈现卡片

#### Scenario: Custom input carries free-text semantics

- **WHEN** 用户经 `custom: true` 提供自由文本
- **THEN** 输入 SHALL 记录为决策的 `note`

#### Scenario: Decision Card maps to question fields

- **WHEN** main 节点声明 routing actions
- **THEN** `topic` SHALL 映射到 `header`；`routingActions` 映射到选项

#### Scenario: Branch-route options from main routingActions

- **WHEN** main 节点声明 routing.actions
- **THEN** 卡片选项 = routingActions（continue|retry|jump）；选中 continue 分支 → branchTo 激活路由/节点；选中 retry/jump → graph_jump

### Requirement: interview() — multi-turn consensus

MODIFIED: interview() 契约不变（participation 显式、卡片恒呈现、永不自动跳过）。作为 R2 决策权威的 main 节点内联确认载体。direct-end 条款改为**内容状态相关**: 门控内容为空（nothing to adopt / accept / confirm / review）时，最终确认卡 SHALL 呈现「无内容可采纳（推荐）」与「结束本轮（direct end）」两选项; 门控内容非空时，最终确认卡 SHALL 以采纳/确认动作为推荐选项、声明的 direct-end label 为备选 — 「无内容可采纳」措辞 SHALL NOT 在内容非空时出现。任一 direct-end 选项（无内容可采纳 或 label）被选择 SHALL 直接结束本轮（节点报告 `direct_end: true` → pilot 以 `end` 决策推进 `graph_advance` — run 经自然排空完成（`completed`），绝不调用 `graph_force_end`、绝不正常继续循环）; direct-end 是最终卡上的附加选项，永不替代强制轮次。

#### Scenario: interview conducts multi-turn consensus

- **WHEN** agent 实现 `interview({ goal, context, participation })`
- **THEN** 目标主题的每个方面 SHALL 被覆盖——全面覆盖，无跳过维度

#### Scenario: Interview turn cards in auto mode

- **WHEN** 一个 interview 轮次呈现
- **THEN** 卡片 SHALL 出现——无推荐，轮次永不自动跳过

#### Scenario: Recommendation drives each question

- **WHEN** agent 呈现决策问题
- **THEN** 推荐答案 SHALL 为第一选项

#### Scenario: Fact lookup avoids unnecessary questions

- **WHEN** 事实可从环境发现（文件系统、工具、skills）
- **THEN** agent SHALL 查证——不问用户

#### Scenario: Goal consensus gate

- **WHEN** `interview()` 启动
- **THEN** agent SHALL 首先确认目标本身的共享理解

#### Scenario: Zero-question degradation

- **WHEN** interview() 以 `participation: "as-needed"` 调用且 context 已覆盖目标全部方面、无需澄清
- **THEN** `interview()` SHALL 直接返回共识（不问问题）

#### Scenario: Returns structured consensus

- **WHEN** interview 完成
- **THEN** 返回值 SHALL 为 `{ decisions: [{ decision, rationale }] }`

#### Scenario: Design flows compose research outside interview

- **WHEN** 调用者组合设计流（research → think → interview 确认轮次）
- **THEN** 流 SHALL 为：confirm(goal) → research → think → interview(confirmation) → 重复至接受

#### Scenario: Rejection re-thinks affected decisions

- **WHEN** 用户在某 interview 轮次拒绝设计决策
- **THEN** 调用者 SHALL 回到 think，修订设计，仅重新 interview 受影响的决策

#### Scenario: Caller assembles the design output

- **WHEN** 全部设计决策确认
- **THEN** 调用者 SHALL 组装设计输出——interview() 仅返回 `{ decisions }`

#### Scenario: Mandatory participation never zeroes out

- **WHEN** interview() 以 `participation: "mandatory"` 调用
- **THEN** 至少一轮问题 SHALL 出现——永不零问题降级

#### Scenario: Direct-end option ends the round

- **WHEN** 声明 direct-end 的 interview 走到最终确认卡 — 门控内容为空（「无内容可采纳（推荐）」+「结束本轮（direct end）」）或门控内容非空（采纳/确认动作推荐 + 声明的 label 备选）
- **THEN** 任一 direct-end 选项被选择 SHALL 记录 `direct_end: true`，pilot 以 `end` 决策推进 `graph_advance` — run 经自然排空完成（`completed`），绝不调用 `graph_force_end`、绝不正常 advance

#### Scenario: Direct end never replaces a mandatory turn

- **WHEN** interview() 以 `participation: "mandatory"` 调用且声明 direct-end
- **THEN** direct-end 选项 SHALL 仅为最终卡上的附加选择——强制轮次照常进行

#### Scenario: Non-empty content card recommends the adoption action

- **WHEN** 声明 direct-end 的 interview 门控内容非空（如刚确认的 scope/idea_goal）
- **THEN** 最终确认卡 SHALL 以采纳/确认动作为推荐选项、声明的 direct-end label 为备选
- **THEN** 「无内容可采纳」措辞 SHALL NOT 出现在卡上
- **THEN** 选择 label SHALL 直接结束本轮; 选择采纳动作 SHALL 正常推进

### Requirement: Primitives triangle — layered composition

The primitives SHALL form a layered dependency where each level builds on the one below. `approval()` is the atomic unit; `interview()` composes multiple `approval()` calls as the confirmation contract. There SHALL be exactly one conversation contract (`interview()`) in the kernel — grilling is an upstream exploration skill, referenced but never described with interview vocabulary, and never receiving interview-only semantics (participation flags, zero-question). No `solve()` contract exists — no `solve()` references in skill documents or graph task texts (grep-verifiable zero residue).

#### Scenario: Each level composes the level below

- **WHEN** a confirmation conversation runs
- **THEN** each turn SHALL go through `approval()` — interview composes approval, never bypasses it
- **THEN** grilling (upstream exploration skill) SHALL be referenced with its own vocabulary — frontier/rounds/decisions — and SHALL NOT inherit interview-only semantics

#### Scenario: No solve() residue in consumers

- **WHEN** skill documents and graph task texts are scanned for `solve()`
- **THEN** zero references SHALL remain — the solve mode is retired as a contract mode

#### Scenario: Kernel body contains no upstream skill mentions in interview contract

- **WHEN** the interview contract references exploration conversations
- **THEN** the kernel SHALL NOT describe grilling with interview vocabulary or interview-only semantics — grilling is an upstream skill outside the kernel contract surface

### Requirement: atom-kernel SHALL NOT declare loading writing-great-skills

atom-kernel is a runtime-primitives reference skill (platform spellings, graph-scheduler tool detection, task/approval/interview contracts). It SHALL NOT declare loading skill `writing-great-skills` — an authoring-format skill with no content dependency on the kernel. The runtime-constraints header SHALL carry at most the `**Layer**` declaration; loading declarations SHALL be limited to skills the kernel body actually consumes. (judge() removed from the contract list — gate type removed, ADR 0216.)

#### Scenario: Kernel runtime constraints contain no authoring skill

- **WHEN** reading atom-kernel's runtime-constraints header
- **THEN** no authoring-format skill (writing-great-skills) appears in the loading declarations

### Requirement: atom-kernel SHALL keep conditional research loading

A design flow composing research before interview() confirmation rounds SHALL load skill `research` before the think step. This conditional loading declaration SHALL remain in atom-kernel (solve mode retired as a contract mode — research is caller flow composition, ADR 0154).

#### Scenario: Design flow research loads research skill

- **WHEN** a caller composes a design flow (research → think → interview confirmation rounds)
- **THEN** the caller SHALL load skill `research` before reasoning about the solution

### Requirement: interview() section SHALL NOT carry upstream descriptive references

The interview() behavior-contract section SHALL NOT list upstream skills (grilling, adopt-with-docs, domain-modeling) as references or loading declarations. The contract SHALL stand alone; upstream provenance notes are not part of the kernel's dependency surface.

#### Scenario: Kernel body contains no upstream skill mentions in interview contract

- **WHEN** the kernel's interview contract section is scanned
- **THEN** it contains no references to grilling, adopt-with-docs, or domain-modeling

### Requirement: Spelling table SHALL include the opencode platform row

atom-kernel §Platform Spellings SHALL carry an opencode row covering the primitives that exist: `task()` maps to the Task tool with agent vocabulary `build`/`plan`/`general`/`explore`/`scout` and platform default `general`; `approval()` maps to the platform's decision-UI primitive. The row SHALL NOT list `judge()` (removed with the gate type) and SHALL name the platform's default agent type for hint fallback.

#### Scenario: opencode row present

- **WHEN** a reader loads atom-kernel §Platform Spellings
- **THEN** a row for opencode SHALL list the Task-tool mapping, the five built-in agent names, and default agent `general`

#### Scenario: New platform follows the row pattern

- **WHEN** another platform is added later
- **THEN** the single-row extension point (per ADR 0080) SHALL suffice — one new table row, no skill changes

### Requirement: Agent-hint availability SHALL be judged against the spellings-table vocabulary

MODIFIED: the agent-hints consumption surface is restored — the phase `agent` field exists again on peer-level main phases and `## Agent hints:` blocks are injected at dispatch when `node.agent` is present. Node-level sub-agent dispatch SHALL prefer the hinted agent types (priority-ordered — first available wins), falling back to the platform default or the agent type named in the node's task text. Composing (use) phases never carry `agent` (schema-enforced).

#### Scenario: Agent-hint injection restored

- **WHEN** a dispatched main node's NodeDetail carries `agent`
- **THEN** a `## Agent hints:` block SHALL be assembled (priority-ordered — first available wins)
- **AND** the executing agent SHALL prefer those types when dispatching sub-agents via task()

### Requirement: Platform default fallback SHALL resolve from the spellings table

A skill dispatching sub-agents with no available hint SHALL fall back to the platform default agent type as defined in atom-kernel §Platform Spellings (OMP: `task`; opencode: `general`) — never a hardcoded single name.

#### Scenario: No available hint on opencode

- **WHEN** a skill dispatches with hints `[reviewer, task]` on the opencode platform (neither available)
- **THEN** the skill SHALL use the opencode platform default `general`
- **AND** dispatch SHALL NOT fail for want of an agent type

#### Scenario: No hints declared

- **WHEN** a main phase declares no `agent` field
- **THEN** skills dispatching sub-agents SHALL use the current platform's default agent type from the spellings table

### Requirement: Tool detection SHALL live in atom-kernel

MODIFIED: the graph-scheduler MCP tool-name detection SHALL be the exact-name set — `graph_start` / `graph_advance` / `graph_status` / `graph_list` / `graph_assets` / `graph_force_end` / `graph_jump` / `graph_init` / `graph_clean_completed` / `graph_clean_all` — never substring matching. The detection block SHALL be inlined in atom-kernel — the platform-primitive layer, available to every graph-execution entry point (users are not required to run atom-pilot) — and SHALL contain only the exact-name list (return shapes single-sited in atom-pilot §MCP Tool Reference). The standalone `atom-tool-detection` skill SHALL NOT exist; atom-pilot and atom-phase-handler SHALL reference atom-kernel (already loaded as platform primitive). The substring-matching wording SHALL NOT appear anywhere in the skill family.

#### Scenario: Kernel detects tools inline

- **WHEN** any graph-execution entry point needs graph-scheduler tool names
- **THEN** it SHALL apply the exact-name detection list from atom-kernel's body
- **AND** no `atom-tool-detection` reference SHALL exist anywhere
- **AND** no substring-matching rule SHALL be stated in any skill body

### Requirement: atom-kernel SHALL drop the 4-Field Contract

atom-kernel's `task()` documentation SHALL NOT contain the 4-Field Contract table (target-skill/auxiliary-skills/target-skill-input/input-paths), Construct Rules, or Routing Modes — no dispatch consumer embeds them. It SHALL keep the `task()` signature, the Agent Hints selection rule, and the Decision Request output format (consumed by graph review nodes).

#### Scenario: Kernel documents live dispatch only

- **WHEN** a reader loads atom-kernel
- **THEN** the task() section SHALL cover signature, hints selection, Decision Request
- **AND** no 4-Field Contract table SHALL exist

### Requirement: todo() — platform-scoped todo lifecycle primitive

atom-kernel §Platform Spellings SHALL include a `todo()` primitive row defining clear semantics: the executing agent's platform todo list is cleared via the platform's native mechanism (oh-my-pi `todo` op `rm`; opencode `todo` op `rm`; RPC `set_todos []`); platforms without a todo tool map to a no-op. The spelling row SHALL cover the clear operation only — node-internal create/update usage stays native platform tooling. Skills SHALL reference the `todo()` contract, never a platform spelling.

#### Scenario: Clear semantics mapped per platform

- **WHEN** a skill or handler needs to clear the platform todo at a node boundary
- **THEN** it SHALL invoke the `todo()` clear contract
- **AND** the spelling table SHALL resolve it to the platform's native clear mechanism

#### Scenario: No-todo platform is a no-op

- **WHEN** the current platform exposes no todo tool
- **THEN** the `todo()` clear SHALL be a no-op with no error

#### Scenario: In-node usage stays native

- **WHEN** a node creates, updates, or completes todo items during its execution
- **THEN** it SHALL use the platform's native todo tooling directly
- **AND** the `todo()` spelling SHALL NOT be required for in-node operations

### Requirement: Atomic Step Protocol chapter removed

The `§Atomic Step Protocol` chapter and its residue (the tool-call definition inside the former §High-Level Tool Registry intro) SHALL be deleted from atom-kernel. No skill, channel, constraint, or test SHALL reference the chapter.

#### Scenario: No orphan reference

- **WHEN** the skills package is scanned for references to the Atomic Step Protocol chapter
- **THEN** no live inbound references exist (outside frozen ADR/spec history text)

### Requirement: atom-atomic-step skill removed

The standalone `atom-atomic-step` skill is deleted from the skills package; its content is superseded by atom-kernel tool discipline (ADR 0119 decision history lives in the ADR). No skill, channel, constraint, or test SHALL reference the deleted skill.

#### Scenario: No orphan reference

- **WHEN** the skills package is scanned for references to atom-atomic-step
- **THEN** no inbound references exist (outside frozen ADR/spec history text)

### Requirement: atom-mcp-contract skill removed

The standalone `atom-mcp-contract` skill is deleted from the skills package; its content (tool schema tables, schema-first protocol) lives in atom-kernel. The atom-phase-handler auxiliary-skills constant SHALL list exactly one reference skill — atom-kernel. No skill, channel, constraint, or test SHALL reference the deleted skill.

#### Scenario: No orphan reference

- **WHEN** the repository is scanned for references to atom-mcp-contract
- **THEN** no live inbound references exist (outside frozen ADR/spec history text)

#### Scenario: Single auxiliary reference

- **WHEN** any node of any graph is dispatched
- **THEN** the kernel reference content (primitives + tool schemas) is present in the injected context via the single auxiliary constant

### Requirement: Constraints and docs re-point

`.graph-scheduler/constraints.md` references atom-kernel for MCP tool usage and main-node execution; the built-in skill inventory SHALL be sourced from packages state (packages/graph-workflow/skills) with no atom-atomic-step or atom-mcp-contract entry, and the built-in skill count SHALL reflect the directory as-read. CONTEXT.md SHALL be the project glossary — glossary-only, no architecture-reference pointer to any external file.

#### Scenario: Constraint rule valid

- **WHEN** `.graph-scheduler/constraints.md` is scanned
- **THEN** it carries the MCP tool usage and main-node execution discipline reference (plain atom-kernel pointer — no §High-Level Tool Registry section exists to cite)

#### Scenario: CONTEXT.md accurate

- **WHEN** CONTEXT.md is read
- **THEN** it SHALL contain only glossary content per CONTEXT-FORMAT.md (`## Language` terms + `_Avoid_`), with no architecture-reference sections (Status/Architecture/Execution model/Constraints/Docs map)

#### Scenario: Technical overview accurate

- **WHEN** built-in skills are inventoried
- **THEN** the count reflects packages/graph-workflow/skills directory state
- **AND** atom-atomic-step and atom-mcp-contract are absent from the inventory
- **AND** no external docs file is read as the inventory source

### Requirement: ASP spec files removed

`docs/specs/2026-08-06-atomic-step-protocol.md` and `openspec/specs/atomic-step-protocol/` are removed; their decision history lives in this spec (owning module) and ADR 0119 (0116 archived). `openspec/specs/atom-mcp-contract/` is merged into this spec and removed.

#### Scenario: No ASP spec remains

- **WHEN** the docs/specs directory and openspec/specs directory are scanned for atomic-step-protocol or atom-mcp-contract spec files
- **THEN** no `2026-08-06-atomic-step-protocol.md`, no `atomic-step-protocol/` directory, and no `atom-mcp-contract/` directory exist

### Requirement: todo() spelling table carries the state machine

The atom-kernel §Platform Spellings table SHALL document the todo() state-machine semantics (pending/in_progress/completed + optional blocked/cancelled) and per-platform spellings: OMP `todo` tool ops (init/start/done/block/unblock/rm/append/view/drop), opencode `todowrite` full-array replacement, no-todo platform → no-op. In-node creation and updates SHALL use native platform tooling; the spelling table SHALL remain the sole cross-platform reference. The OMP op list SHALL cover the full tool surface the platform exposes — `append` (add items to an existing plan) and `drop` (discard an item) included.

#### Scenario: Spelling table maps both platforms

- **WHEN** a reader looks up the todo() spelling for a platform
- **THEN** the table SHALL give that platform's concrete tool/op form
- **AND** the table SHALL be the only place platform spellings appear in repo content

#### Scenario: OMP op list is complete

- **WHEN** a reader scans the OMP todo op list in the spelling table
- **THEN** it SHALL include `append` and `drop` alongside init/start/done/block/unblock/rm/view
- **AND** every op the platform actually exposes SHALL appear in the list

### Requirement: Tool-call contract schemas in atom-kernel

MODIFIED: atom-kernel SHALL document, for each mounted MCP server (serena, jcodemunch, graph-scheduler), the exact parameter contracts of its high-frequency tools: parameter names, required flags, value domains, semantics, and a canonical invocation example. Headroom SHALL be removed from the mounted-server list (the headroom MCP server is the graph-fidelity-context module's internal dependency, not a kernel-documented surface). It SHALL also define the schema-first protocol (parameter names never guessed; contract-missing tool → read full `xd://<tool>` docs before first call) and the failure-recovery chain (validation failure → read schema → repair → retry once → degrade per the registry chain).

#### Scenario: Contract exists for a high-frequency tool

- **WHEN** an agent needs to call `serena_replace_content`
- **THEN** the contract MUST specify `relative_path` (required), `needle` (required), `repl` (required), `mode` (`"literal" | "regex"`, required), and `allow_multiple_occurrences` (optional) with a canonical example

#### Scenario: Contract unknown for a tool

- **WHEN** an agent needs to call an MCP tool not covered by the contract
- **THEN** the schema-first protocol MUST require reading the full `xd://<tool>` docs before the first call, and MUST prohibit guessing parameter names

### Requirement: Index cache consistency after edits

After any file modification while jcodemunch is in use, the agent MUST call jcodemunch `register_edit` to invalidate stale index entries before later nodes rely on code-intelligence results. Executions not using jcodemunch report `n/a: jcodemunch not in use` — the obligation is conditional, never mandatory.

#### Scenario: File edited mid-run

- **WHEN** a node modifies a source file and the execution uses jcodemunch
- **THEN** `register_edit` is invoked for that file so subsequent symbol searches in later nodes return fresh results

#### Scenario: No jcodemunch use means n/a

- **WHEN** the execution does not use jcodemunch
- **THEN** the register_edit obligation SHALL be reported `n/a: jcodemunch not in use`
- **AND** no violation SHALL be recorded

### Requirement: Legacy mcp-* skills removed

MODIFIED: the legacy `skills/mcp-serena` and `skills/mcp-jcodemunch` MUST NOT exist; their capability is fully absorbed by atom-kernel tool schemas. `skills/mcp-headroom` is removed from the enumeration — no legacy headroom instruction skill is referenced anywhere.

#### Scenario: Legacy skills absent

- **WHEN** the repository is scanned for skills
- **THEN** no `mcp-*` skill directories exist under `skills/` (mcp-headroom never referenced)

### Requirement: Tool Schemas section lean

MODIFIED: the Tool Schemas section SHALL stay under ~280 lines; the kept high-use tables are serena / jcodemunch / graph-scheduler — the headroom table is removed from the kept set (7 tables, not 8). Tools with zero references in the skill set or graph flows SHALL NOT carry schema blocks — headroom is such a tool.

#### Scenario: dead schemas removed

Given the atom-kernel skill file When searching for get_symbol_source / check_references / plan_turn schema blocks Then no schema blocks exist for these three tools (chain mentions in Entry: locate permitted)

#### Scenario: graph-scheduler schema single-sourced

Given the atom-kernel skill file When searching for the graph-scheduler tool table Then the kernel carries only a pointer to atom-pilot §MCP Tool Reference and its own §Graph-Scheduler Tool Detection — no duplicated table or examples

#### Scenario: low-use serena tools compressed

Given the atom-kernel skill file When searching for find_declaration / find_implementations / find_file / list_dir / rename_symbol / insert_before_symbol / insert_after_symbol / safe_delete_symbol / create_text_file Then each carries a one-line signature and no param table (inline example permitted)

#### Scenario: no headroom schema block

- **WHEN** searching atom-kernel SKILL.md for a headroom schema block
- **THEN** no such block exists — the only headroom references in the repo live in the graph-fidelity-context module surface

### Requirement: Hot rules stay in SKILL.md

atom-kernel SKILL.md SHALL retain every-dispatch operational rules (serena-sole mutation plane, evidence-loop bound, protocol obligations, approval() contract) in the body; cold reference tables (platform spellings, todo() contract, registry detail) SHALL live in siblings behind pointers. Verbatim duplication between SKILL.md and siblings SHALL NOT exist — each fact has one home. (judge() removed from the cold-table list — gate type removed, ADR 0216.)

#### Scenario: Hot rules present

- **WHEN** reading atom-kernel SKILL.md
- **THEN** the serena-sole rule, evidence-loop bound, and protocol obligations appear in the body

#### Scenario: No verbatim duplication

- **WHEN** searching atom-kernel SKILL.md and its siblings for identical sentences
- **THEN** zero verbatim duplicates — the same fact appears in exactly one file

#### Scenario: Reference band met

- **WHEN** measuring atom-kernel SKILL.md body (frontmatter-stripped)
- **THEN** <=1,400 words (platform-primitive reference band per atom-skill-spec Raised Length Bands)

### Requirement: Decision shape delegated to handler schema

The decision record shape consumed by graph execution (IApprovalDecision incl. rationale) SHALL be defined once in atom-phase-handler NODE-SCHEMA.md; atom-kernel approval() references it instead of declaring a parallel shape.

#### Scenario: Decision shape single-sourced

- **WHEN** the decision record gains or loses a field
- **THEN** only atom-phase-handler NODE-SCHEMA.md is edited; kernel approval() wording references it

### Requirement: Approval card format rules single home

The 8 card format rules SHALL live once in APPROVAL-CARDS.md; card content mapping lives in atom-phase-handler DECISION-CARDS.md; neither file restates the other's content.

#### Scenario: Format vs content separation

- **WHEN** a card format rule changes
- **THEN** only APPROVAL-CARDS.md is edited; DECISION-CARDS.md content mapping is untouched

### Requirement: Approval Decision Shape Single Home

The IApprovalDecision shape and its card-selection mapping SHALL have exactly one authoritative definition site: atom-kernel/APPROVAL-CARDS.md (the card-format sibling). Consumer files (atom-phase-handler NODE-SCHEMA.md, DECISION-CARDS.md, atom-pilot SKILL.md) SHALL reference it by name and pointer, never restate the field list or JSON shapes.

#### Scenario: Shape home is APPROVAL-CARDS.md

- **WHEN** an agent needs the decision shape (fields, JSON forms)
- **THEN** the single home is atom-kernel/APPROVAL-CARDS.md
- **AND** the two legacy renderings (APPROVAL-CARDS `{label?, value?, note?, custom?}` vs NODE-SCHEMA `{action, target?, note?, rationale?, label?, value?}`) SHALL be reconciled in one mapping table at that home

#### Scenario: Consumers pointerize

- **WHEN** scanning NODE-SCHEMA.md, DECISION-CARDS.md, or atom-pilot SKILL.md for IApprovalDecision field definitions
- **THEN** each SHALL carry only a `per APPROVAL-CARDS.md §<section>` pointer — no restated field lists

### Requirement: Graph-Scheduler Output Sink Qualifier

atom-kernel §graph-scheduler SHALL state the output-sink rule with the main-node qualifier: node output stays in the agent session and is never passed to graph_advance, EXCEPT the decision output (IApprovalDecision) which the pilot parses and routes. The approval/gate exception wording is removed (those node types are deleted, ADR 0215/0216). The blanket "never passed" phrasing SHALL NOT appear without the exception.

#### Scenario: Qualified rule present

- **WHEN** reading atom-kernel §graph-scheduler
- **THEN** the output rule names the main-node default and the decision-output exception (matching atom-pilot §Loop Mechanics)

### Requirement: Platform-Primitive Band Compliance

atom-kernel SKILL.md body SHALL stay within the platform-primitive band <=1,400 words (fence-inclusive, frontmatter-stripped). (HLT-REGISTRY references removed — the file is deleted, ADR 0194; judge()/Mode Selection references removed with the gate type and run mode.) The hot surface (approval()/task()/interview() rules + todo() contract) SHALL remain in SKILL.md (non-transferable per Hot-content Non-Transferability).

#### Scenario: Body in band

- **WHEN** measuring atom-kernel SKILL.md body (fence-inclusive, frontmatter-stripped)
- **THEN** <=1,400 words

#### Scenario: Interview semantics in the kernel body

- **WHEN** locating interview() mechanics (rules, participation, turn mechanics)
- **THEN** they live in SKILL.md §interview() — no sibling file exists (INTERVIEW-DETAIL.md folded, ADR 0154)

#### Scenario: Description trimmed

- **WHEN** reading the skill's frontmatter description
- **THEN** it carries trigger phrases only (compact, no long enumerations)

### Requirement: Headroom and Register_Edit Single Homes

MODIFIED: the headroom compress contract SHALL NOT be stated in atom-kernel — its single home is the graph-fidelity-context module (openspec/specs/graph-fidelity-context/spec.md + packages/graph-fidelity-context/src/actions/compress.ts). atom-kernel §Tool Schemas SHALL carry no headroom section or schema block; zero headroom references exist in the kernel skill family. The register_edit post-edit obligation SHALL keep its single home in JCODEMUNCH-SCHEMAS §register_edit, unchanged.

#### Scenario: Headroom single-sited

- **WHEN** scanning atom-kernel SKILL.md and siblings for the headroom contract
- **THEN** zero references exist — the only headroom contract statement in the repo is the graph-fidelity-context module's own spec/skill/docs surface

#### Scenario: Register_edit single-sited

- **WHEN** scanning SKILL.md / siblings / JCODEMUNCH-SCHEMAS for the register_edit obligation
- **THEN** one full statement (JCODEMUNCH-SCHEMAS) — other sites carry pointers

### Requirement: Tool schemas retained as factual reference

The rewritten §Tool Schemas SHALL remain the single home of the serena / jcodemunch / graph-scheduler compact parameter tables, usable as pure reference by any skill — with zero discipline, adapter-rule, or obligation content attached. (judge() removed from the primitives scenario list — gate type removed, ADR 0216.)

#### Scenario: Schemas consulted for parameters

- **WHEN** a skill needs the exact parameter table of a serena / jcodemunch / graph-scheduler tool
- **THEN** it reads the retained §Tool Schemas tables — factual reference only

#### Scenario: No discipline content in schemas

- **WHEN** the schema tables are scanned for discipline content
- **THEN** no adapter rule, obligation, or core-requirement text is present

### Requirement: Tool discipline direct specification

The atom-kernel SKILL.md §Tool Discipline SHALL state the tool-discipline specification directly as must-follow entries: the scenario set {find, read, write, verify, run} with the per-scenario rule stated in-line (find — indexed query plane with ground-truth confirmation; read — promoted surfaces with pre-edit consultation; write — serena sole engine for in-project code with verify-after-write; verify — evidence-only over the prior write; run — platform shell with project command prefix), the index-freshness obligation (`mcp__jcodemunch_register_edit` after mutations on indexed targets), and the pre-execution interception switch default OFF with the two enabling criteria. The review scenario SHALL NOT appear as a tool-triggered scenario: review is role-triggered — graph review nodes carry their own review standards — and the section SHALL note this exclusion explicitly. The section SHALL state the rules as normative entries without a pointer to an external delivery module or registry contract.

#### Scenario: Discipline rules stated directly

- **WHEN** reading atom-kernel SKILL.md §Tool Discipline
- **THEN** the per-scenario rules and obligations are stated in the section itself as normative entries
- **AND** no pointer to an external delivery module or registry contract replaces the rules

#### Scenario: No HLT string in the skill

- **WHEN** scanning atom-kernel SKILL.md for the string "HLT"
- **THEN** no occurrence exists (including quoted references such as "not HLT" and comments)

#### Scenario: Kernel primitives unaffected

- **WHEN** reading the discipline section
- **THEN** task / judge / approval / interview / todo primitives are not presented as part of the tool set

#### Scenario: Review role-triggered exclusion

- **WHEN** reading the discipline section's scenario list
- **THEN** review is absent from the tool-triggered scenario set and the section notes that review standards are carried by graph review nodes, not by tool-result hints

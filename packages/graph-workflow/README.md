# graph-workflow

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](../../docs/readme-blueprint.md) instead.

Graph-driven work-order system for AI agents — explicit phases, scoped context, and non-bypassable approval gates.

The skill system that drives graph execution — 14 built-in skills.

graph-workflow is the agent-side half of Atomic Workflow. [graph-scheduler](../graph-scheduler/README.md) issues runtime work orders; these skills execute them. Each phase of a graph maps to a skill: the graph declares the skill in the phase definition, and the skill knows how to run that phase — the interview, the review, the write, the approval.

## How Skills Drive Graphs

The execution chain:

|Skill|Role|
|-|-|
|`atom-pilot`|Graph lifecycle manager — runs the execute → advance loop (`graph_start` → dispatch → `graph_advance`)|
|`atom-phase-handler`|Central dispatch — routes each node by its `type` (main/approval/gate base types). The single entry point for running graphs; consumes prologue outputs, injects `## Agent hints:` / `## Run Mode:` / `## Constraints` blocks|
|`atom-kernel`|Platform primitives — `task()` dispatch, `question()` decision UI, `interview()` consensus (single contract, consensus + solve modes), graph-scheduler tool detection (ADR 0059). Sole dispatch-primitive source|
|`atom-scope-interview`|Shared scope-confirmation interview for graph entry phases — search conversation, one-question-per-turn + solve mode, uniform `scope_complete` output contract; used by arch-review, arch-review-loop, openspec-create, plan-generate, doc-update, skill-author, graph-generate, grill-with-docs|
|Entry skills|One per graph domain — `atom-skill-writer` (skills), `atom-graph-design` (graph topology design), `atom-graph-writer` (graph YAML), `atom-doc-writer` (docs), `atom-openspec-archive` (change archival), `setup-atomic-workflow` (project setup); review / idea grilling / ADR judgment run via upstream `improve-codebase-architecture` / `grilling` / `domain-modeling` (direct use, no local wrappers)|
|Reference skills|Format specifications — `atom-graph-spec` (.taskflow.yaml), `atom-skill-spec` (SKILL.md), `atom-doc-spec` (markdown docs), `atom-mcp-contract` (exact parameter schemas for serena / jcodemunch / headroom / graph-scheduler; contract-missing tool → read full docs first)|

## Install

Two channels — pick one. **All 14 skills are required for graph execution.**

**Option A: Claude Code marketplace**

```bash
/marketplace install makara/ai-atomic-workflow
```

**Option B: skills.sh** (third-party CLI, 76+ agent platforms — OpenCode / Codex / Cursor etc.)

```bash
# Full install (14 graph-workflow skills + legacy skills)
npx skills add makara/ai-atomic-workflow

# graph-workflow only — 14 built-in skills (tree-subpath source, no marketplace.json dependency)
npx skills add https://github.com/makara/ai-atomic-workflow/tree/main/packages/graph-workflow/skills
```

Common flags (verified via `npx skills --help`): `-a <agent>` pick platform (`-a '*'` all), `-g` global install, `-y` non-interactive, `-l` preview without installing.

## Skill List

14 skills in `skills/`:

|Skill|What it does|
|-|-|
|**atom-pilot**|Graph lifecycle manager — execute → advance loop. Dispatch via `atom-phase-handler`; single entry point, routes by node type internally|
|**atom-phase-handler**|Central dispatch — `{ node, snapshot? }` schema, static dispatch (main/approval/gate base types), agent-hint injection|
|**atom-kernel**|Platform primitives — `task()` dispatch, `question()` (8 rules), `interview()` (single contract — consensus + solve modes), graph-scheduler tool detection. Sole dispatch-primitive source|
|**atom-scope-interview**|Shared scope-confirmation interview for graph entry phases — search conversation, interview() one-question-per-turn, solve mode until complete, uniform `scope_complete` output contract|
|**atom-skill-writer**|Entry skill for skill authoring — loads atom-skill-spec, writes or edits SKILL.md. Auto-detects create vs edit mode from scope-confirm output fields|
|**atom-graph-writer**|Entry skill for graph YAML generation — loads atom-graph-spec, validates topology, generates valid `.taskflow.yaml`|
|**atom-graph-design**|Entry skill for graph topology design — loads atom-graph-spec, analyzes requirements, designs the phase list with dependsOn/when/channels|
|**atom-doc-writer**|Entry skill for document editing — loads atom-doc-spec, modifies markdown documents in-place|
|**atom-openspec-archive**|Archive a completed OpenSpec change via `openspec archive` CLI — reverse-validates task completion against code evidence before archiving. Used as a graph phase post-approval (skill-change-workflow)|
|**setup-atomic-workflow**|Initialize graph-scheduler project config — setup `.graph-scheduler`, create config.json, scaffold constraints.md, verify existing layout. Replaces the retired `atom-graph-config` CLI|
|**atom-graph-spec**|Reference for the `.taskflow.yaml` format — PhaseSchema, topology, when guards, join modes, channels, approval/gate routing|
|**atom-skill-spec**|Reference for the SKILL.md format — frontmatter rules, body content rules, language constraints, reference boundaries|
|**atom-doc-spec**|Reference for the markdown document format — metadata block, heading hierarchy, link validity, document types (ADR, report)|
|**atom-mcp-contract**|MCP tool-call contract — exact parameter schemas for serena / jcodemunch / headroom / graph-scheduler tools; schema-first protocol, failure recovery chain; contract-missing tool → read full docs first|

## Development

```bash
cd packages/graph-workflow

npm install        # install dependencies
npm test           # run tests (vitest)
npm run typecheck  # type check
```

## Related Docs

- [Root README](../../README.md) — project overview and the typical usage path
- [graph-scheduler README](../graph-scheduler/README.md) — MCP tools, graph format, built-in graphs

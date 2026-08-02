# graph-workflow

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](../../docs/readme-blueprint.md) instead.

Graph-driven work-order system for AI agents — explicit phases, scoped context, and non-bypassable approval gates.

The skill system that drives graph execution — 13 built-in skills.

graph-workflow is the agent-side half of Atomic Workflow. [graph-scheduler](../graph-scheduler/README.md) issues runtime work orders; these skills execute them. Each phase of a graph maps to a skill: the graph declares the skill in the phase definition, and the skill knows how to run that phase — the interview, the review, the write, the approval.

## How Skills Drive Graphs

The execution chain:

|Skill|Role|
|-|-|
|`atom-pilot`|Graph lifecycle manager — runs the execute → advance loop (`graph_start` → dispatch → `graph_advance`)|
|`atom-phase-handler`|Central dispatch — routes each node by its `type` (main/approval base types). The single entry point for running graphs; injects `## Agent hints:` when a main phase declares them|
|`atom-kernel`|Platform primitives — `task()` dispatch, `question()` decision UI, `interview()` consensus, `solve()` goal-driven loop, graph-scheduler tool detection (ADR 0059). Sole dispatch-primitive source|
|`atom-scope-interview`|Shared scope-confirmation interview for graph entry phases — used by arch-review, arch-review-to-spec, openspec-create, plan-generate, skill-author, doc-update, graph-generate|
|Entry skills|One per graph domain — `atom-skill-writer` (skills), `atom-graph-design` (graph topology design), `atom-graph-writer` (graph YAML), `atom-doc-writer` (docs), `atom-openspec-archive` (change archival), `setup-atomic-workflow` (project setup); arch review/ADRs execute via upstream `improve-codebase-architecture` / `domain-modeling` (direct use, ADR 0057/0058)|
|Reference skills|Format specifications — `atom-graph-spec` (.taskflow.yaml), `atom-skill-spec` (SKILL.md), `atom-doc-spec` (markdown docs)|

## Install

Two channels — pick one. **All 13 skills are required for graph execution.**

**Option A: Claude Code marketplace**

```bash
/marketplace install makara/ai-atomic-workflow
```

**Option B: skills.sh** (third-party CLI, 76+ agent platforms — OpenCode / Codex / Cursor etc.)

```bash
# Full install (13 graph-workflow skills + legacy skills)
npx skills add makara/ai-atomic-workflow

# graph-workflow only — 13 built-in skills (tree-subpath source, no marketplace.json dependency)
npx skills add https://github.com/makara/ai-atomic-workflow/tree/main/packages/graph-workflow/skills
```

Common flags (verified via `npx skills --help`): `-a <agent>` pick platform (`-a '*'` all), `-g` global install, `-y` non-interactive, `-l` preview without installing.

## Skill List

13 skills in `skills/`:

|Skill|What it does|
|-|-|
|**atom-pilot**|Graph lifecycle manager — execute → advance loop. Dispatch via `atom-phase-handler`; single entry point, routes by node type internally|
|**atom-phase-handler**|Central dispatch — `{ node, snapshot? }` schema, static dispatch (main/approval base types), agent-hint injection|
|**atom-kernel**|Platform primitives — `task()` dispatch, `question()` (8 rules), `interview()` (consensus), `solve()` (goal-driven loop), graph-scheduler tool detection. Sole dispatch-primitive source|
|**atom-scope-interview**|Shared scope-confirmation interview for graph entry phases — search conversation, one-question-per-turn interview, uniform `scope_complete` output contract|
|**atom-skill-writer**|Entry skill for skill authoring — loads atom-skill-spec, writes or edits SKILL.md. Auto-detects create vs edit mode|
|**atom-graph-writer**|Entry skill for graph YAML generation — loads atom-graph-spec, validates topology, generates valid `.taskflow.yaml`|
|**atom-graph-design**|Entry skill for graph topology design — loads atom-graph-spec, analyzes requirements, designs the phase list with dependsOn/when/channels|
|**atom-doc-writer**|Entry skill for document editing — loads atom-doc-spec, modifies markdown documents in-place|
|**atom-openspec-archive**|Archive a completed OpenSpec change via `openspec archive` CLI — reverse-validates task completion against code evidence before archiving|
|**setup-atomic-workflow**|Initialize graph-scheduler project config — setup `.graph-scheduler`, create config.json, scaffold constraints.md. Replaces the retired `graph-config` CLI|
|**atom-graph-spec**|Reference for the `.taskflow.yaml` format — PhaseSchema, topology, when guards, join modes, channels, approval routing|
|**atom-skill-spec**|Reference for the SKILL.md format — frontmatter rules, body content rules, language constraints, reference boundaries|
|**atom-doc-spec**|Reference for the markdown document format — metadata block, heading hierarchy, link validity, document types (ADR, report)|

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
- [docs/technical-overview.md](../../docs/technical-overview.md) — graph execution model, phase types, when-guards, skill system

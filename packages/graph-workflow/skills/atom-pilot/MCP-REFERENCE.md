# MCP Tool Reference

Tool names detected at runtime per §Graph-Scheduler Tool Detection. Parameter schema:

|tool|purpose|key params|
|-|-|-|
|graph_start|create run, get first node + snapshot|graphName, args? (args.mode short-circuits $run-mode-confirm)|
|graph_advance|report result + get next node|runId, nodeId, durationMs, branchTo?, endRun?|
|graph_status|query run state|runId|
|graph_list|list all runs|-|
|graph_force_end|force end run|runId|
|graph_jump|jump to node|runId, targetPhaseId|
|graph_init|init graph config|-|
|graph_clean_completed|clean completed runs|before?|
|graph_clean_all|clean all runs|-|

`graph_start` returns `{ runId, node, snapshot, resolvedFrom, resolvedPath, description? }`. `graph_advance` / `graph_jump` return `{ snapshot, node }` - `node: null` = graph complete (`fsmState` `completed`). The snapshot (per-node states) accompanies every dispatch - jump navigation + progress display. Run mode comes from the `$run-mode-confirm` prologue output - no output scans, no echo scans, no backend field.

# Return Shapes

```
graph_start { graphName, args? } → { runId, node: NodeDetail | null, snapshot: GraphSnapshot, resolvedFrom: project|builtin|fallback, resolvedPath: string, description?: string }
```

Scheduler resolve graph name via merged registry - project entries override builtin (project-first). Return `runId` + first `node` (NodeDetail | null) + run `snapshot` (per-node states - jump navigation + progress display; the activation prefix nodes appear in `nodes` like any run member) + resolution identity (`resolvedFrom` + `resolvedPath` + graph `description`). Agent hold `runId` for all subsequent calls.

# Pilot Commands

|Command|MCP tool|
|-|-|
|invoke pilot with `<graph-name>`|`graph_start` -> pilot loop|
|Status check|`graph_status`|
|Force end|`graph_force_end`|
|Jump to node|`graph_jump` (operator command - approval retry/jump routing also uses it, see §Approval Decision Processing)|
|List history|`graph_list`|

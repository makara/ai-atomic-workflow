---
name: atom-tool-detection
description: Runtime MCP tool name detection rules for graph-scheduler — 9-tool substring matching. Use when needing to discover graph-scheduler MCP tool names at runtime, mentions tool detection, MCP tool lookup, graph-scheduler tool names.
argument-hint: none (reference skill)
user-invocable: false
version: 1.0.0
last_updated: '2026-07-29'
---

# Atom-Tool-Detection

Runtime MCP tool name detection — 9 graph-scheduler tool substring matching rules. Extracted from atom-pilot (ADR 0042) to break pilot ↔ handler circular dependency.

---

# Graph-Scheduler Tool Detection

Before any graph operation, scan available tool list for graph-scheduler MCP tools:

- Find tool with "graph_start" in name → record exact name
- Find tool with "graph_advance" in name → record exact name
- Find tool with "graph_status" in name → record exact name
- Find tool with "graph_list" in name → record exact name
- Find tool with "graph_force_end" in name → record exact name
- Find tool with "graph_jump" in name → record exact name
- Find tool with "graph_init" in name → record exact name
- Find tool with "graph_clean_completed" in name → record exact name
- Find tool with "graph_clean_all" in name → record exact name

Use detected names for all subsequent calls. Tool parameters and return values unchanged.

# interview() - Solve-Mode Detail

Cold branch of atom-kernel §interview() - reachable only when `research: true` or the goal produces a design/plan. SKILL.md carries rules 1-8 + §Mode Selection (hot, non-transferable); this file carries the solve-mode additions + internal flow.

## Solve-Mode Additions

9. **Research before think** - when `research: true` (default in solve mode), load skill `research`. Look up specs, patterns, constraints - do not skip, uninformed design wastes rounds.
10. **Think exhaustively** - design complete solution. Cover all dimensions: structure, naming, edges, guards, edge cases.
11. **Re-think on reject** - user rejects any decision -> return to think, revise design, re-interview affected decisions only - do not re-ask confirmed points.

**Internal Flow** - agent-internal loop, no graph-level retry/jump: confirm(goal) -> research -> think -> interview(details) per-round; rejection -> re-think, confirmation -> solution.

---
name: execute
description: Execution closed-loop skill — wraps implement with mandatory review and compress. After review, user chooses accept / rework / record TODO. Only accept and TODO trigger compress.
argument-hint: "[PRD path] [Issue path]"
user-invocable: true
disable-model-invocation: true
version: "1.0.0"
last_updated: "2026-07-09"
---

# Execute — Execution Closed Loop

> **Source**: Own skill (ai-atomic-workflow).
> **Constraint model**: Inherits `lang.conversation`, `lang.documents`, and `git.policy` from the orchestrate context. See `core/constraint-layers.md` §2.1–2.3.

## Core Philosophy

Execute is the execution loop for a single issue. It wraps the parent `implement` skill with a mandatory post-implementation review and compress cycle, replacing the parent skill's direct `code-review` → `commit` flow with a 3-axis review + user-decided closure.

Execute does NOT auto-advance through the 3-choice gate after review — the user explicitly decides (aligned with G1: user-driven workflow).

## Execution Loop

```
execute (per issue)
  ├── Step 1: implement    ← parent skill, implements based on PRD/issue
  ├── Step 2: review        ← own skill, 3-axis review (Standards + Spec + Best-practice) + scope annotation + rework routing
  └── Step 3: user 3-choice
       ├── Accept           → compress + [F4] completion signal + next-step suggestion
       ├── Rework           → return to Step 1 (no compress, no completion signal)
       └── Record TODO      → compress + debt record on disk + issue marked passed + [F4] completion signal
```

## Step 1: implement

Call the parent `implement` skill. This drives `/tdd` where possible at pre-agreed seams, runs typechecking and tests regularly, and produces the implementation output.

**Constraint propagation to implement**:
- `lang.conversation`: inherited from orchestrate context — determines the language of AI-user dialogue during implementation
- `lang.documents`: inherited from orchestrate context — determines the language of any documents produced during implementation
- `git.policy`: inherited from orchestrate context — if `not-allowed`, skip the parent skill's `commit` step; if `allowed`, proceed normally

> The parent `implement` skill internally calls `/code-review` (2-axis: Standards + Spec) as its final step. That 2-axis review is the parent's own review mechanism. Execute replaces it with our 3-axis `review` skill — Step 2 below overrides the parent's review.

## Step 2: review

Call the own `review` skill. This performs a 3-axis review:
- **Standards** (pass/fail): Does the code follow the repo's documented coding standards?
- **Spec** (pass/fail): Does the code match what the originating issue/PRD asked for?
- **Best-practice** (suggestions, not pass/fail): Code quality, architecture, performance, robustness, testability — 5 dimensions

The review report annotates each Best-practice finding with a scope level:
- **scope ≤ issue**: Fixable within the current issue scope
- **scope > issue**: Requires broader design/architecture change — needs new PRD

**Constraint propagation to review**:
- `lang.conversation`: inherited — determines review report language
- `lang.documents`: inherited — determines language of any review artifacts written to disk
- `git.policy`: inherited — determines whether review uses git-based diffs (`git diff`, `git log`) or file-based comparison

## User 3-Choice After Review

After review completes, present the structured report and ask the user to choose one path:

### 1. Accept

**When**: Standards PASS, Spec PASS, all Best-practice findings accepted as-is or dismissed.

**Action**:
- Execute compress (Step 3)
- Output [F4] completion signal with acceptance checklist
- Suggest next step: continue to the next issue, or trigger finalize if all issues complete

### 2. Rework

**When**: Standards FAIL, Spec FAIL, or Best-practice findings that must be addressed before this issue can be considered complete.

**Action**:
- Do NOT execute compress
- Return to Step 1 (implement) to apply the rework
- Re-run review after rework
- Repeat until Accept or Record TODO

### 3. Record TODO

**When**: Best-practice findings are acknowledged but deferred — not blocking issue completion, but worth tracking for future improvement.

**Action**:
- Execute compress (Step 3)
- Write the TODO debt record to the issue file or a per-feature debt log under `.scratch/<feature>/DEBT.md`, with format:

  ```
  ## TODO — <finding summary>
  - **Scope**: ≤issue | >issue
  - **Dimension**: code quality | architecture | performance | robustness | testability
  - **Description**: <detailed description of the improvement>
  - **Impact**: <why it matters>
  ```

- Mark the issue as passed
- Output [F4] completion signal noting the deferred TODO items
- The `finalize` skill will collect and summarize all TODO debt across issues

## Step 3: compress

Execute context compression. The concrete platform command is determined by the mapping table in `standards/common/instructions.md` §十二 — the single source of truth for compress platform mapping. All skills (orchestrate, execute, etc.) read from this shared location.

Default mapping for OpenCode: `dcp-compress`

> Compress is executed on Accept or Record TODO, NOT on Rework — the rework cycle continues in the same context window.

## Completion & Next-Step Suggestions

After Accept or Record TODO (with compress executed), output:

```
[F4] ✅ Issue complete: <issue path>
**Choice**: Accept | Record TODO (N items deferred)
**Next steps**:
- Continue to next issue: execute [PRD path] [next issue path]
- All issues complete? → trigger finalize skill [change scope] [affected doc list]
- Context clean-up: use dcp-compress to reset context before the next issue
```

## Constraint Inheritance

Execute does NOT decide language or git policy — it inherits them from the orchestrate context loaded in the session. This is the C-path in the constraint propagation model.

| Parameter | Source | Fallback |
|-----------|--------|----------|
| `lang.conversation` | orchestrate context | project AGENTS.md → global default `zh` |
| `lang.documents` | orchestrate context | project AGENTS.md → global default `zh` |
| `git.policy` | orchestrate context | project AGENTS.md → global default `allowed` |

If constraints are missing from context (e.g. execute is invoked standalone without orchestrate), read them from the project's `AGENTS.md` or `instructions.md` as fallback.

## Parent Skill Dependencies

| Parent Skill | Called By | When |
|-------------|-----------|------|
| `implement` | execute (Step 1) | Implement based on PRD/issue. Internally calls `tdd` and `code-review` (2-axis). |
| `review` | execute (Step 2) | Own skill — 3-axis review + scope annotation + rework routing. Based on parent `code-review` (2-axis) with Best-practice extension. |

## Completion Criteria

- [ ] Step 1 (implement) executed — implementation output on disk
- [ ] Step 2 (review) executed — 3-axis review report presented to user
- [ ] User 3-choice made (Accept / Rework / Record TODO)
- [ ] If Accept or Record TODO: compress executed, [F4] completion signal with next-step suggestion output
- [ ] If Record TODO: debt record written to disk
- [ ] If Rework: no compress executed, returned to Step 1
- [ ] Constraints inherited from context (or fallback to project standards)
- [ ] No Agent-specifying language

## Constraints

- This skill does NOT decide language or git policy — all constraints are inherited from the orchestrate context
- Written in English; output language is determined by `lang.conversation` and `lang.documents` from context
- User-driven — AI executes Steps 1-2, then user decides at the 3-choice gate
- Rework cycle: implement → review → rework → implement → review → ... (no compress until Accept or Record TODO)

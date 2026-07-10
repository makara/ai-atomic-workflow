---
name: finalize
description: Closure review step — after all issues in the execution phase (implement + review) are complete, performs architecture/function-level three-axis review (Standards + Spec + Best-practice), produces a final quality gate report, syncs docs, and archives expired outputs.
argument-hint: "[change scope] [affected doc list]"
user-invocable: true
disable-model-invocation: false
version: "1.0.0"
last_updated: "2026-07-09"
---

# Finalize

> **Role**: Own closure review step — top-layer quality gate and document convergence.
> **Referenced skill**: `review` (declaratively references its three-axis review framework)
> **Position**: Top-layer quality gate in the three-layer architecture — performs architecture/function-level review on the overall deliverable after the execution phase is fully complete.

## Use Cases

- After all issues' execute (implement → review → compress) cycles are complete
- Need to verify overall PRD functional completeness
- Need to converge all change outputs, sync docs, archive expired content

## Responsibility Boundary

**Do**:
- Collect all issues' review reports + PRD + architecture design docs as input
- Perform three-axis review (declaratively referencing review's framework, focused on architecture/function overall level)
- Produce a final quality gate report — user decides accept / return for redo / create new improvement task
- Sync affected documents
- Verify overall completeness
- Archive expired outputs

**Don't**:
- Don't re-analyze or re-implement — finalize is review and convergence, not a second development round
- Don't set auto rework routing — review conclusions are user-decided
- Don't modify unaffected documents
- Don't auto-trigger follow-up steps

---

## One: Three-Axis Review

> This review framework **declaratively references `review`'s three-axis model** (Standards + Spec + Best-practice parallel sub-agent review), without redefining the sub-agent dispatch mechanism and Fowler smell baseline here. The following focuses on finalize's review dimension mapping at the architecture/function overall level.

### 1. Standards (Architecture Compliance · pass/fail)

Review whether changes comply with project architecture standards.

**Review dimensions**:
- Module boundaries — whether changes break module single-responsibility
- Interface contracts — whether new/modified interfaces comply with existing contracts
- Dependency direction — whether new dependencies follow dependency rules (e.g. layered dependencies)

**Rules**:
- Project architecture standards take priority over generic rules
- Difference from review Standards: review focuses on **code-level** compliance (format/naming/smells); finalize focuses on **architecture-level** compliance (modules/interfaces/dependencies)

### 2. Spec (Functional Completeness · pass/fail)

Review whether the overall deliverable fully covers the PRD.

**Review dimensions**:
- Whether each PRD User Story has a corresponding issue with acceptance verified
- Functional coverage completeness — no omitted PRD entries
- No scope creep — no changes not defined in the PRD
- Cross-issue interaction consistency — whether interfaces/data between different issues have conflicts

### 3. Best-practice (Optimization Suggestions · non-pass/fail)

Provide architecture-level optimization directions for the overall deliverable; does not block pass.

**Dimension 1: Architecture Optimization**

| Focus | Description |
|-------|-------------|
| Module responsibility | Whether module responsibilities are clear; whether designs violate single responsibility |
| Extensibility | Whether the current architecture reasonably reserves room for future requirement extensions |
| Technical debt assessment | Technical debt introduced by this change (hardcoding, temporary solutions, TODOs) and impact scope |

**Dimension 2: Third-Party Module Usage**

| Focus | Description |
|-------|-------------|
| Tools/Frameworks | Whether new/used third-party tools/frameworks are necessary, version is reasonable, known vulnerabilities exist |
| Modules | Whether new external module dependencies are minimized; whether lighter alternatives exist |
| Design patterns | Whether used design patterns match the application scenario; whether they introduce unnecessary complexity |

---

## Two: TODO Debt Summary

Before the three-axis review, collect and summarize all TODO debt records from the execution phase:

1. Read all `.scratch/<feature>/DEBT.md` files generated during execute's "Record TODO" path
2. For each debt entry present:
   - Source issue reference
   - Scope (≤issue / >issue)
   - Dimension (which Best-practice dimension)
   - Description and impact
3. Present the summary in the finalize report under a dedicated "TODO Debt Summary" section
4. Each debt entry is an improvement task candidate in the user decision step

---

## Three: Execution Flow

### Step 1: Collect Input

Read the following files for context:

1. **All issues' review reports** — from `review`'s three-axis output (three-axis reports)
2. **PRD** — `.scratch/<feature>/PRD.md` or user-specified path
3. **TODO debt records** — `.scratch/<feature>/DEBT.md` files
4. **Architecture design docs** — user-specified paths (e.g. ADRs in `docs/adr/`, architecture design specs)

### Step 2: Per-Axis Review

Review in order: Standards → Spec → Best-practice:

- Standards (architecture compliance) — check module boundaries, interface contracts, dependency direction against architecture standards item by item
- Spec (functional completeness) — verify coverage per PRD User Story, check cross-issue consistency
- Best-practice (optimization suggestions) — provide architecture optimization and third-party module usage suggestions based on the overall deliverable

### Step 3: Produce Final Quality Gate Report

Output in structured format:

```markdown
# Finalize — Quality Gate Report
> Date: YYYY-MM-DD

## TODO Debt Summary
[Present debts from DEBT.md files, with source issue / scope / dimension / description / impact]

## Standards (Architecture Compliance)
[Report per item, mark pass/fail]

## Spec (Functional Completeness)
[Report coverage per PRD entry, mark pass/fail]

## Best-practice
### Architecture Optimization
[Format: [Focus] description → optimization suggestion]

### Third-Party Module Usage
[Format: [Module name] description → assessment conclusion]

## Conclusion
- Standards: [pass/fail]
- Spec: [pass/fail]
- Best-practice: [count] optimization suggestions
- TODO debts carried forward: [count] items
- User decision points: [whether there are directions requiring user choice]
```

### Step 4: User Decision

Submit the report to the user, who makes one of the following decisions:

- **Accept** → change complete, proceed to closure operations (§Four)
- **Return for redo** → return to bottom-layer execution (execute: implement → review → finalize)
- **Create new improvement task** → for issues found in Best-practice or TODO debts, create new PRD → issues (return to middle-layer decomposition)

---

## Four: Closure Operations

After the review report is accepted, execute the following closure operations:

1. **Document sync**: Sync this change's conclusions to affected project documents
   - Spec files (core/): Full rewrite — ensure content reflects the latest state
   - Plan files (plans/*/): Incremental update — append completion status, correct deviation notes
2. **Completeness verification**: Confirm all affected documents are updated, no stale reference residuals, no contradictions between documents
3. **Archive expired**: Archive expired files to `archive/`

**No recursive maintenance** — this round of finalize is the endpoint; do not trigger a new round of finalize.

---

## Five: Output Deliverables

1. Quality gate report (structure as §Three Step 3)
2. List of updated affected document files
3. List of archived expired files (if any)
4. User decision record (accept / return / new task)

## Completion Criteria

- [ ] All issues' review reports collected
- [ ] TODO debt summary presented
- [ ] Three-axis review report produced
- [ ] User decision made
- [ ] (If accepted) Affected docs synced
- [ ] (If accepted) Expired files archived
- [ ] (If accepted) No recursive maintenance

## Constraints

- Output language: inherited from `lang.conversation` (orchestrate context injection)
- Git policy: inherited from `git.policy` (AGENTS.md)
- Declaratively references review's framework — does not redefine its three-axis review mechanism and sub-agent dispatch flow
- No auto rework routing — final quality gate, user-decided routing
- No recursive maintenance
- No Agent-specifying language

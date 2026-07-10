<!-- layer: common | scope: all-languages -->

# Common AI Instructions

> This file is the project-level common AI behavior baseline — language-specific instruction supplements (e.g., package manager, test framework) are defined in their respective language layers.

---

## Navigation: When to Read Which Standards

> This file is the **single entry point** for project standards. Before any operation, the AI **must first read this navigation table**, determine which standards files to load based on the scenario, and **explicitly call the Read tool to load the corresponding files**.

### Coding Standards

| When you are | Must read these files |
|---|---|
| Writing / modifying / reviewing any code | `standards/common/CODING-STANDARDS.md` |
| Writing / modifying / reviewing JS/TS code | Above + `standards/js-ts/CODING-STANDARDS.md` |
| Writing / modifying / reviewing Python code | Above + `standards/python/CODING-STANDARDS.md` |

### AI Behavior Instructions

| When you are | Must read these files |
|---|---|
| Performing any operation | `standards/common/instructions.md` (this document) |
| Working on a JS/TS project | Above + `standards/js-ts/instructions-supplement.md` |
| Working on a Python project | Above + `standards/python/instructions-supplement.md` |

### Skill Invocation

| When you are | Reference rule |
|---|---|
| Loading any skill | This document §4 — Skill Dependency Declarations |

---

## 1. Workflow Constraints

> **Principle**: The user is the sole stage trigger and decision-maker — the AI does not proactively advance to the next step.
> **Execution**: The user explicitly triggers each stage transition; the AI must not auto-switch steps or advance the process.

- All formal output must be written to files — conversation is a temporary medium.
- If implementation deviates from the plan, the deviation must be explicitly noted in the output.
- Modifications require re-confirmation — whether plan modifications or implementation modifications, both must go through the approval/confirmation process.

---

## 2. Task Execution Discipline

- Strictly adhere to the assigned task scope. Do not perform operations that were not explicitly requested or are redundant.
- Any improvement suggestions beyond the current scope must first seek user input; do not implement directly.
- Clarify ambiguous user intent before proceeding — avoid assumption-based implementation.

---

## 3. Feedback Channels (F1–F5)

| Channel | When | Format |
|---------|------|--------|
| **F1 Decision Request** | Information gaps / solution forks / boundary ambiguity found | `[F1] Decision needed: <question>. Option A: <...>; Option B: <...>. Recommendation: <...>` |
| **F2 Progress Update** | Step start + task midpoint | `[F2] <step name> — <progress>%. Completed: <summary>. Next: <...>` |
| **F3 Risk Warning** | Deviation / missing dependency found | `[F3] ⚠️ Deviation: <description>. Impact: <scope>. Suggestion: <plan>` |
| **F4 Completion Signal** | After output written to file | `[F4] ✅ Output ready: <file path>. Acceptance checklist: ...` |
| **F5 Info Notification** | Related impact found | `[F5] 📎 Note: <finding>. Relevance: <why user should care>` |

### Non-negotiable Minimums

- **F4 (Completion Signal) is mandatory** — output written to file must include a structured acceptance checklist.
- **F3 (Deviation Marking) is mandatory** — if implementation deviates from the plan, it must be explicitly noted in the output.
- **F1 (Decision Request) must not be hidden** — do not hide decision points in plan drafts under the pretext of "reducing interaction rounds."

---

## 4. Skill Dependency Declarations

### Rule

**When a loaded skill declares dependent skills, the dependent skills must be explicitly invoked — rules must not be indirectly obtained from the current skill's text alone.**

### Parent Skill Dependency Table

This repo's own skills depend on the following mattpocock/skills parent skills:

| Own Skill | Must Also Load |
|---|---|
| `orchestrate` | `grilling` + `domain-modeling` + `to-spec` + `to-tickets` + `implement` + `code-review` + `diagnosing-bugs` + `triage` |
| `main-flow` | `grilling` + `domain-modeling` + `prototype` + `to-spec` + `to-tickets` | owns the guide file format (idea scenario step template) |
| `execute` | `implement` |
| `review` | `code-review` |
| `finalize` | Declarative reference to `code-review` three-axis framework (not directly loaded) |

### Invocation Patterns

- **Own skill pattern**: After loading an own skill, immediately call `skill("parent-skill")` — the parent skill provides the full workflow rules; the own skill only overlays constraint overrides.
- **Language and git constraints**: Not hardcoded in skills — determined by `orchestrate` entry parameters and project standards (`AGENTS.md` / `instructions.md`).

---

## 5. Writing Style

- Keep code and documentation concise. Match the language style of existing modules; do not introduce new tone or structure.
- Output format: conclusion first, then details (O1 principle).
- Do not answer questions that were not asked — avoid anticipatory output.

---

## 6. Rule Conflict Resolution

- Internal rule conflicts are arbitrated by `design-goals.md` G1–G3 as the highest authority.
- Language-layer rules override common-layer rules — rules in language-layer files take precedence over common-layer equivalents.

---

## 7. Step Types

> **Principle**: Step types are based on a mature AI-assisted development skill system.
> **OpenCode Execution**: Step types are based on **mattpocock/skills** and the own skill system, organized in a three-layer architecture:

| Layer | Responsibility | Skill |
|-------|---------------|--------|
| Top — Orchestration | Entry routing + full flow guidance | orchestrate |
| Top — Orchestration | idea→ship main flow | main-flow |
| Bottom — Execution | Single issue implementation (implement → review → compress closed loop) | execute |
| Bottom — Review | Three-axis review + rework routing | review |
| Top — Closure | Architecture-level quality gate + doc sync | finalize |
| Middle — Decomposition | Break PRD into independent issues (parent skills) | to-spec, to-tickets |
| Own Tools | Asset inventory / constraint configuration / content authoring | asset-inventory, constraint-configuration, content-authoring |

8 own skills + 12 mattpocock/skills parent skills (not maintained in this repo). Language and git strategy are determined by `orchestrate` entry parameters and project standards, not hardcoded in skills.

For detailed step type definitions, see the deployed skill files (`~/.agents/skills/` or the project `skills/` directory).

---

## 8. Constraints

- Input/output language: English.
- No git operations.
- Guidance files must be written to disk — a guidance file not written to disk is treated as not produced.
- Constraints are encoded in skills — rules in skill files are the source of constraints.

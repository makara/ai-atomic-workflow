<!-- layer: js-ts | parent: common | scope: js-ts-projects -->

# JS/TS Coding Standards

> This file inherits from `standards/common/CODING-STANDARDS.md`. The following defines JS/TS-specific rules only.

---

## 1. Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files and directories | `kebab-case` | `user-profile.ts`, `data-source/` |
| Variables and functions | `camelCase` | `getUserProfile` |
| Classes, types, components | `PascalCase` | `UserProfileCard` |
| Interfaces | `I` + `PascalCase` | `IUserProfile` |
| Constants and enums | `UPPER_SNAKE_CASE` | `DEFAULT_MAX_RETRY_LIMIT` |

---

## 2. Type System

- **Explicit types**: Core interfaces must strictly avoid `unknown`; use precise generics, algebraic data types, or discriminated union types.
- **`any` boundary**: Only use `any` when absolutely necessary (e.g., third-party library lacks type declarations). Attach a `TODO` comment explaining the reason and cleanup target when using `any`. Scope `any` to within functions — do not leak into public APIs.
- **Type guards**: Avoid `as unknown as YourType` double type assertions — they hide API contract mismatches.
- **Control complexity**: Prefer early returns to reduce nesting depth; control cyclomatic complexity.

---

## 3. Testing and Quality Gates

- **Regression guarantee**: Any feature change or bug fix must include at least one regression test covering the changed code path.
- **Incremental validation**: Build and test local targets before submitting changes.
- **Definition of Done (DoD)**:
  - [ ] No new compiler, linter, or type errors introduced
  - [ ] Relevant unit and integration test suites pass

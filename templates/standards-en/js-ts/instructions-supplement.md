<!-- layer: js-ts | parent: common | scope: js-ts-projects -->

# JS/TS AI Instruction Supplement

> This file inherits from `standards/common/instructions.md`. The following defines JS/TS project-specific instructions only.

---

## 1. Package Manager

- If the project specifies a package manager (yarn / npm / pnpm), strictly follow it. If not explicitly specified, prioritize the package manager corresponding to the lock file present in the project root.
- Mixing multiple package managers is prohibited — use only one per project.

---

## 2. Project Structure Conventions

- Source code resides in `src/`, build output in `dist/` or the project-specified directory.
- Type declaration files reside alongside source files or in a `types/` directory.

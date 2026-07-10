<!-- layer: common | scope: all-languages -->

# Common Coding Standards

> This file defines language-agnostic coding principles — language-specific naming, typing, and testing rules are in their respective language-layer standards.
> This file must not be deleted — it applies across all languages.

---

## 1. Core Principles (Highest Priority)

1. **Simplicity over abstraction**: Prioritize minimal implementation. Avoid premature optimization, over-engineering, or introducing unused abstractions for "future compatibility."
2. **Clean main path**: Mainline code must not contain temporary workarounds, placeholder code, no-op fallbacks, or temporary bypasses. Incomplete code stays on branches — do not merge.
3. **Consistency over preference**: Match existing naming, directory structure, comment style, export shape, field order, and whitespace conventions. Consistency overrides personal preference.
4. **Alignment precision**: Alignment or migration tasks use a baseline as a direct template — precisely match symbol/export ordering, readonly field configuration, comment wording, and whitespace rhythm.
5. **Executability**: No loose or runtime-escapable styles — do not introduce runtime type erasure or multi-step type casts without specific justification.

---

## 2. Comments and Documentation

- **Comments should explain why, not what**: "Why it's done this way" matters far more than "what is done here" (the code itself documents the what).
- **Public APIs must be documented**: Exposed functions, hooks, and major components require standardized doc comments.
- **Preserve comments during refactoring**: When refactoring, retain existing implementation-detail comments and doc-block comments — do not strip them.
- **No noise comments**: Remove non-informative comments — comments like `// increment i` are worse than none.

---

## 3. File Output Conventions

- All formal output must be written to files; conversation is a temporary medium.
- Output type maps to output path one-to-one: plan documents → `plans/`, implementation code → target files specified in the plan, verification conclusions → appended to the corresponding plan document.
- Nothing written to disk is treated as not produced.

---

## 4. Rule Conflict Resolution

- When physical code implementation conflicts with written standards, arbitrate by **simplicity, precision, executability**.
- Outdated or redundant standards should be promptly revised or proposed for deletion.
- Internal rule conflicts are arbitrated by `design-goals.md` G1–G3 as the highest authority.

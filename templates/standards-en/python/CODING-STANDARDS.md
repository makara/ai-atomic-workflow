<!-- layer: python | parent: common | scope: python-projects -->

# Python Coding Standards

> This file inherits from `standards/common/CODING-STANDARDS.md`. The following defines Python-specific rules only.

---

## 1. Type Annotations

- All public functions and methods must use PEP 484 / 585 / 604 compatible type annotations.
- `Any` must not leak into public APIs — prefer `Protocol`, generic constraints, or overloads when typing is infeasible.
- mypy strict mode: target zero type errors.

---

## 2. Testing

- Use pytest as the test framework.
- Any feature change or bug fix must include at least one test covering the changed path.
- Coverage targets are defined per project — no global hard requirement.

---

## 3. Project Structure

- Prefer the `src` layout: source code in `src/<package_name>/`.
- Project metadata in `pyproject.toml`.
- Dependency management tool is up to the project — no global constraint.

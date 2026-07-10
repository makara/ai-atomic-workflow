<!-- layer: python | parent: common | scope: python-projects -->

# Python AI Instruction Supplement

> This file inherits from `standards/common/instructions.md`. The following defines Python project-specific instructions only.

---

## 1. Environment Management

- Python version is determined by the project `.python-version` or the `requires-python` field in `pyproject.toml`.
- Ensure the virtual environment is activated before operating.

---

## 2. Project Structure Conventions

- Source code resides in `src/<package>/` or the project-specified directory.
- Test code resides in `tests/`.

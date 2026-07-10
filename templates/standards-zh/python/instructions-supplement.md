<!-- layer: python | parent: common | scope: python-projects -->

# Python AI 指令补充

> 本文件继承自 `standards/common/instructions.md`，以下仅定义 Python 项目专属指令。

---

## 一、环境管理

- Python 版本以项目 `.python-version` 或 `pyproject.toml` 中的 `requires-python` 为准。
- 操作前确保虚拟环境已激活。

---

## 二、项目结构约定

- 源代码位于 `src/<package>/` 或项目指定目录。
- 测试代码位于 `tests/`。

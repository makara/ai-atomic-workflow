<!-- layer: python | parent: common | scope: python-projects -->

# Python 编码标准

> 本文件继承自 `standards/common/CODING-STANDARDS.md`，以下仅定义 Python 特有规则。

---

## 一、类型标注

- 所有公开函数和方法必须使用 PEP 484 / 585 / 604 兼容的类型标注。
- 禁止 `Any` 泄漏至公开 API——无法标注时优先使用 `Protocol`、泛型约束或重载。
- mypy 严格模式：目标零类型错误。

---

## 二、测试

- 使用 pytest 作为测试框架。
- 任何功能变更或 bug 修复须附带至少一个覆盖变更路径的测试。
- 覆盖率目标由项目定义——不做全局硬性要求。

---

## 三、项目结构

- 推荐 `src` 布局：源代码位于 `src/<package_name>/`。
- 项目元数据使用 `pyproject.toml`。
- 依赖管理工具由项目自行决定——不作全局约束。

<!-- layer: js-ts | parent: common | scope: js-ts-projects -->

# JS/TS 编码标准

> 本文件继承自 `standards/common/CODING-STANDARDS.md`，以下仅定义 JS/TS 特有规则。

---

## 一、命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 文件与目录 | `kebab-case` | `user-profile.ts`，`data-source/` |
| 变量与函数 | `camelCase` | `getUserProfile` |
| 类、类型、组件 | `PascalCase` | `UserProfileCard` |
| 接口 | `I` + `PascalCase` | `IUserProfile` |
| 常量与枚举 | `UPPER_SNAKE_CASE` | `DEFAULT_MAX_RETRY_LIMIT` |

---

## 二、类型系统

- **显式类型**：核心接口严格避免 `unknown`；使用精确泛型、代数数据类型或可辨识联合类型。
- **`any` 边界**：仅在绝对必要时使用 `any`（如第三方库缺少类型声明）。使用 `any` 时附加 `TODO` 注释说明原因和清理目标。`any` 的作用域限定在函数内部——不泄漏到公开 API。
- **类型守卫**：避免 `as unknown as YourType` 双重类型转换——隐藏了 API 契约不匹配。
- **控制复杂度**：优先使用 early return 减少嵌套层级，控制圈复杂度。

---

## 三、测试与质量门

- **回归保证**：任何功能变更或 bug 修复必须附带至少一个覆盖变更代码路径的回归测试。
- **增量验证**：提交变更前先构建和测试本地目标。
- **完成定义 (DoD)**：
  - [ ] 未引入新的编译器、linter 或类型错误
  - [ ] 相关单元和集成测试套件通过

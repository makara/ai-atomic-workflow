<!-- layer: js-ts | parent: common | scope: js-ts-projects -->

# JS/TS AI 指令补充

> 本文件继承自 `standards/common/instructions.md`，以下仅定义 JS/TS 项目专属指令。

---

## 一、包管理器

- 项目如指定了包管理器（yarn / npm / pnpm），严格遵守。如未明确指定，优先使用项目根目录中存在的 lock 文件所对应的包管理器。
- 禁止混合使用多种包管理器——同一项目仅用一种。

---

## 二、项目结构约定

- 源代码位于 `src/`，构建产物位于 `dist/` 或项目指定目录。
- 类型声明文件位于源文件同目录或 `types/` 目录。

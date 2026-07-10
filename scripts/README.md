# Scripts

Utility scripts for the ai-atomic-workflow project.

## 部署脚本

| 脚本 | 用途 | 目标 |
|------|------|------|
| `deploy-global.sh` | 部署 skills 到全局 | `~/.agents/skills/` |
| `deploy-project.sh` | 部署 OpenCode 配置 + 平台无关标准到目标项目 | `opencode.json` + `standards/` |

## 内部维护脚本

| 脚本 | 用途 |
|------|------|
| `validate.sh` | 只读一致性校验——skills 结构、core/ 引用、AGENTS.md 架构、脚本 git 检查 |

## 共享工具

| 文件 | 用途 |
|------|------|
| `lib/common.sh` | 共享日志、颜色、路径解析、门控解析工具函数 |

## 门控约定

所有脚本遵循统一门控：

| 标志 | 效果 |
|------|------|
| `--dry-run` | 预览操作，不实际写入 |
| `--apply` | 执行写入操作 |
| `--help` | 显示用法 |
| 无参数 | 显示帮助（防止意外执行） |

所有脚本不含 git 命令。

## 用法

```bash
# Skills 全局部署
scripts/deploy-global.sh --dry-run
scripts/deploy-global.sh --apply

# OpenCode 项目配置部署
scripts/deploy-project.sh /path/to/target --dry-run
scripts/deploy-project.sh /path/to/target --apply

# 一致性校验
scripts/validate.sh
```

#!/bin/bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
PROJECT_ROOT=$(resolve_root)

SKILLS_SRC="$PROJECT_ROOT/skills"
SKILLS_DST="$HOME/.agents/skills"

show_help() {
    cat << 'EOF'
用法: scripts/deploy-global.sh [选项]

部署 skills/ 下所有 SKILL.md 到 ~/.agents/skills/ —— 全局 skills 安装。

选项:
  --dry-run    预览将要复制的文件列表（不实际执行）
  --apply      执行部署安装
  --help       显示此帮助信息
EOF
}

parse_help "$1"

DRY_RUN=false
case "${1:-}" in
    --dry-run) DRY_RUN=true ;;
    --apply)   DRY_RUN=false ;;
    --help)    show_help; exit 0 ;;
    "")        show_help; exit 1 ;;
    *)         show_help; exit 1 ;;
esac

# --- Pre-checks ---
if [ ! -d "$SKILLS_SRC" ]; then
    log_err "skills/ 目录不存在: $SKILLS_SRC"
fi

# --- Collect files ---
NEW_COUNT=0
OVERWRITE_COUNT=0
SKIP_COUNT=0
TOTAL=0

echo ""
log_info "技能源目录: $SKILLS_SRC"
log_info "部署目标:    $SKILLS_DST"
echo ""

while IFS= read -r -d '' skill_md; do
    skill_name=$(basename "$(dirname "$skill_md")")
    dst_dir="$SKILLS_DST/$skill_name"
    dst_file="$dst_dir/SKILL.md"

    TOTAL=$((TOTAL + 1))

    if [ "$DRY_RUN" = true ]; then
        if [ -f "$dst_file" ]; then
            log_info "[预览] 覆盖: $skill_name/SKILL.md → $dst_dir/"
            OVERWRITE_COUNT=$((OVERWRITE_COUNT + 1))
        else
            log_info "[预览] 新建: $skill_name/SKILL.md → $dst_dir/"
            NEW_COUNT=$((NEW_COUNT + 1))
        fi
    else
        mkdir -p "$dst_dir"
        if [ -f "$dst_file" ]; then
            cp "$skill_md" "$dst_file"
            log_ok "覆盖: $skill_name"
            OVERWRITE_COUNT=$((OVERWRITE_COUNT + 1))
        else
            cp "$skill_md" "$dst_file"
            log_ok "新建: $skill_name"
            NEW_COUNT=$((NEW_COUNT + 1))
        fi
    fi
done < <(find "$SKILLS_SRC" -name "SKILL.md" -print0)

echo ""
echo "---"
log_info "总计: $TOTAL 个 skill  新建: $NEW_COUNT  覆盖: $OVERWRITE_COUNT  跳过: $SKIP_COUNT"

if [ "$DRY_RUN" = true ]; then
    echo ""
    log_info "预览模式——未执行任何写入。使用 --apply 部署。"
fi

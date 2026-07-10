#!/bin/bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
PROJECT_ROOT=$(resolve_root)

TEMPLATES_SRC="$PROJECT_ROOT/opencode/templates"

show_help() {
    cat << 'EOF'
用法: scripts/deploy-project.sh <目标项目路径> [选项]

部署 OpenCode 项目配置到目标项目。

参数:
  <目标项目路径>          目标项目的根目录路径（必填）

选项:
  --lang zh|en           选择语言版本——zh 安装 standards-zh/、en 安装 standards-en/（默认: zh）
  --dry-run              预览部署操作（不实际执行）
  --apply                执行部署
  --help                 显示此帮助信息

部署内容:
  opencode.json           合并式部署——保留目标已有字段，确保 instructions 字段引用正确
  standards/              平台无关标准——目标文件不存在时复制，已存在跳过不覆盖
EOF
}

parse_help "$1"

TARGET=""
MODE=""
LANG="zh"

# Parse arguments
for arg in "$@"; do
    case $arg in
        --dry-run) MODE="dry-run" ;;
        --apply)   MODE="apply" ;;
        --lang)
            LANG_ARG_ACTIVE=true
            ;;
        --help)    show_help; exit 0 ;;
        -*)        echo "未知选项: $arg"; show_help; exit 1 ;;
        *)
            # If last arg was --lang, this is the language value
            if [ "$LANG_ARG_ACTIVE" = "true" ]; then
                case $arg in
                    zh|en) LANG="$arg" ;;
                    *)     echo "无效的语言选项: $arg (需为 zh 或 en)"; show_help; exit 1 ;;
                esac
                LANG_ARG_ACTIVE=false
            else
                TARGET="$arg"
            fi
            ;;
    esac
done

if [ "$LANG_ARG_ACTIVE" = "true" ]; then
    echo "错误: --lang 选项需要一个值（zh 或 en）"
    show_help
    exit 1
fi

if [ -z "$TARGET" ]; then
    log_err "缺少目标项目路径参数。"
fi

if [ -z "$MODE" ]; then
    log_err "需要指定 --dry-run 或 --apply。"
fi

TARGET_OPENCODE="$TARGET/.opencode"

# --- Pre-checks ---
if [ ! -d "$TEMPLATES_SRC" ]; then
    log_err "模版源目录不存在: $TEMPLATES_SRC"
fi

if [ ! -d "$TARGET" ]; then
    log_err "目标目录不存在: $TARGET"
fi

echo ""
log_info "模版源:  $TEMPLATES_SRC"
log_info "目标项目: $TARGET"
log_info "语言: $LANG"
echo ""

PASS=0
SKIP=0
WARN=0

# --- opencode.json merge ---
SRC_JSON="$TEMPLATES_SRC/opencode.json"
TGT_JSON="$TARGET/opencode.json"

if [ ! -f "$SRC_JSON" ]; then
    log_warn "模版 opencode.json 不存在，跳过。"
    SKIP=$((SKIP + 1))
else
    if [ "$MODE" = "dry-run" ]; then
        if [ -f "$TGT_JSON" ]; then
            log_info "[预览] opencode.json: 合并部署（目标已存在——将合并 instructions 字段）"
        else
            log_info "[预览] opencode.json: 新建部署"
        fi
        PASS=$((PASS + 1))
    else
        if [ -f "$TGT_JSON" ]; then
            # Merge: preserve target, ensure key fields from source
            # Simple approach: copy source as base, note user should review
            # For zero-substitution template, we check and report
            log_info "opencode.json 已存在——检查关键字段..."
            if command -v python3 &> /dev/null; then
                python3 -c "
import json, sys
try:
    with open('$TGT_JSON') as f:
        target = json.load(f)
    with open('$SRC_JSON') as f:
        source = json.load(f)

    changed = False
    for key in ('instructions',):
        if key in source:
            if isinstance(source[key], list) and isinstance(target.get(key), list):
                # Array merge: append items not already in target
                existing = set(target[key])
                added = [item for item in source[key] if item not in existing]
                if added:
                    target[key].extend(added)
                    changed = True
            elif target.get(key) != source[key]:
                target[key] = source[key]
                changed = True

    if changed:
        with open('$TGT_JSON', 'w') as f:
            json.dump(target, f, indent=2, ensure_ascii=False)
            f.write('\n')
        log_msg = 'merged'
        if 'added' in dir() and added:
            log_msg += ' (added: ' + ', '.join(added) + ')'
        print(log_msg)
    else:
        print('unchanged')
except Exception as e:
    print(f'error: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1
                MERGE_RESULT=$?
                if [ $MERGE_RESULT -eq 0 ]; then
                    log_ok "opencode.json: 已合并关键字段"
                else
                    log_warn "opencode.json: 合并失败，请手动检查。"
                    WARN=$((WARN + 1))
                fi
            else
                log_warn "opencode.json: python3 不可用，跳过合并。请手动检查 instructions 字段。"
                WARN=$((WARN + 1))
            fi
        else
            cp "$SRC_JSON" "$TGT_JSON"
            log_ok "opencode.json: 已部署"
        fi
        PASS=$((PASS + 1))
    fi
fi

# --- standards/ ---
SRC_STANDARDS="$PROJECT_ROOT/templates/standards-$LANG"
TGT_STANDARDS="$TARGET/standards"

if [ -d "$SRC_STANDARDS" ]; then
    while IFS= read -r -d '' src_file; do
        rel_path="${src_file#"$SRC_STANDARDS"/}"
        tgt_file="$TGT_STANDARDS/$rel_path"
        tgt_dir="$(dirname "$tgt_file")"

        if [ "$MODE" = "dry-run" ]; then
            if [ -f "$tgt_file" ]; then
                log_info "[预览] standards/$rel_path: 跳过（目标已存在——保留项目自定义）"
            else
                log_info "[预览] standards/$rel_path: 新建 → $TGT_STANDARDS/"
            fi
        else
            mkdir -p "$tgt_dir"
            if [ -f "$tgt_file" ]; then
                log_info "standards/$rel_path: 跳过（目标已存在——保留项目自定义）"
                SKIP=$((SKIP + 1))
            else
                cp "$src_file" "$tgt_file"
                log_ok "standards/$rel_path: 已部署"
                PASS=$((PASS + 1))
            fi
        fi
    done < <(find "$SRC_STANDARDS" -type f -print0)
else
    log_warn "模版 standards-$LANG/ 目录不存在，跳过。"
    SKIP=$((SKIP + 1))
fi

echo ""
echo "---"
log_info "操作: $PASS 完成  $SKIP 跳过  $WARN 警告"

if [ "$MODE" = "dry-run" ]; then
    echo ""
    log_info "预览模式——未执行任何写入。使用 --apply 部署。"
fi

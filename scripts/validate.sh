#!/bin/bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
PROJECT_ROOT=$(resolve_root)

PASS=0
FAIL=0

check_pass() { echo -e "${GREEN}[OK]${NC}   $1"; PASS=$((PASS + 1)); }
check_fail() { echo -e "${RED}[ERROR]${NC} $1 — $2"; FAIL=$((FAIL + 1)); }

echo ""
echo "=== ai-atomic-workflow 一致性校验 ==="
echo ""

# --- 1. skills/ 结构 ---
echo "[1] skills/ 目录结构"
if [ -d "$PROJECT_ROOT/skills" ]; then
    check_pass "skills/ 目录存在"
else
    check_fail "skills/ 目录缺失" ""
fi

MISSING_SKILL_MD=0
while IFS= read -r -d '' skill_dir; do
    name=$(basename "$skill_dir")
    if [ ! -f "$skill_dir/SKILL.md" ]; then
        echo -e "  ${RED}[FAIL]${NC} skills/$name/SKILL.md 缺失"
        MISSING_SKILL_MD=$((MISSING_SKILL_MD + 1))
    fi
done < <(find "$PROJECT_ROOT/skills" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null || true)

if [ "$MISSING_SKILL_MD" -eq 0 ]; then
    check_pass "所有 skills 子目录含 SKILL.md"
else
    check_fail "skills 缺失" "$MISSING_SKILL_MD 个子目录缺少 SKILL.md"
fi

# --- 2. core/ 无过期引用 ---
echo ""
echo "[2] core/ 过期引用检查"
STALE_REFS="core/step-types|templates/project-init"
STALE_FOUND=$(grep -rEl "$STALE_REFS" "$PROJECT_ROOT/core/" 2>/dev/null || true)
if [ -z "$STALE_FOUND" ]; then
    check_pass "无对已归档目录的引用 (core/step-types templates/project-init)"
else
    echo "$STALE_FOUND" | while read -r f; do
        echo -e "  ${RED}[STALE]${NC} $f"
    done
    check_fail "core/ 有过期引用" ""
fi

# --- 3. AGENTS.md 架构一致性 ---
echo ""
echo "[3] AGENTS.md 架构一致性"
if [ -f "$PROJECT_ROOT/AGENTS.md" ]; then
    if grep "agents/" "$PROJECT_ROOT/AGENTS.md" | grep -v "~/.agents/" | grep -v "docs/" | grep -v "agents/ domain docs" | grep -q "."; then
        check_fail "AGENTS.md 含 agents/ 引用（已归档）" ""
    else
        check_pass "AGENTS.md 无 agents/ 引用（合法 docs/agents/ 引用除外）"
    fi

    if grep -q "core/" "$PROJECT_ROOT/AGENTS.md"; then
        check_pass "AGENTS.md 引用 core/ 目录"
    else
        check_fail "AGENTS.md 缺少 core/ 引用" ""
    fi

    if grep -q "skills/" "$PROJECT_ROOT/AGENTS.md"; then
        check_pass "AGENTS.md 引用 skills/ 目录"
    else
        check_fail "AGENTS.md 缺少 skills/ 引用" ""
    fi

    # Check for old skill names that should have been updated
    OLD_TERMS="phase-bootstrap\|phase-closure\|requesting-code-review"
    if grep -q "$OLD_TERMS" "$PROJECT_ROOT/AGENTS.md"; then
        check_fail "AGENTS.md 含旧 skill 名称 (phase-bootstrap/phase-closure/requesting-code-review)" ""
    else
        check_pass "AGENTS.md 无旧 skill 名称"
    fi
else
    check_fail "AGENTS.md 不存在" ""
fi

# --- 4. 脚本不含 git 命令 ---
echo ""
echo "[4] 脚本 git 命令检查"
GIT_IN_SCRIPTS=0
while IFS= read -r -d '' script; do
    [[ "$(basename "$script")" == "validate.sh" ]] && continue
    if grep -q '\<git\>' "$script" 2>/dev/null; then
        echo -e "  ${RED}[GIT]${NC} $(basename "$script") 含 git 命令"
        GIT_IN_SCRIPTS=$((GIT_IN_SCRIPTS + 1))
    fi
done < <(find "$PROJECT_ROOT/scripts" -name "*.sh" -print0)

if [ "$GIT_IN_SCRIPTS" -eq 0 ]; then
    check_pass "所有脚本不含 git 命令"
else
    check_fail "脚本含 git 命令" "$GIT_IN_SCRIPTS 个文件"
fi

# --- 5. 自有 skill 完整性 ---
echo ""
echo "[5] 自有 skill 完整性检查"
REQUIRED_SKILLS=("orchestrate" "main-flow" "execute" "review" "finalize" "asset-inventory" "constraint-configuration" "content-authoring")
MISSING_OWN=0
for skill in "${REQUIRED_SKILLS[@]}"; do
    dir_path="$PROJECT_ROOT/skills/$skill"
    if [ ! -d "$dir_path" ]; then
        echo -e "  ${RED}[MISSING]${NC} skills/$skill/ 目录缺失"
        MISSING_OWN=$((MISSING_OWN + 1))
    elif [ ! -f "$dir_path/SKILL.md" ]; then
        echo -e "  ${RED}[MISSING]${NC} skills/$skill/SKILL.md 缺失"
        MISSING_OWN=$((MISSING_OWN + 1))
    fi
done

if [ "$MISSING_OWN" -eq 0 ]; then
    check_pass "8 个自有 skill 完整（目录 + SKILL.md）"
else
    check_fail "自有 skill 不完整" "$MISSING_OWN 个缺失"
fi

# --- 6. 无 -zh/-en 后缀目录残留 ---
echo ""
echo "[6] 无 -zh/-en 后缀目录残留"
SUFFIX_DIRS=$(find "$PROJECT_ROOT/skills" -mindepth 1 -maxdepth 1 -type d -name "*-zh" -o -name "*-en" 2>/dev/null | wc -l | tr -d ' ')
if [ "$SUFFIX_DIRS" -eq 0 ]; then
    check_pass "skills/ 无 -zh/-en 后缀目录残留"
else
    find "$PROJECT_ROOT/skills" -mindepth 1 -maxdepth 1 -type d \( -name "*-zh" -o -name "*-en" \) | while read -r d; do
        echo -e "  ${RED}[STALE]${NC} $(basename "$d")"
    done
    check_fail "skills/ 含 -zh/-en 后缀目录" "$SUFFIX_DIRS 个残留"
fi

# --- 7. templates standards 目录一致性 ---
echo ""
echo "[7] templates/standards 目录一致性"
SRC_ZH="$PROJECT_ROOT/templates/standards-zh"
SRC_EN="$PROJECT_ROOT/templates/standards-en"
if [ -d "$SRC_ZH" ] && [ -d "$SRC_EN" ]; then
    ZH_COUNT=$(find "$SRC_ZH" -type f | wc -l | tr -d ' ')
    EN_COUNT=$(find "$SRC_EN" -type f | wc -l | tr -d ' ')
    if [ "$ZH_COUNT" -eq "$EN_COUNT" ]; then
        check_pass "standards-zh/ 和 standards-en/ 文件数一致 ($ZH_COUNT)"
    else
        check_fail "standards 文件数不一致" "zh=$ZH_COUNT en=$EN_COUNT"
    fi
    MISSING_EN=0
    while IFS= read -r -d '' zh_file; do
        rel="${zh_file#$SRC_ZH/}"
        if [ ! -f "$SRC_EN/$rel" ]; then
            echo -e "  ${RED}[MISSING]${NC} standards-en/$rel 缺失"
            MISSING_EN=$((MISSING_EN + 1))
        fi
    done < <(find "$SRC_ZH" -type f -print0)
    MISSING_ZH=0
    while IFS= read -r -d '' en_file; do
        rel="${en_file#$SRC_EN/}"
        if [ ! -f "$SRC_ZH/$rel" ]; then
            echo -e "  ${RED}[MISSING]${NC} standards-zh/$rel 缺失"
            MISSING_ZH=$((MISSING_ZH + 1))
        fi
    done < <(find "$SRC_EN" -type f -print0)
    if [ "$MISSING_EN" -eq 0 ] && [ "$MISSING_ZH" -eq 0 ]; then
        check_pass "standards-zh/ 与 standards-en/ 文件一一对应"
    else
        check_fail "standards 文件不对应" "en缺$MISSING_EN个 zh缺$MISSING_ZH个"
    fi
else
    if [ ! -d "$SRC_ZH" ]; then check_fail "templates/standards-zh/ 不存在" ""; fi
    if [ ! -d "$SRC_EN" ]; then check_fail "templates/standards-en/ 不存在" ""; fi
fi

# --- Summary ---
echo ""
echo "=== 结果 ==="
TOTAL=$((PASS + FAIL))
echo "通过: $PASS / $TOTAL"

if [ "$FAIL" -gt 0 ]; then
    echo "失败: $FAIL 项需修正"
    exit 1
else
    echo "全部校验通过。"
fi

#!/bin/bash
# Shared helpers for ai-atomic-workflow scripts
# Source this file in scripts located in scripts/:  source "$(dirname "$0")/lib/common.sh"

# --- Colors ---
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# --- Logging ---
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()   { echo -e "${GREEN}[OK]${NC}   $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Path resolution ---
resolve_root() {
    # Resolve project root from a caller script located in scripts/
    # Usage: PROJECT_ROOT=$(resolve_root)
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
    cd "$script_dir/.." && pwd
}

# --- CLI helpers ---
parse_help() {
    # Handle -h / --help consistently; override show_help() in each script
    case "${1:-}" in
        -h|--help) show_help; exit 0 ;;
    esac
}

# --- Interactive helpers ---
prompt_confirm() {
    # Prompt user for y/N confirmation; returns 0 if confirmed
    local prompt="${1:-Continue?}"
    read -r -p "$prompt [y/N] " -n 1
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

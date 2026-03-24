#!/usr/bin/env bash
#
# Launches a local dev chat session against a temporary workspace.
# No ports are opened — chat mode is a local TUI only.
# Safe to run alongside a live protege agent.
#
# Usage: ./scripts/dev-chat.sh [persona]

set -euo pipefail

FRAMEWORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
PERSONA="${1:-}"

echo "Creating temp workspace at $TMP_DIR"
cd "$FRAMEWORK_DIR" && npx tsx engine/cli/main.ts init --path "$TMP_DIR"

cd "$TMP_DIR"

if [ -n "$PERSONA" ]; then
  exec npx tsx --tsconfig "$FRAMEWORK_DIR/tsconfig.json" "$FRAMEWORK_DIR/engine/cli/main.ts" chat --persona "$PERSONA"
else
  exec npx tsx --tsconfig "$FRAMEWORK_DIR/tsconfig.json" "$FRAMEWORK_DIR/engine/cli/main.ts" chat
fi

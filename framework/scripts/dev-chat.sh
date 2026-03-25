#!/usr/bin/env bash
#
# Launches a local dev chat session against a temporary workspace.
# No ports are opened — chat mode is a local TUI only.
# Safe to run alongside a live protege agent.
#
# Usage: ./scripts/dev-chat.sh [persona-display-name]

set -euo pipefail

FRAMEWORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
DISPLAY_NAME="${1:-Dev Agent}"
HQ_SECRETS="$HOME/Projects/protege-hq/.secrets"

echo "Creating temp workspace at $TMP_DIR"

# Read API key from protege-hq secrets
if [ ! -f "$HQ_SECRETS" ]; then
  echo "Error: $HQ_SECRETS not found. Cannot resolve inference API key."
  exit 1
fi
ANTHROPIC_KEY="$(grep '^ANTHROPIC_API_KEY=' "$HQ_SECRETS" | cut -d'=' -f2-)"
if [ -z "$ANTHROPIC_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY not found in $HQ_SECRETS."
  exit 1
fi

# Run non-interactive setup
cd "$FRAMEWORK_DIR"
npx tsx engine/cli/main.ts setup \
  --path "$TMP_DIR" \
  --provider anthropic \
  --inference-api-key "$ANTHROPIC_KEY" \
  --outbound relay \
  --web-search-provider none \
  --non-interactive \
  --json

# Override inference config with a stronger model
cat > "$TMP_DIR/configs/inference.json" << 'EOF'
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250514",
  "recursion_depth": 6,
  "max_tool_turns": 20
}
EOF

echo "Using anthropic/claude-sonnet-4-5-20250514"

# Launch chat from the temp workspace
cd "$TMP_DIR"
exec npx tsx --tsconfig "$FRAMEWORK_DIR/tsconfig.json" "$FRAMEWORK_DIR/engine/cli/main.ts" chat

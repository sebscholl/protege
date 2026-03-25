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

# Read the OpenAI API key from protege-hq secrets
if [ ! -f "$HQ_SECRETS" ]; then
  echo "Error: $HQ_SECRETS not found. Cannot resolve inference API key."
  exit 1
fi
OPENAI_KEY="$(grep '^OPENAI_API_KEY=' "$HQ_SECRETS" | cut -d'=' -f2-)"
if [ -z "$OPENAI_KEY" ]; then
  echo "Error: OPENAI_API_KEY not found in $HQ_SECRETS."
  exit 1
fi

# Run non-interactive setup: init + config + persona creation
cd "$FRAMEWORK_DIR"
npx tsx engine/cli/main.ts setup \
  --path "$TMP_DIR" \
  --provider openai \
  --inference-api-key "$OPENAI_KEY" \
  --outbound relay \
  --web-search-provider none \
  --non-interactive \
  --json

# Launch chat from the temp workspace
cd "$TMP_DIR"
exec npx tsx --tsconfig "$FRAMEWORK_DIR/tsconfig.json" "$FRAMEWORK_DIR/engine/cli/main.ts" chat

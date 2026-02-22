#!/usr/bin/env bash

set -euo pipefail

# ─────────────────────────────────────────────────────────────

# codebase-indexer one-line installer

#

# Usage:

#   bash <(curl -fsSL https://raw.githubusercontent.com/ygtdgn/codebase-indexer/main/install.sh)

#   curl -fsSL https://raw.githubusercontent.com/ygtdgn/codebase-indexer/main/install.sh | bash

# ─────────────────────────────────────────────────────────────

# ── Colors ───────────────────────────────────────────────────

BOLD='\033[1m'

DIM='\033[2m'

RED='\033[0;31m'

GREEN='\033[0;32m'

YELLOW='\033[0;33m'

CYAN='\033[0;36m'

ORANGE='\033[38;5;208m'

RESET='\033[0m'

# ── Helpers ──────────────────────────────────────────────────

# When piped via curl | bash, stdin is the script itself.

# Redirect interactive reads from /dev/tty so prompts still work.

prompt_read() {

local var_name="$1"

shift

# shellcheck disable=SC2229

read "$@" "${var_name}" </dev/tty

}

print_mascot() {

local mood="$1"

local message="$2"

local face

case "$mood" in

welcome)  face='( •.•)' ;;

success)  face='( ^.^)' ;;

error)    face='( ×.×)' ;;

*)        face='( °.°)' ;;

esac

echo ""

echo -e "  ${ORANGE}  /\\_/\\${RESET}"

echo -e "  ${ORANGE} ${face}  ${message}${RESET}"

echo -e "  ${ORANGE}⊂/ 🌰 \\⊃${RESET}"

echo -e "  ${ORANGE} /|   |\\${RESET}"

echo ""

}

print_banner() {

echo ""

echo -e "${ORANGE}╭─────────────────────────────────────────────╮${RESET}"

echo -e "${ORANGE}│                                             │${RESET}"

echo -e "${ORANGE}│     /\\_/\\   ${BOLD}codebase-indexer${RESET}${ORANGE}                │${RESET}"

echo -e "${ORANGE}│    ( •.•)  ─────────────────────            │${RESET}"

echo -e "${ORANGE}│  ⊂/ 🌰 \\⊃  Semantic code search            │${RESET}"

echo -e "${ORANGE}│   /|   |\\   powered by AI                   │${RESET}"

echo -e "${ORANGE}│                                             │${RESET}"

echo -e "${ORANGE}╰─────────────────────────────────────────────╯${RESET}"

echo ""

}

info()    { echo -e "${CYAN}ℹ${RESET}  $1"; }

success() { echo -e "${GREEN}✔${RESET}  $1"; }

warn()    { echo -e "${YELLOW}⚠${RESET}  $1"; }

fail()    { echo -e "${RED}✖${RESET}  $1"; }

# ── 1. Banner ────────────────────────────────────────────────

print_banner

# ── 2. Service location ─────────────────────────────────────

echo -e "${BOLD}🖥️  Where are your services (Ollama & Qdrant) running?${RESET}"

echo "   1) On this machine (local setup)"

echo "   2) On a remote machine (I'll provide URLs)"

echo -en "   > "

prompt_read SERVICE_LOCATION

SERVICE_LOCATION="${SERVICE_LOCATION:-1}"

REMOTE_MODE=false

if [ "$SERVICE_LOCATION" = "2" ]; then

REMOTE_MODE=true

fi

echo ""

# ── 3. Prerequisite checks ──────────────────────────────────

MISSING=0

echo -e "${BOLD}Checking prerequisites...${RESET}"

echo ""

# Node.js >= 18

if command -v node &>/dev/null; then

NODE_VERSION=$(node -v | sed 's/^v//')

NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -ge 18 ]; then

success "Node.js v${NODE_VERSION}"

else

warn "Node.js v${NODE_VERSION} found — version 18+ is required"

echo -e "     ${DIM}Install from: https://nodejs.org${RESET}"

MISSING=1

fi

else

fail "Node.js not found"

echo -e "     ${DIM}Install from: https://nodejs.org${RESET}"

MISSING=1

fi

# Docker & Ollama checks — only for local mode

if ! $REMOTE_MODE; then

# Docker

if command -v docker &>/dev/null; then

if docker info &>/dev/null; then

success "Docker is running"

else

warn "Docker is installed but not running"

echo -e "     ${DIM}Start Docker Desktop or run: sudo systemctl start docker${RESET}"

MISSING=1

fi

else

fail "Docker not found"

echo -e "     ${DIM}Install from: https://docs.docker.com/get-docker/${RESET}"

MISSING=1

fi

# Ollama

if curl -sf http://localhost:11434/api/tags &>/dev/null; then

success "Ollama is running"

else

warn "Ollama is not reachable at http://localhost:11434"

echo -e "     ${DIM}Install from: https://ollama.com and run: ollama serve${RESET}"

MISSING=1

fi

else

info "Skipping Docker & Ollama checks (remote mode)"

fi

echo ""

if [ "$MISSING" -ne 0 ]; then

echo -e "${YELLOW}Some prerequisites are missing or not running.${RESET}"

echo -en "Continue anyway? (y/N) "

prompt_read CONTINUE_ANYWAY

if [[ ! "$CONTINUE_ANYWAY" =~ ^[Yy]$ ]]; then

echo ""

fail "Setup cancelled. Install the missing prerequisites and try again."

exit 1

fi

echo ""

fi

# ── 3b. Remote URLs (only for remote mode) ──────────────────

REMOTE_OLLAMA_URL=""

REMOTE_QDRANT_URL=""

if $REMOTE_MODE; then

echo -e "${BOLD}🌐 Enter your remote service URLs${RESET}"

echo ""

while [ -z "$REMOTE_OLLAMA_URL" ]; do

echo -en "   Ollama URL ${DIM}(e.g. http://192.168.1.100:11434)${RESET}: "

prompt_read REMOTE_OLLAMA_URL

if [ -z "$REMOTE_OLLAMA_URL" ]; then

warn "Ollama URL is required."

fi

done

while [ -z "$REMOTE_QDRANT_URL" ]; do

echo -en "   Qdrant URL ${DIM}(e.g. http://192.168.1.100:6333)${RESET}: "

prompt_read REMOTE_QDRANT_URL

if [ -z "$REMOTE_QDRANT_URL" ]; then

warn "Qdrant URL is required."

fi

done

echo ""

fi

# ── 3. Interactive questions ─────────────────────────────────

# Q1: Directory to index

echo -e "${BOLD}📁 Which directory do you want to index?${RESET} ${DIM}(default: .)${RESET}"

echo -en "   > "

prompt_read INDEX_DIR

INDEX_DIR="${INDEX_DIR:-.}"

echo ""

# Q2: Integration targets

echo -e "${BOLD}🤖 Set up integrations for:${RESET}"

echo "   1) Claude Code only"

echo "   2) Codex only"

echo "   3) Both (Claude Code + Codex)"

echo "   4) None (just index)"

echo -en "   > "

prompt_read INTEGRATION_CHOICE

INTEGRATION_CHOICE="${INTEGRATION_CHOICE:-3}"

echo ""

SETUP_CLAUDE=false

SETUP_CODEX=false

case "$INTEGRATION_CHOICE" in

1) SETUP_CLAUDE=true ;;

2) SETUP_CODEX=true ;;

3) SETUP_CLAUDE=true; SETUP_CODEX=true ;;

4) ;; # none

*) SETUP_CLAUDE=true; SETUP_CODEX=true ;;

esac

# Q3: Global vs local (only if an integration was selected)

SETUP_GLOBALLY=false

if $SETUP_CLAUDE || $SETUP_CODEX; then

echo -e "${BOLD}🌐 Install MCP config globally or locally?${RESET}"

echo "   1) Locally (project .mcp.json / .codex/config.toml)"

echo "   2) Globally (~/.claude.json / ~/.codex/config.toml)"

echo -en "   > "

prompt_read SCOPE_CHOICE

SCOPE_CHOICE="${SCOPE_CHOICE:-1}"

echo ""

if [ "$SCOPE_CHOICE" = "2" ]; then

SETUP_GLOBALLY=true

fi

fi

# Q4: Custom config

OLLAMA_URL=""

QDRANT_URL=""

EMBEDDING_MODEL=""

EMBEDDING_DIM=""

COLLECTION_NAME=""

CUSTOM_CONFIG=false

# Pre-fill URLs from remote mode

if $REMOTE_MODE; then

OLLAMA_URL="$REMOTE_OLLAMA_URL"

QDRANT_URL="$REMOTE_QDRANT_URL"

CUSTOM_CONFIG=true

fi

echo -e "${BOLD}⚙️  Do you want to customize connection settings?${RESET} ${DIM}(y/N)${RESET}"

if $REMOTE_MODE; then

echo -e "   ${DIM}(Ollama & Qdrant URLs are already set from remote config)${RESET}"

fi

echo -en "   > "

prompt_read CUSTOMIZE

echo ""

if [[ "$CUSTOMIZE" =~ ^[Yy]$ ]]; then

CUSTOM_CONFIG=true

echo -e "   ${DIM}Press Enter to keep the default value.${RESET}"

echo ""

if ! $REMOTE_MODE; then

echo -en "   Ollama URL ${DIM}(default: http://localhost:11434)${RESET}: "

prompt_read OLLAMA_URL

OLLAMA_URL="${OLLAMA_URL:-}"

echo -en "   Qdrant URL ${DIM}(default: http://localhost:6333)${RESET}: "

prompt_read QDRANT_URL

QDRANT_URL="${QDRANT_URL:-}"

else

echo -e "   Ollama URL: ${GREEN}${OLLAMA_URL}${RESET} ${DIM}(from remote config)${RESET}"

echo -e "   Qdrant URL: ${GREEN}${QDRANT_URL}${RESET} ${DIM}(from remote config)${RESET}"

fi

echo -en "   Embedding Model ${DIM}(default: qwen3-embedding:0.6b)${RESET}: "

prompt_read EMBEDDING_MODEL

EMBEDDING_MODEL="${EMBEDDING_MODEL:-}"

echo -en "   Embedding Dimension ${DIM}(default: 512)${RESET}: "

prompt_read EMBEDDING_DIM

EMBEDDING_DIM="${EMBEDDING_DIM:-}"

echo -en "   Collection Name ${DIM}(default: codebase)${RESET}: "

prompt_read COLLECTION_NAME

COLLECTION_NAME="${COLLECTION_NAME:-}"

echo ""

fi

# ── 4. Build command flags ───────────────────────────────────

INIT_FLAGS=""

INDEX_FLAGS=""

# Custom config flags (shared by both init and index)

if [ -n "$OLLAMA_URL" ]; then

INIT_FLAGS="$INIT_FLAGS --ollama-url $OLLAMA_URL"

INDEX_FLAGS="$INDEX_FLAGS --ollama-url $OLLAMA_URL"

fi

if [ -n "$QDRANT_URL" ]; then

INIT_FLAGS="$INIT_FLAGS --qdrant-url $QDRANT_URL"

INDEX_FLAGS="$INDEX_FLAGS --qdrant-url $QDRANT_URL"

fi

if [ -n "$EMBEDDING_MODEL" ]; then

INDEX_FLAGS="$INDEX_FLAGS --model $EMBEDDING_MODEL"

fi

if [ -n "$EMBEDDING_DIM" ]; then

INDEX_FLAGS="$INDEX_FLAGS --dim $EMBEDDING_DIM"

fi

if [ -n "$COLLECTION_NAME" ]; then

INDEX_FLAGS="$INDEX_FLAGS --collection $COLLECTION_NAME"

fi

# Setup flags

if $SETUP_CLAUDE; then

INDEX_FLAGS="$INDEX_FLAGS --setup-claude"

fi

if $SETUP_CODEX; then

INDEX_FLAGS="$INDEX_FLAGS --setup-codex"

fi

if $SETUP_GLOBALLY; then

INDEX_FLAGS="$INDEX_FLAGS --setup-globally"

fi

# ── 5. Run init (local mode only) ────────────────────────────

if ! $REMOTE_MODE; then

echo -e "${BOLD}Step 1/2:${RESET} Setting up Qdrant & checking Ollama..."

echo -e "${DIM}  → npx codebase-indexer init${INIT_FLAGS}${RESET}"

echo ""

# shellcheck disable=SC2086

npx codebase-indexer init $INIT_FLAGS

echo ""

fi

# ── 6. Run index ─────────────────────────────────────────────

if $REMOTE_MODE; then

echo -e "${BOLD}Step 1/1:${RESET} Indexing ${INDEX_DIR}..."

else

echo -e "${BOLD}Step 2/2:${RESET} Indexing ${INDEX_DIR}..."

fi

echo -e "${DIM}  → npx codebase-indexer index ${INDEX_DIR}${INDEX_FLAGS}${RESET}"

echo ""

# shellcheck disable=SC2086

npx codebase-indexer index "$INDEX_DIR" $INDEX_FLAGS

echo ""

# ── 7. Save custom config if provided ────────────────────────

if $CUSTOM_CONFIG; then

CONFIG_DIR="${HOME}/.codebase-indexer"

CONFIG_FILE="${CONFIG_DIR}/config.json"

mkdir -p "$CONFIG_DIR"

# Build JSON — only include fields the user actually provided

JSON="{"

FIRST=true

add_json_field() {

local key="$1" value="$2"

if [ -n "$value" ]; then

if ! $FIRST; then JSON="$JSON,"; fi

JSON="$JSON \"$key\": \"$value\""

FIRST=false

fi

  }

add_json_number() {

local key="$1" value="$2"

if [ -n "$value" ]; then

if ! $FIRST; then JSON="$JSON,"; fi

JSON="$JSON \"$key\": $value"

FIRST=false

fi

  }

add_json_field "ollamaUrl" "$OLLAMA_URL"

add_json_field "qdrantUrl" "$QDRANT_URL"

add_json_field "model" "$EMBEDDING_MODEL"

add_json_number "embeddingDim" "$EMBEDDING_DIM"

add_json_field "collectionName" "$COLLECTION_NAME"

JSON="$JSON }"

if [ "$JSON" != "{ }" ]; then

echo "$JSON" > "$CONFIG_FILE"

success "Custom config saved to ${CONFIG_FILE}"

fi

fi

# ── 8. Summary ───────────────────────────────────────────────

print_mascot "success" "All done! Your codebase is indexed."

echo -e "${BOLD}  Setup Summary${RESET}"

echo -e "  ─────────────────────────────────────────"

if $REMOTE_MODE; then

echo -e "  Mode:          ${CYAN}Remote${RESET}"

else

echo -e "  Mode:          ${CYAN}Local${RESET}"

fi

echo -e "  Directory:     ${GREEN}${INDEX_DIR}${RESET}"

echo -e "  Ollama URL:    ${DIM}${OLLAMA_URL:-http://localhost:11434}${RESET}"

echo -e "  Qdrant URL:    ${DIM}${QDRANT_URL:-http://localhost:6333}${RESET}"

echo -e "  Model:         ${DIM}${EMBEDDING_MODEL:-qwen3-embedding:0.6b}${RESET}"

echo -e "  Dimension:     ${DIM}${EMBEDDING_DIM:-512}${RESET}"

echo -e "  Collection:    ${DIM}${COLLECTION_NAME:-codebase}${RESET}"

if $SETUP_CLAUDE || $SETUP_CODEX; then

INTEGRATIONS=""

$SETUP_CLAUDE && INTEGRATIONS="Claude Code"

$SETUP_CODEX && { [ -n "$INTEGRATIONS" ] && INTEGRATIONS="$INTEGRATIONS + Codex" || INTEGRATIONS="Codex"; }

SCOPE=$($SETUP_GLOBALLY && echo "global" || echo "local")

echo -e "  Integrations:  ${GREEN}${INTEGRATIONS}${RESET} ${DIM}(${SCOPE})${RESET}"

fi

echo -e "  ─────────────────────────────────────────"

echo ""

echo -e "${BOLD}  Quick Start${RESET}"

echo -e "  ${DIM}npx codebase-indexer search \"your query\"${RESET}   Search your code"

echo -e "  ${DIM}npx codebase-indexer status${RESET}                 Check service health"

echo -e "  ${DIM}npx codebase-indexer config${RESET}                 Edit settings"

echo ""
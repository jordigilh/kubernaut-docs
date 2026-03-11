#!/usr/bin/env bash
set -euo pipefail

# Fetch the Kubernaut Helm chart README from GitHub for snippet inclusion.
# Used by CI (deploy-docs.yml) and local development (mkdocs serve).
#
# Usage:
#   ./scripts/fetch-chart-readme.sh [branch]
#
# Default branch: main

REPO="jordigilh/kubernaut"
BRANCH="${1:-main}"
SOURCE_PATH="charts/kubernaut/README.md"
TARGET_DIR="_includes"
TARGET_FILE="${TARGET_DIR}/chart-readme.md"

mkdir -p "${TARGET_DIR}"

echo "Fetching ${SOURCE_PATH} from ${REPO}@${BRANCH}..."

if command -v gh &>/dev/null; then
    gh api "repos/${REPO}/contents/${SOURCE_PATH}?ref=${BRANCH}" \
        --jq '.content' | base64 -d > "${TARGET_FILE}"
elif command -v curl &>/dev/null; then
    curl -fsSL "https://raw.githubusercontent.com/${REPO}/${BRANCH}/${SOURCE_PATH}" \
        -o "${TARGET_FILE}"
else
    echo "ERROR: Neither gh nor curl found. Install one to fetch the chart README." >&2
    exit 1
fi

echo "Saved to ${TARGET_FILE} ($(wc -c < "${TARGET_FILE}") bytes)"

#!/bin/bash
# Setup script for sensitive data detection git hooks
# Mirrors kubernaut/scripts/setup-githooks.sh for the docs repo

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Setting up sensitive data detection git hooks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")

echo "📂 Configuring git hooks path..."
git config core.hooksPath "$GIT_ROOT/.githooks"

echo "🔐 Making hooks executable..."
chmod +x "$GIT_ROOT/.githooks/pre-commit"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Git hooks configured successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Pre-commit hook will now detect:"
echo "   • Sensitive files (keys, credentials, tokens)"
echo "   • Cloud provider API endpoints in staged changes"
echo "   • Cloud project/account identifiers"
echo "   • Well-known API key formats (OpenAI, GitHub, AWS, Slack)"
echo "   • Credential file paths"
echo "   • Passwords and tokens in config"
echo ""
echo "🧪 Test the hook with: git commit (on any staged files)"
echo ""

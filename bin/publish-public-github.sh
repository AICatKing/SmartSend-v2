#!/usr/bin/env bash
set -euo pipefail

repo_name="${1:-$(basename "$PWD")}"
commit_message="${2:-Initial commit}"

# Avoid inheriting a broken local proxy into gh/git network calls.
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not installed." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is required but not installed." >&2
  exit 1
fi

if [ ! -d .git ]; then
  git init -b main
fi

if [ ! -f README.md ]; then
  printf "# %s\n" "$repo_name" > README.md
fi

git add -A

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git commit -m "$commit_message"
elif ! git diff --cached --quiet; then
  git commit -m "$commit_message"
fi

if ! gh auth status >/dev/null 2>&1; then
  gh auth login -h github.com --git-protocol https --web
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$repo_name" --public --source=. --remote=origin --push
else
  git push -u origin main
fi


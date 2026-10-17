#!/usr/bin/env bash
# Push the current commit, rebasing onto any commits another refresh job pushed
# meanwhile ("rejected (fetch first)"). Retries with a short backoff.
set -u
branch="${GITHUB_REF_NAME:-main}"
for i in 1 2 3 4 5; do
  if git pull --rebase --autostash origin "$branch" && git push origin "HEAD:$branch"; then
    exit 0
  fi
  echo "Push attempt $i failed; retrying in $((i * 5))s"
  git rebase --abort 2>/dev/null || true
  sleep $((i * 5))
done
echo "Could not push after 5 attempts" >&2
exit 1

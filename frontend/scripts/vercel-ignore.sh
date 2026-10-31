#!/bin/sh
# Vercel "Ignored Build Step" (see vercel.json). Exit 0 = skip build, exit 1 = build.
# Goal: stay under the Hobby deployment limit. Any doubt or error builds.
ref="$VERCEL_GIT_COMMIT_REF"
prod_url="$VERCEL_PROJECT_PRODUCTION_URL"

# Legacy projects (KSV legacy, JK) share this root directory but only ship main.
case "$prod_url" in
  ""|*campspilot*) ;;
  *)
    if [ "$ref" = "main" ]; then exit 1; fi
    echo "Legacy project ($prod_url): only main is built, skipping $ref"
    exit 0
    ;;
esac

# CampsPilot: skip when nothing under frontend/ changed since the last deployment of this branch.
prev="$VERCEL_GIT_PREVIOUS_SHA"
if [ -n "$prev" ] && git cat-file -e "$prev^{commit}" 2>/dev/null; then
  if git diff --quiet "$prev" HEAD -- . ; then
    echo "No frontend change since $prev, skipping"
    exit 0
  fi
fi
exit 1

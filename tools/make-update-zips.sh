#!/usr/bin/env bash
# Builds the two upload zips (app + admin site) from every file that changed since the version that is live.
#
#   tools/make-update-zips.sh                 # compares with the newest "deployed-*" git tag
#   tools/make-update-zips.sh deployed-2026-11-27
#   tools/make-update-zips.sh <any git commit or tag>
#
# It compares that version with the files as they are on this computer now (saved changes count,
# even if not committed yet). Config files with passwords and keys are NEVER put in the zips.
# The zips are named rhb-update-N.zip / rhs-admin-update-N.zip (next free number) in the repo folder.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"   # run it from anywhere inside the repository

BASE="${1:-$(git tag --list 'deployed-*' --sort=-creatordate | head -n 1)}"
if [ -z "$BASE" ]; then
  echo "Which version is live? Give a git tag or commit, e.g.:  tools/make-update-zips.sh deployed-2026-11-27" >&2
  exit 1
fi
git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null || { echo "Unknown git version: $BASE" >&2; exit 1; }

# Files that hold server settings or are not part of the website: never uploaded by a zip.
skip() {
  case "$1" in
    RealityHealthBridge-WebHost/api/config.php|RealityHealthBridge-WebHost/api/payment-config.php) return 0 ;;
    RealityHealthBridge-WebHost/config.js) return 0 ;;   # holds the live email-service URL; edit on the server
    RHS-Admin/app/config.php) return 0 ;;
    */database/*|*/apps-script/*|*/docs/*|*.md|*.txt) return 0 ;;
  esac
  return 1
}

changed=$( { git diff --name-only --diff-filter=ACMR "$BASE" --; git ls-files --others --exclude-standard; } | sort -u)
deleted=$(git diff --name-only --diff-filter=D "$BASE" -- | sort -u)

app=(); admin=(); held=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if skip "$f"; then held+=("$f"); continue; fi
  case "$f" in
    RealityHealthBridge-WebHost/*) app+=("${f#RealityHealthBridge-WebHost/}") ;;
    RHS-Admin/*)                   admin+=("${f#RHS-Admin/}") ;;
  esac
done <<< "$changed"

next() { # next free number for $1-N.zip
  local n=0 f
  for f in "$1"-*.zip; do [ -e "$f" ] || continue; f=${f#"$1"-}; f=${f%.zip}; [[ $f =~ ^[0-9]+$ ]] && (( f > n )) && n=$f; done
  echo $((n + 1))
}

echo "Comparing with: $BASE"
if [ ${#app[@]} -gt 0 ]; then
  z="rhb-update-$(next rhb-update).zip"
  (cd RealityHealthBridge-WebHost && zip -qX "../$z" "${app[@]}")
  echo; echo "APP  -> $z  (extract into /public_html/hrb.truehome.com.ug)"; printf '   %s\n' "${app[@]}"
else echo; echo "APP: nothing changed"; fi
if [ ${#admin[@]} -gt 0 ]; then
  z="rhs-admin-update-$(next rhs-admin-update).zip"
  (cd RHS-Admin && zip -qX "../$z" "${admin[@]}")
  echo; echo "ADMIN -> $z  (extract into /public_html/bhr-admin.truehome.com.ug)"; printf '   %s\n' "${admin[@]}"
else echo; echo "ADMIN: nothing changed"; fi

sql=$(printf '%s\n' "$changed" | grep -E '/database/update-[0-9]+.*\.sql$' || true)
[ -n "$sql" ] && { echo; echo "DATABASE UPDATES to run in phpMyAdmin (read the top of each file for before/after):"; printf '   %s\n' $sql; }
other=$(printf '%s\n' "${held[@]:-}" | grep -vE '/database/|\.md$|^$' || true)
[ -n "$other" ] && { echo; echo "NOT in the zips (settings files: change these by hand on the server if needed):"; printf '   %s\n' $other; }
[ -n "$deleted" ] && { echo; echo "DELETED since $BASE (remove these on the server by hand if they are website files):"; printf '   %s\n' $deleted; }
echo

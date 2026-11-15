#!/bin/bash
# PostToolUse hook (Write|Edit): run Prettier on the file just written, so formatting
# never costs a turn and the pre-commit `prettier --check` never fails. Files Prettier
# doesn't know (or ignores via .prettierignore) are left alone.
set -uo pipefail

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -n "$f" ] && [ -f "$f" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:?}" || exit 0
bin="$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier"
[ -x "$bin" ] || exit 0

# Tell Claude when the file changed: its copy is now stale, and an exact-match Edit
# built from the old text would miss.
before=$(md5sum "$f" 2>/dev/null)
"$bin" --write --ignore-unknown --log-level silent "$f" || exit 0
if [ "$before" != "$(md5sum "$f" 2>/dev/null)" ]; then
  jq -n --arg c "Prettier reformatted $f after your edit. Re-read the parts you will edit next before matching on them." \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
fi
exit 0

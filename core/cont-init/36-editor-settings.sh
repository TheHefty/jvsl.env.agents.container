#!/usr/bin/env bash
# custom-cont-init.d script: lets the image's editor settings reach an editor
# that already exists.
#
# **Dev Containers writes the editor's Machine settings once.** It merges the
# settings the devcontainer.metadata label carries into
# /config/.vscode-server/data/Machine/settings.json when that file is absent,
# and that file lives in /config, the project's persistent volume, so it
# outlives every container. A stack's setting added or changed later never
# arrived. Measured in kotodori on 2026-10-29: java.jdt.ls.vmargs and
# java.server.launchMode were in the image's metadata and absent from Machine
# settings, so the Java language server ran with -Xmx2G and a syntax server;
# put there by hand, both were honoured at once. Debt rjj.
#
# **So every boot writes the image's settings, yielding to the developer's.**
# For each key the image's metadata sets, later entries winning:
#   absent                          written
#   equal to the image's value      only recorded
#   equal to what this last wrote   the image changed it: the new value written
#   anything else                   the developer's, from Remote Settings: kept,
#                                   and said once per value
# What it last wrote, and what it last said it kept, are recorded beside the
# settings in .jvsl-settings.json. A key the image no longer sets is left alone.
#
# **A settings.json it cannot read is never touched.** VS Code accepts comments
# and trailing commas; jq does not, and a half-written file is no better.
# Rewriting either would cost the developer every setting, so it is left byte
# for byte and the line says why. The write goes to a file beside it and is
# moved into place, so an interrupted boot leaves the old file whole.
#
# Runs as root before privileges drop. **Every write is abc's**: this is the
# editor's own state directory (see 10-state-ownership.sh).
#
# EDITOR_METADATA and EDITOR_MACHINE_DIR are overridable so
# 36-editor-settings.test.sh drives this very script.
set -euo pipefail

METADATA="${EDITOR_METADATA:-/opt/jvsl/devcontainer-metadata.json}"
MACHINE="${EDITOR_MACHINE_DIR:-/config/.vscode-server/data/Machine}"
SETTINGS="$MACHINE/settings.json"
RECORD="$MACHINE/.jvsl-settings.json"

say() { echo "[36-editor-settings] $*"; }
as_abc() { s6-setuidgid abc "$@"; }
# Written as abc through a file beside the target, then moved over it.
put() {
    local tmp="$1.tmp.$$"
    printf '%s\n' "$2" | as_abc tee "$tmp" >/dev/null
    as_abc mv -f "$tmp" "$1"
}

if [ ! -f "$METADATA" ]; then
    say "the image has no $METADATA, so its editor settings cannot be written; the editor keeps the ones it has. Rebuild the image with a current extension."
    exit 0
fi

image="$(jq -c '[.[] | .customizations.vscode.settings // {}] | add // {}' "$METADATA")"
[ "$image" = "{}" ] && exit 0

if [ ! -s "$SETTINGS" ]; then
    current='{}'
elif ! current="$(jq -ce 'if type == "object" then . else error("not an object") end' "$SETTINGS" 2>/dev/null)"; then
    say "left $SETTINGS as it is: it is not plain JSON (comments, trailing commas, or half-written), and rewriting it could cost every setting in it. The image's editor settings were not written; add them in Remote Settings, or make the file plain JSON."
    exit 0
fi
record="$(jq -ce 'if type == "object" then . else {} end' "$RECORD" 2>/dev/null || echo '{}')"

result="$(jq -cn --argjson img "$image" --argjson cur "$current" --argjson rec "$record" '
    ($rec.written // {}) as $written | ($rec.kept // {}) as $kept
    | reduce ($img | to_entries[]) as $e ({s: $cur, written: $written, kept: $kept, lines: []};
        $e.key as $k | $e.value as $v
        | if (.s | has($k) | not) then
            .s[$k] = $v | .written[$k] = $v | del(.kept[$k]) | .lines += ["wrote \($k): new from the image"]
          elif .s[$k] == $v then
            .written[$k] = $v | del(.kept[$k])
          elif ($written | has($k)) and .s[$k] == $written[$k] then
            .s[$k] = $v | .written[$k] = $v | del(.kept[$k]) | .lines += ["wrote \($k): the image changed its value"]
          else
            (if (.kept | has($k)) and .kept[$k] == .s[$k] then .
             else .lines += ["kept \($k): it was changed in Remote Settings, so the image value is not written over it; remove the key there to take the image value"]
             end) | .kept[$k] = .s[$k]
          end)')"

new_settings="$(jq --indent 4 '.s' <<<"$result")"
new_record="$(jq -c '{written, kept}' <<<"$result")"

as_abc mkdir -p "$MACHINE"
[ "$(jq -cS . <<<"$new_settings")" = "$(jq -cS . <<<"$current")" ] || put "$SETTINGS" "$new_settings"
[ "$(jq -cS . <<<"$new_record")" = "$(jq -cS . <<<"$record")" ] || put "$RECORD" "$new_record"
jq -r '.lines[]' <<<"$result" | while IFS= read -r line; do say "$line"; done

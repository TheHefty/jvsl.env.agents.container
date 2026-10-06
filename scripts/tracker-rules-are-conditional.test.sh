#!/usr/bin/env bash
# The normative documents' tracker rules: present, conditional, and the same in
# both languages.
#
# **These documents ship to every project, and most never opt into a tracker.**
# A `bd` command that escapes its condition is an instruction a project without
# `.beads/` will follow: it runs `bd`, gets an error, and "fixes" it with
# `bd init`, which writes into the person's repository. So every `bd` command in
# the normative documents must sit in a section whose first paragraph states the
# condition.
#
# **The parity check compares files, headings and links, not meaning.** The set
# of `bd` commands each language names is the one part of the meaning a script
# can compare, so it must be identical.
#
# **And the rules the story agreed must be there**: reporting what is
# unblocked, claiming agreed work, closing with a reason, and recording a found
# problem as a `defect` only after a yes. See
# docs/PLANNING/beads-tracks-the-work/the-agent-works-from-the-tracker/.
#
# TRACKER_RULES_ROOT points this at another docs/agent tree, which is how the
# failure cases below are proven to fail.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${TRACKER_RULES_ROOT:-$HERE/../docs/agent}"

# The condition, as each language states it at the top of a tracker passage.
declare -A CONDITION=([en]='has a tracker' [pt-BR]='tem rastreador')
# What the story agreed the rules must say, as the commands that say it.
REQUIRED=('bd ready' 'bd update --claim' 'bd close --reason' 'bd create --type bug --labels defect' 'bd dolt push')

failures=0
fail() { echo "FAIL $*" >&2; failures=$((failures + 1)); }

# Prints "<file>:<line>: <command>" for each `bd …` in inline code, with the
# command reduced to its plain words and flags: placeholders and quoted values
# are dropped, so `bd close <id> --reason "…"` reads as `bd close --reason`.
commands_in() {
    grep -noE '`bd [^`]*`' "$@" 2>/dev/null \
        | sed -E 's/`//g' \
        | awk -F: '{
            file=$1; line=$2; cmd=substr($0, length(file) + length(line) + 3)
            n=split(cmd, w, " "); out=""
            for (i = 1; i <= n; i++) {
                if (w[i] ~ /^(bd|[a-z][a-z-]*|--[a-z][a-z-]*)$/) out = out (out ? " " : "") w[i]
            }
            print file ":" line ": " out
        }'
}

# Prints the first paragraph of the section that contains line $2 of file $1.
section_opening() {
    awk -v target="$2" '
        /^#{1,6} / { start = NR; para = ""; inpara = 0; done = 0; next }
        start && !done {
            if ($0 ~ /^[[:space:]]*$/) { if (inpara) done = 1 }
            else { inpara = 1; para = para " " $0 }
        }
        NR == target { print para; exit }
    ' "$1"
}

declare -A SETS
for lang in en pt-BR; do
    dir="$ROOT/$lang"
    [ -d "$dir" ] || { fail "$dir does not exist, so there is nothing to check"; continue; }
    found="$(commands_in "$dir"/*.md || true)"
    set_for_lang=""
    while IFS= read -r hit; do
        [ -n "$hit" ] || continue
        file="${hit%%:*}"; rest="${hit#*:}"; line="${rest%%:*}"; cmd="${rest#*: }"
        opening="$(section_opening "$file" "$line")"
        case "$opening" in
            *"${CONDITION[$lang]}"*) ;;
            *) fail "$lang: \`$cmd\` at $(basename "$file"):$line is in a section whose first paragraph \
does not say '${CONDITION[$lang]}'. A project without a tracker would follow it." ;;
        esac
        set_for_lang+="$cmd"$'\n'
    done <<< "$found"
    SETS[$lang]="$(printf '%s' "$set_for_lang" | sort -u)"
    for need in "${REQUIRED[@]}"; do
        printf '%s\n' "${SETS[$lang]}" | grep -qxF -- "$need" \
            || fail "$lang: the rules never name \`$need\`, which the story's scenarios require"
    done
done

if [ "${SETS[en]:-}" != "${SETS[pt-BR]:-}" ]; then
    fail "English and Portuguese name different bd commands:"
    diff <(printf '%s\n' "${SETS[en]:-}") <(printf '%s\n' "${SETS[pt-BR]:-}") | sed 's/^/        /' >&2 || true
fi

echo
if [ "$failures" -eq 0 ]; then
    echo "tracker-rules-are-conditional.test: the tracker rules are present, conditional, and the same in both languages."
else
    echo "tracker-rules-are-conditional.test: $failures failure(s)." >&2
    exit 1
fi

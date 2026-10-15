#!/usr/bin/env bash
# custom-cont-init.d script: lets a stack added later bring its extension.
#
# **Dev Containers installs the image's extensions once.** It installs every
# extension the devcontainer.metadata label names, then writes
# .installExtensionsMarker in the editor's machine data and skips the
# installation on every later container that finds it. That data lives in
# /config, the project's persistent volume, so the marker outlives every
# container. A stack selected after the first container never brought its
# extension. Measured on chip8 on 2026-10-14: the label named clangd, the
# marker predated the image, and only core's three extensions were installed.
# Debt a-stack-added-later-never-brings-its-extension.
#
# **So the marker goes when the list changes, and only then.** The image carries
# its composed metadata at /opt/jvsl/devcontainer-metadata.json, because a
# container cannot read its own image's labels. This compares that file's
# extension list, sorted, with the one recorded at the last boot. If it
# differs, the marker is removed and the list recorded. Dev Containers then
# installs what is missing and keeps what is installed. If nothing changed,
# nothing is touched; removing the marker on every boot would make every attach
# try to install everything again.
#
# Runs as root before privileges drop. **Every write is abc's**, because this
# is the editor's own state directory, and a root-owned file in it is the
# defect 10-state-ownership.sh exists to repair.
#
# EXTENSIONS_METADATA and EDITOR_MACHINE_DIR are overridable so
# 35-editor-extensions.test.sh drives this very script.
set -euo pipefail

METADATA="${EXTENSIONS_METADATA:-/opt/jvsl/devcontainer-metadata.json}"
MACHINE="${EDITOR_MACHINE_DIR:-/config/.vscode-server/data/Machine}"
RECORD="$MACHINE/.jvsl-extensions"
MARKER="$MACHINE/.installExtensionsMarker"

say() { echo "[35-editor-extensions] $*"; }
as_abc() { s6-setuidgid abc "$@"; }

if [ ! -f "$METADATA" ]; then
    say "the image has no $METADATA, so a stack added later cannot be noticed; extensions are left as the editor installed them. Rebuild the image with a current extension."
    exit 0
fi

wanted="$(jq -r '[.[] | .customizations.vscode.extensions[]?] | unique | .[]' "$METADATA")"
recorded="$(cat "$RECORD" 2>/dev/null || true)"

[ "$wanted" = "$recorded" ] && exit 0

as_abc mkdir -p "$MACHINE"
if [ -e "$MARKER" ]; then
    added="$(comm -13 <(printf '%s\n' "$recorded") <(printf '%s\n' "$wanted") | tr '\n' ' ')"
    as_abc rm -f "$MARKER"
    say "the image's extensions changed (new: ${added:-none}); the editor will install what is missing on its next attach."
fi
printf '%s\n' "$wanted" | as_abc tee "$RECORD" >/dev/null

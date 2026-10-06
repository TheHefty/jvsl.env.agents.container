#!/bin/sh
# A stand-in for `bd`, faithful to the one behaviour booted.test.sh depends on.
#
# **Measured from the real binary, not guessed.** Run twice in a directory that
# already has a tracker, `bd init` exits 1 and aborts with advice about a corrupt
# database; with `--init-if-missing` it prints "Skipping init: workspace already
# initialized" and exits 0. The hook runs on every boot, so that difference is
# the difference between a container that starts and one that does not.
#
# Without this, the stand-in would create the directory every time and the
# assertion about a second boot would pass against a hook that had the defect.
set -u

if [ "${1:-}" = "-C" ]; then
    cd "$2" || exit 1
    shift 2
fi

if [ -d .beads ]; then
    case " $* " in
        *" --init-if-missing "*) exit 0 ;;
        *) echo "bd: workspace already initialized" >&2; exit 1 ;;
    esac
fi

mkdir -p .beads

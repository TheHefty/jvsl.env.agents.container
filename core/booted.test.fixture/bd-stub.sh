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
# **`-C` refuses a directory that is not already a project**, which is why the
# hook uses `cd` and why this reproduces that too: a stand-in that accepted `-C`
# for creation would have passed a hook that could not create anything.
set -u

if [ "${1:-}" = "-C" ]; then
    cd "$2" || exit 1
    shift 2
    [ -d .beads ] || { echo "bd: cannot use -C directory: no beads project found" >&2; exit 1; }
fi

if [ -d .beads ]; then
    case " $* " in
        *" --init-if-missing "*) exit 0 ;;
        *) echo "bd: workspace already initialized" >&2; exit 1 ;;
    esac
fi

mkdir -p .beads

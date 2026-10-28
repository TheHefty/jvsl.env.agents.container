# shellcheck shell=bash
# Sourced by the retro's tests: a journal body in the shape journal-write
# accepts, with any one part replaceable.
#   body [what-i-learned] [decided-alone] [blog: yes|no] [left-open]
body() {
    local learned="${1-The export reads labels as null when there are none.}"
    local alone="${2-Nothing.}" blog="${3:-no}" left="${4:-- the second half of the migration}"
    cat <<MD
## Discovered
### bd prints labels as null, not as an empty list
How it was found: the fixture of planning-brief had [] and the real export had null.
Why it matters: a script testing for [] reads every unlabelled item wrong.
Blog candidate: $blog
## Surprised
A closed item can still be updated.
## Went wrong
The first image check listed before accepting.
## Decided alone
$alone
## What I learned
$learned
## Left open
$left
## Links
- #240
MD
}

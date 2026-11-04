# shellcheck shell=bash
# Sourced by the retro's tests: a journal body in the shape journal-write
# accepts, with any one part replaceable.
#   body [what-i-want-to-learn] [decided-alone] [blog: yes|no] [left-open] [elaboration]
body() {
    local learned="${1-The export reads labels as null when there are none.}"
    local alone="${2-Nothing.}" blog="${3:-no}" left="${4:-- the second half of the migration}"
    local about="${5-Written by the agent.
bd exports labels as null when an item has none, and planning-brief reads them with jq. Read about the alternative operator of jq next.}"
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
## What I want to learn
$learned
## On what I want to learn
$about
## Left open
$left
## Links
- #240
MD
}

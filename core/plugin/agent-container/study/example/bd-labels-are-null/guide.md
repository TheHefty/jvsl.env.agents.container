# bd prints labels as null, not as an empty list

## The problem

A script reading `bd export` that tests for an empty list of labels reads every unlabelled item wrong.

## Fundamentals

JSON has two ways to say "nothing here": `null` and `[]`. They are different values, and `jq` treats them differently: `.labels | length` is `0` for both, but `.labels | index("x")` fails on `null`.

## What goes wrong without it

A filter like `select(.labels | index("proposed") | not)` throws on the first unlabelled item, and with `|| true` around it the script reads nothing at all.

## How the project solves it

Every reader defaults the field first: `(.labels // [])`, in `core/plugin/agent-container/bin/planning-brief`, `planning-check` and `review-list`. The test fixture, `core/plugin/agent-container/bin/tracker-fixture.sh`, writes `null` exactly as bd 1.3.1 does.

## Trade-offs

- Recorded: the fixture follows the measured output, not the documentation (`src/board/board-read.ts`).
- Implicit: none.
- Agent discovery: the first fixture used `[]`, and every test passed against output bd never prints.

## Sources

- jq manual, "Alternative operator `//`".
- bd 1.3.1 source, the export's JSON encoder.

## Points for the post

- The central idea: test against what the tool prints, measured, not what its schema suggests.
- Confirm on the next bd release whether `labels` is still `null`.

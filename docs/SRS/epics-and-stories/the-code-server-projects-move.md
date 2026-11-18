# Epic: the code-server projects move

**Projects built on the code-server template move to the extension's format.**

Agreed at the SRS gate on 2026-10-07, for `fahrenheit404`, `gosnip` and `kotodori`. The epic closes
when one command takes such a project to having no submodule, instructions that do not import from it,
and its planning and debts in its own tracker, with its container state intact.

| # | Story | Why in that order |
|---|---|---|
| 1 | the files move on the host | FR-123, FR-124, FR-127 — the submodule, the manifest, the imports, and the pre-commit's check; no container needed |
| 2 | the planning moves into the tracker | FR-125, FR-126, FR-128 — the migration generalised to these projects' layouts and vocabulary, shipped in the image, and carried on when it stops part-way |
| 3 | the command carries a project across | FR-122 — the plan, the confirmation, the container recreated, the migration run inside it, and the folders deleted |
| 4 | the rules describe planning in the tracker | FR-129 — where epics, stories, tasks and an executable `.feature` live once the planning is in the tracker, in both languages |

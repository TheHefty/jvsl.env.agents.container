# Epic: the Work view shows the live work the way the developer asks to see it

**The board and the backlog show what is alive, in the view and with the filter the developer
chooses, and where each item stands in the chain.**

Agreed on 2026-10-30. Of this tracker's 233 items, 210 were closed, and they filled the board's
Closed column and the backlog. Epics, stories, tasks and debts were mixed in one set of columns. The
flow the ceremonies apply was not shown: a story whose tasks are done looked like any other, as did a
task the planning can pick, and a task's pull request was not shown. The filters took one value per
field, with no exclusion and no "all of". Tracked as `jvsl_env_agents_container-nmf`.

**Decided by João Lima, each over a named alternative:**

| | chosen | over |
|---|---|---|
| the board | three views to switch between, as Azure DevOps offers: Tasks, Stories by epic, All items, remembered per project | one board of tasks only; one of stories by epic; every type with a filter |
| the backlog | the live tree, closed hidden by default, with Priority and PR columns | a flat list in the planning's order; the tree as it was, with more columns |
| writing | it still only reads: the ceremonies' scripts keep the chain's rules | buttons calling those scripts; moving cards, which changes the status around the gates |
| filters | several values per field, any or all of them, with exclusion, applied to board and backlog alike | one value per field |

| # | Story | Why in that order |
|---|---|---|
| 1 | closed work stays out of the way | the smallest change, and the one every view below is read through |
| 2 | the board switches between views | the views the developer asked for |
| 3 | the view shows where each item is in the chain | needs the views to have somewhere to show it; the same rules as the ceremonies' scripts |
| 4 | filters combine | applies to every view and to the backlog |

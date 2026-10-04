# Epic: the extension carries the image

**A project installs an extension. There is no template to consume.**

Owned by this repository's [`srs/`](../../srs/) — **FR-81** through **FR-92**, with the decisions
and the costs recorded in the charter's third amendment and the SRS's seventh. Not restated here.

The epic closes when a project has no `.code-server/` submodule, no `setup` on its host and no
second version to keep in step: the extension composes and builds from what it bundles, writes
`CLAUDE.md` and `AGENTS.md` when they are absent, and the image delivers the normative documents to
`/config/.claude/rules/` where they load without an import.

## Stories

| # | Story | Status |
|---|---|---|
| 1 | [`the-image-builds-here`](the-image-builds-here/) | **Done** |
| 2 | [`the-bundle-carries-the-images-content`](the-bundle-carries-the-images-content/) | **Done** — one `@manual` pass owed |
| 3 | [`the-extension-composes-and-builds`](the-extension-composes-and-builds/) | **Done** |
| 4 | [`a-project-needs-nothing-but-the-extension`](a-project-needs-nothing-but-the-extension/) | **Done** |
| 5 | [`the-documents-arrive-with-the-image`](the-documents-arrive-with-the-image/) | **Done** — two `@manual` passes owed |
| 6 | [`opening-a-project-the-extension-chose`](opening-a-project-the-extension-chose/) | Draft |
| 7 | [`creating-a-project-from-nothing`](creating-a-project-from-nothing/) | Draft |
| 8 | [`the-panel`](the-panel/) | Draft |

**The order is fixed by what cannot be verified until the CI exists**, not by preference. Moving
4629 lines of shell into a repository that cannot build an image leaves every later story
unverified, and "it worked in the other repo" is not a result. The panel is last because an entry
offering a capability that does not exist yet is a worse state than no entry.

## What this epic absorbs

`jvsl.env.agents.code-server` is **absorbed and archived** — `core/`, `stacks/`, `scripts/` and
`docs/agent/` move here with their CI, and the archive happens after a green image build here and
never before. Three epics the SRS had named separately become stories under this one: starting a new
project, adopting the template into an existing project, and this. *The agents screen* stays out.

## What it costs, measured

| | |
|---|---|
| shell this repository takes ownership of | 4629 lines — `core/` 3417 in 34 files, `stacks/` 1212 in 39 |
| guards it takes ownership of | 1066 lines in 13 files, each existing because it caught something |
| CI time on a change that touches the image | **7 minutes**, measured here on run `37051487802` — the estimate from the template's own run was 6 |
| CI time before story 1 | under a minute |
| jobs | 5 → **25** |

**The six minutes is the number to hold onto, and it is smaller than it was guessed to be.** An
earlier estimate in this chain said twelve image builds would make the pipeline heavy; the builds
run in parallel and the whole run is six minutes. What makes the fast path still worth moving is
not the total — it is that a typo in a Markdown file has no business waiting for any of it.

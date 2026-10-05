# Epic: the rename left things behind

**The product was renamed, and the leftovers are found by whoever uses it rather than by whatever
tests it.**

The SRS carries the requirements (FR-110 to FR-115) and the epic's reasoning. This directory carries
the stories.

## Why this is an epic and not four commits

**An identity that is wrong does not fail.** That is the single observation under every defect here,
and it is why they were all found by a person:

- a command id that no longer exists resolves to nothing — the palette shows the entry, clicking it
  reports *"command not found"* about an id nobody recognises, and the extension that owns the entry
  is not the one you installed;
- an activation event that matches nothing means the extension never wakes, so it cannot report that
  it did not wake;
- an extension id that changed installs **beside** its predecessor rather than replacing it, and the
  predecessor keeps offering what it can no longer do.

None of those is an error. The system keeps working and says nothing, while somebody follows an
instruction that does nothing. A test cannot see any of it, because there is nothing to fail.

## What was found in one session, 2026-10-05

| what | how it surfaced | where it stands |
|---|---|---|
| three command names in the source | following a palette entry: *"command 'jvsl.devContainer.build' not found"* | fixed, with a guard that reads the prefix out of the manifest so it survives the next rename |
| `HOME` undeclared | `gh` and `claude` failing on `/root/…`, as permission problems about a path nobody chose | fixed — the image declares `remoteEnv.HOME` |
| an older copy still installed | the dead palette entry above was **its** | **story 2** |
| the manifest's name | read, not failed: `.code-server.stack.json`, named for an archived template | **story 1** |

Two more leftovers were found and closed without needing a story: the generated configuration was
shipping inside the `.vsix` with absolute paths in it, and an orphaned release pull request had been
left open by the component name changing under release-please.

## Stories

| # | Story | Status |
|---|---|---|
| 1 | [the manifest is named for the product that reads it](the-manifest-is-named-for-the-product/) | Scenarios written, at its gate |
| 2 | [an older copy of this extension is found and said](an-older-copy-is-found-and-said/) | Scenarios written, at its gate |

## What story 1 must not become

**A rename is the easy half.** Forty-nine occurrences across twenty-nine files is a sweep; the part
that needs design is that the extension has to *act on a file in somebody's repository* — write one,
delete another — against a standing rule that what it did not write is somebody's work.

The rule survives because **the manifest is its own**: written by the configure flow, recognised by
parsing, and left alone when it does not parse. FR-113 draws that line. A task design here satisfies
it rather than restating it.

## What this epic must not do

- **Break activation.** A project with the old name has to be seen, or nothing can tell it anything.
- **Merge two manifests.** A project that has both names keeps the new one and is told about the old.
- **Nag.** The notice about an older copy is said once and blocks nothing.

## Outcome

Open.

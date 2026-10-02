# Outcome

Accepted by João Lima on 2026-10-01, from the grilling that produced it.

What the grilling changed, against what went in:

- **The headline requirement stopped being a stopwatch.** The obvious reading of "the editor
  froze" is a time budget, and it was rejected: the defect was contention, so the requirement is
  that the editor process is never subject to the container's `cpuset` or memory limit, checkable
  by reading a cgroup on any host. A seconds-to-editable threshold either passes everywhere or
  fails in CI for reasons unrelated to the system.
- **Stories are not split along the repository boundary.** Two of the five span both repositories.
  Splitting them would have produced halves nobody can demonstrate, which is the thing a story is
  defined against; the repository is recorded as a marker instead.
- **One story count was reconciled at the gate.** Five stories were settled by behaviour, and a
  later option text listed six by separating "connecting as `abc`" from isolation. Resolved to
  five: connecting as `abc` is what makes opening mean anything, not a behaviour of its own.
- **A bug found during the same testing was kept out of the epic.** `AI_MEMORY_DATA_DIR` and
  `AI_MEMORY_BACKUP_DIR` not surviving the sandbox's `--clearenv` is real and unrelated; it
  becomes its own fix in the template, reproduction first, rather than a sixth story that would
  make the epic's sentence need another "and".
- **The spike moved in front of the stories.** It was going to be a task inside each story that
  needed it; three of the four questions fall out of one experiment, and the image stories cannot
  be grilled without their answers.

The sections above are as written at the gate and were not edited afterwards, except where an
amendment below says otherwise.

## Amendment, 2026-10-02 (seventh)

**The template stops being something a project consumes.** Follows the charter's third amendment;
the reasoning and the costs are there and are not repeated. What this document changes:

| | |
|---|---|
| FR-11 | said "carries `.code-server/`" — names a submodule, not what the flow needs |
| FR-18 | **struck, satisfied absolutely** — FR-71 removed the editor, so there is no port to publish |
| FR-21, FR-22 | **struck** — no submodule to be uninitialized, no second version to disagree with |
| FR-23 | "The extension does not build images" had been struck in the fifth amendment and left in the text |
| FR-63 | **reversed** — composition moves here, with the CI that builds an image per stack |
| FR-65 | `setup`'s interactive path outlived its only caller |
| FR-23 | **reversed too** — the flow builds a missing image instead of refusing it |
| new | **FR-81 – FR-92**, and the epic *the extension carries the image* |
| alternative | *"One repository for the extension and the image"* — **reversed**, accepting both of its costs |
| non-goal | *"the other two flows… are later epics"* — **falls**; the flow merges them in |

**The flow was given after the first draft of this amendment and reshaped it.** Three epics become
one — new project, adoption, and this — and adoption loses its hardest part: it was to detect stacks
by heuristic and have the user confirm, and the flow simply asks the question a new project is asked
when no manifest is found. Nothing to detect wrongly. Two costs arrive with it: the extension
activates with no folder open, so it loads in every window on the host, and the new-project flow is
two-phase because `reopenInContainer` takes no folder and `vscode.openFolder` restarts the extension
host. Both are recorded with the epic.

**`jvsl.env.agents.code-server` is absorbed and archived**, decided by João Lima on 2026-10-02. The
archive happens after a green image build here, never before. The alternative — keeping it as where
that content is authored while this repository vendors it at release — was rejected for preserving
the two release trains the epic exists to remove.

**A correction I owe this document.** The charter's third amendment says *"FR-74 is deleted"*. FR-74
is "the generated configuration declares no variable that only code-server read", which stands and
shipped. The requirement that dies with the minimum template version is **FR-22**, and FR-21 goes
with it. I wrote the wrong number into an accepted charter and it merged; the charter is corrected in
the same change as this.

**And a measurement in this document was false in two places.** It said all sixty-five `apt`
packages exist in trixie under the same names, zero renames, from reading
`packages.debian.org/trixie/<pkg>` — a page that answers 200 whether or not the package is in the
suite. Re-measured with `api.ftp-master.debian.org/madison`: **67 packages, 61 in trixie, 6 from
third-party feeds, one rename**, and three versions no longer offered — `openjdk-17-jdk`, `gcc-11`
and `g++-11` are absent, so java offers 21 and 25 and cpp offers 12, 13 and 14. The template's own
documents were corrected when it was found; this one was not, and a requirements document carrying
a false measurement is worse than one carrying none, because the number looks checked.

## Amendment, 2026-10-02 (sixth)

**FR-7x, and a correction to what the charter said this would cost.** The charter's second amendment
listed five things that "arrive from that base and are installed nowhere in the template" —
s6-overlay, the `abc` user, `PUID`/`PGID`, `/config`, `cont-init` — and left the reader to conclude
that removing code-server meant reimplementing them. **It does not.** LinuxServer publishes the base
without an editor, and the code-server image is itself built on it:

```
docker-code-server/Dockerfile:  FROM ghcr.io/linuxserver/baseimage-ubuntu:noble
baseimage-ubuntu:noble:         s6-overlay 3.2.1.0
                                useradd -u 911 -U -d /config -s /bin/false abc
                                init-adduser       ← applies PUID/PGID
                                init-custom-files  ← the custom-cont-init.d hook
```

So the epic is a changed `FROM` plus the removal of what the template does *for* code-server. That
was worth measuring before writing requirements shaped by the wrong cost.

**`baseimage-debian:trixie` rather than the `baseimage-ubuntu:noble` the image is on today.** The
cheaper choice was the same base, which changes nothing but the editor's absence; Debian trixie was
chosen for what it brings, accepting a re-check of the `apt` names. **Measured afterwards, twice:
the first measurement said sixty-five names and zero renames and was wrong** — it read a page that
answers 200 regardless. The real figures are 67 packages, 61 in trixie, 6 from third-party feeds,
one rename, and three versions no longer offered. The risk accepted was real after all, and the
lesson is about the method rather than the choice: a source that cannot say "no" cannot be used to
establish presence.

**FR-73 is the one that is not mechanical.** Seven settings are seeded today for code-server to read.
The repository's own comments classify two of them: `window.menuBarVisibility: classic` exists
because "the web build shows a hamburger by default", and `chat.disableAIFeatures` had its key
"verified against the VS Code build this image actually ships (1.129.0 via code-server 4.129.0)" —
the host editor is 1.140.0. The other five are preference or an unmeasured workaround.

The rule chosen is narrower than "keep what is useful": **a setting reaches the label only if it
exists because of something the label installs.** `workbench.iconTheme` qualifies — without it the
`file-icons` extension the image declares is installed and does nothing. The decision was to keep
what still makes sense, measured item by item, and the open question underneath it is not a
preference at all: **several of these may be application-scoped in VS Code and therefore not
settable from a container at any price.** That is measured in the epic's first story, before
anything is moved.

## Amendment, 2026-10-01 (fifth)

**`whiptail` is being retired, which turns "absorbing stack selection" from an epic named for later
into FR-61 through FR-66 and a decomposition.** The request was specific: a screen in the extension
replacing the `whiptail` prompts, and `init` as a button beside it. Four decisions came out of
grilling it, and each is a requirement above rather than a note:

- **The editor's own pickers, in steps, not a webview.** One step per question `whiptail` asked, so
  the mapping is checkable; a webview is HTML, a content security policy, message passing and a
  theme to match, which is a project inside this project for a checklist and three numbers.
- **The extension writes the manifest and invokes `setup`; it never composes the Dockerfile.**
  Two implementations of one composition is the failure this template has already paid for once —
  CI and `setup` each built the concatenation themselves, the copies drifted, and
  `stack-build (android)` failed in CI in a way that never reproduced through `setup`.
- **The build runs in an editor terminal.** It takes minutes and writes a great deal; an output
  channel cannot be cancelled, and a build nobody can stop is a build somebody kills from another
  window.
- **Without the editor, the manifest is the interface.** It already is the only record; `setup`
  reads it and builds. The host's prerequisites become `jq` and `docker`, and `whiptail` leaves the
  list rather than becoming optional.

**What this gives up, corrected.** This paragraph first said a host-only user would lose the
checklist and select stacks by editing JSON. That was settled differently at the story gate: `setup`
keeps an interactive path, with plain `read` prompts and no dependency, used when it has a terminal.
So nothing is lost there — and the cost moved rather than disappeared.

**The cost is two implementations of the asking**: five shell prompts in `setup` and five pickers in
the extension. That is accepted with its eyes open, and it is narrower than it looks: neither one
*decides* anything, both write the same manifest, and the manifest is what everything downstream
reads. What would have been unacceptable is two implementations of the **composition**, which FR-63
exists to prevent, and this is not that.

`setup` flags were considered and rejected as a second way of saying what the manifest already says.
`whiptail` behind a TTY check was considered and rejected because it does not retire `whiptail`,
which was the request.

## Amendment, 2026-10-01 (fourth)

**FR-51 and FR-52 are struck, and FR-53 replaces both.** The launcher is deleted now rather than
announced now and deleted later.

**The deprecation period was protecting nobody.** It exists to give people who depend on a thing
time to move, and this template has one user, who asked for the launcher gone rather than announced.
What it was costing instead: a release carrying code written to be deleted, a `@manual` scenario
nobody would run, and a story whose entire subject was a message.

**The notice did ship, and that is deliberate rather than a leftover.** Template `v2.3.0` carries
it, because that release also carries the fix for a GitHub token readable with `ps` from anywhere in
the container — a live security defect in the one environment using this. Holding the release to
keep a changelog tidy would have kept the token exposed. So the notice lives exactly one version,
for a reason that has nothing to do with deprecation.

**What FR-53 takes with it, measured rather than listed from memory:** `start/` (the crate), `dev`
(which does nothing but build and run it), the launcher's half of `init` — the display and WSLg
check, the five Tauri library checks, and the `cargo` requirement, which was the only prerequisite
`init` refused to install — the four Tauri `-dev` packages in the image, and the `cargo-check` and
`title-bar` CI jobs. **`rustup` stays**: the `rust` stack depends on core's installation rather than
its own, and `RUSTUP_HOME` is forwarded into the sandbox for that reason.

**What is given up.** The host stops being able to open the environment at all without the editor
and the Dev Containers extension. Combined with the charter's second amendment — which schedules
code-server's removal from the image — the fallbacks go one at a time and the end state has none:
`docker exec` and a terminal. Each step was chosen knowingly; the sum of them is worth saying out
loud once, here, rather than discovering it on the day the editor will not attach.

## Amendment, 2026-10-01 (third)

**Two epics stopped being optional.** "Absorbing stack selection" was named here as a door left
open and not scheduled; "the image stops being code-server's" was not named at all, because the
charter listed removing code-server as a deliberate non-goal. The objective is now that the
extension opens, builds, and leaves no code-server in the image. Both are recorded above as
*intended*, with the order recommended and the reason for it, and the charter's second amendment
carries what is being given up — the browser-against-loopback way in when the Dev Containers
extension will not attach.

Nothing in FR-1x through FR-5x changes. The epic in progress is unchanged and is a prerequisite
rather than a competitor: an image whose base is being replaced is not a thing to attach a
host editor to for the first time.

**One requirement acquires a deadline it did not have.** FR-4x's rule for choosing extension
identifiers falls back to *"the same identifier the `code-server` list already installs"*. That
list is now scheduled to disappear, so the fallback half needs another anchor before the epic that
removes code-server ships. The story is not reopened — the list exists until then — and that epic
owns the replacement.

## Amendment, 2026-10-01 (second)

**FR-31 asked for something that cannot be delivered, and FR-36 asserted the mechanism that would
deliver it.** Both were written from the spike, which established that no setting in the tooling
disables agent-socket forwarding, and concluded that the image would therefore have to refuse the
sockets from inside. Measured in a real environment since:

- `/config/.gnupg/S.gpg-agent` and `/tmp/.X11-unix/X0` exist and are sockets. **ssh-agent is not
  forwarded** — no socket anywhere in the container — so one third of the original requirement was
  already satisfied and nobody knew.
- Neither appears in `/proc/mounts`. They are **not** bind-mounted at container creation: the
  editor's server creates them inside the container when it attaches, which is after every boot
  hook has run. A `cont-init` covering those paths covers nothing.

So FR-31 is narrowed to what the sandbox actually enforces — the agent's reach, which is the threat
the charter names — and the rest becomes FR-37, a limitation written down rather than a requirement
nobody can meet. FR-36 is replaced by the rule that came out of the credential finding, which is a
requirement that *can* be met and has been.

Three mechanisms were considered for keeping the original FR-31 and rejected. A
`postAttachCommand` in the image's metadata races the server that creates the sockets, and the
ordering is undocumented — a fix that works most of the time produces the belief of coverage, which
the rules name as worse than none. Making the target directories unwritable breaks legitimate gpg
use and touches a directory that is normally world-writable. And leaving the requirement as written
would have been the same kind of false assurance as the comment that claimed a forwarded token
stayed out of `ps`.

## Amendment, 2026-10-01 (first)

Two changes, from the spike and from one observation that followed it.

**The spike's answers replaced the spike's description**, which the section itself required. One
of them changed a requirement rather than confirming it: image-declared metadata is resolved only
for a prebuilt image, so FR-19 now forbids the generated configuration from building one. Another
hardened an existing decision into the only available mechanism: there is no setting anywhere that
disables agent forwarding, so FR-36 states that FR-31 is satisfied inside the container or not at
all. The decision to enforce isolation from both sides was made before this was known; it turns
out one of the two sides does not exist.

**The remote extension list is its own list, not a translation** (FR-44). Committing to the
official editor makes proprietary extensions usable that the sandboxed editor never could use, and
the C# debugger is the concrete case. The charter was amended in the same change, because it had
claimed the container tooling was the only non-free piece of the stack.

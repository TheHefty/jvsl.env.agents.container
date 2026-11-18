# Epic: the rename left things behind

**The product was renamed, and the leftovers are found by whoever uses it rather than by whatever
tests it.**

The epic closes when nothing still carries the old product's name where a person or a program looks
for it, and when an older copy of this extension — which a rename cannot uninstall — is found and
said rather than discovered by following a command that does nothing.

**Four were found in one session, 2026-10-05, none of them by a test.**

| what | how it surfaced |
|---|---|
| three command names in the source | *"Command 'Dev Container: Build the Image' resulted in an error — command 'jvsl.devContainer.build' not found"*, after following a palette entry |
| `HOME` undeclared | `gh` and `claude` both failing on `/root/…`, reported as permission problems about a path nobody chose |
| an older copy still installed | the dead palette entry above was **its**, not this extension's |
| the manifest's name | noticed by reading it: `.code-server.stack.json`, named after an archived template, and it lives in every project's repository |

The first two are fixed. This epic is the other two.

**Why a rename is this expensive, stated once so the next one is cheaper:** an identity that is wrong
does not fail. A command id resolves to nothing, an activation event matches nothing, an extension id
installs beside its predecessor instead of replacing it — and none of those is an error. The system
keeps working and says nothing, while a person follows an instruction that does nothing. Every defect
above has that shape.

| # | Story | Why in that order |
|---|---|---|
| 1 | the manifest is named for the product that reads it | FR-110 to FR-113 — it changes an activation event, so getting it wrong stops the extension waking at all |
| 2 | an older copy of this extension is found and said | FR-114, FR-115 — a notice, and nothing depends on it |

**Story 1 is the one to grill, and the risk is not the rename.** It is that the extension must act on
a file in somebody's repository — write one, delete another — and this extension's standing rule is
that what it did not write is somebody's work. The rule survives because the manifest *is* its own:
written by the configure flow, recognised by parsing, and left alone when it does not parse. FR-113
is where that line is drawn, and it is the requirement a task design has to satisfy rather than
restate.

**Story 2 is deliberately small.** The whole of it is one sentence shown once. An older copy costs a
person time and a wrong belief; a modal on every window would cost more than the defect.

# Epic: the host editor replaces the launcher

**Opening a project in the host's editor becomes how the work is done, and `start` is retired.**

The epic closes when opening through the extension is the normal path and `start` says where to
migrate. Removal in the following major is a scheduled consequence, not outstanding work.

**The spike is done and discarded.** Its four answers, measured on 2026-10-01:

1. **An empty `PASSWORD` leaves code-server unauthenticated.** On the running configuration: the
   root redirects to the workbench and serves it, there is no password field anywhere, and
   `/login` redirects away because there is nothing to authenticate against. FR-18 stands, and its
   premise is now verified rather than inherited from documentation.
2. **The image metadata label is honoured, but only for a prebuilt image.** Resolved against a
   configuration that *builds* its image, the label is invisible — the image does not exist yet
   when the configuration is read. Resolved against `image:`, it is read. Hence FR-19. The merge:
   the configuration wins scalars it sets (`remoteUser`), the image fills what the configuration
   omits (`containerUser`), environment maps merge, and editor customizations form an ordered
   list with the image first and the configuration second, so the configuration is applied last.
3. **Agent forwarding has no switch.** The tooling's own manifest (version 0.470.0) declares 43
   settings and **not one of them governs ssh-agent or gpg-agent**. What exists is
   `copyGitConfig` (defaulting to on), `gitCredentialHelperConfigLocation` (defaulting to
   `global`), `dockerCredentialHelper` (on) and `mountWaylandSocket` (on). So the host-side half
   of FR-3x can close the git credential paths and the Wayland socket, and cannot touch the
   agents. Hence FR-36.
4. **Exactly one stack extension identifier diverges** between the two registries: the C#
   extension. The identifier the image installs today does not exist on the official registry,
   and the official one does not exist on the other. FR-44 makes this a non-issue by not treating
   the lists as translations of each other.

**Still open, and it needs a host.** Answers 2 and 3 were measured against the reference
implementation and the published manifest, not against the editor extension itself. What remains
is to observe the actual behaviour once: that the label is honoured the same way, and what is
forwarded in practice. It is a confirmation step inside story 1, not a second spike.

Stories, in order. "Repo" says where the pull requests land; a story spanning both is one story,
because it is one behaviour.

| # | Story | Repo |
|---|---|---|
| 1 | **Opening a configured project** — the editor connects as `abc` at `/config/workspace`, with the manifest's limits, the host's actual devices, and no state left owned by root. | both |
| 2 | **Refusing what cannot be opened** — uninitialized submodule, template below minimum, missing image, unreachable runtime; each naming its cause and its fix. | extension |
| 3 | **Host secrets stay on the host** — no agent sockets, no host credential helper, no host gitconfig; Workspace Trust untouched; `.vscode/` not writable from inside the jail. | both |
| 4 | **The remote editor arrives equipped** — stack extensions and settings declared by the image. | template |
| 5 | **The launcher announces its retirement** — deprecation notice naming the migration. | template |

Story 1 begins in the template, because the extension cannot connect as `abc` while the user's
shell is `/bin/false` and no remote user is declared. Its extension half follows the tag that
carries the image half, which is also what gives the minimum template version a real value instead
of a placeholder.

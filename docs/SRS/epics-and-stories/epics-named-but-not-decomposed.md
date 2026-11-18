# Epics named but not decomposed

Named so the first release does not close the door on them. None has stories until it is grilled,
and none starts before [the host editor replaces the launcher](the-host-editor-replaces-the-launcher.md) closes. **Two of them stopped being optional on 2026-10-01**
— see the charter's second amendment, which is where the reasoning and the cost are recorded.

**Every entry below is now closed out, and the last one closed by being deleted rather than built.**
The list has done what it was for. Neither epic before it in [the index](README.md) was ever on this list — *Beads tracks the
work* was named and grilled on the same day, and *the rename left things behind* was written out of
four defects found in one session. That is what an empty list makes possible: nothing was waiting, so
nothing had to wait.

- **The image stops being code-server's** — **decomposed and shipped** in template `v4.0.0` and
  `v5.0.0`. It is no longer in this list. The fallback it gave up — a browser against a loopback
  port when the Dev Containers extension will not attach — is gone as predicted, and was not
  needed.
- **Absorbing stack selection** — **decomposed**, as [*the editor composes and builds this
  project's image*](the-editor-composes-and-builds-this-projects-image.md). It is no longer in this list.
- **Starting a new project** — **merged into [the extension carries the image](the-extension-carries-the-image.md)** by the flow of 2026-10-02, as
  *creating a project from nothing*. It is no longer in this list.
- **Adopting the template into an existing project** — **merged into [the extension carries the image](the-extension-carries-the-image.md)**, as the
  no-manifest branch of *opening a project the extension chose*. The heuristic detection it was
  specified around is deleted rather than built: the flow asks the question a new project answers.
- **The agents screen** — **deleted by its own grilling on 2026-10-05**, and its planning
  directory with it. Three measurements took it apart. The Claude credential is a bind of this
  machine's `~/.claude`, so a screen has nothing to offer for it. The screen was to run *inside* the
  container, which this extension cannot do — `extensionKind` is pinned to exactly `["ui"]` by
  `src/manifest.test.ts`, because the extension drives the host's Docker. And the credential loss
  that justified the epic happened in the retired code-server template, so the arrangement that
  caused it no longer exists.

  **What survived is one behaviour rather than a screen:** the first interactive shell after the
  container starts asks for the agent logins that are missing. It is written into the payback of
  the debt `forwarded-secrets-land-in-the-sandbox-argv` (in the tracker, paid in #138)
  rather than into an epic of its own, because deleting `--env OPENAI_API_KEY` and having something
  run `codex login` are one change: the file the login writes is what replaces the variable.

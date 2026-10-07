# Non-functional requirements

- **NFR-1 — Resource isolation.** The editor process is never subject to the container's `cpuset`
  or memory limit. Checkable by inspecting the editor process's cgroup, deterministically, on any
  host. This is stated as isolation rather than as a time budget on purpose: the defect being
  fixed was contention, not slow startup, and a seconds-to-editable threshold either passes
  everywhere or fails in CI for reasons that have nothing to do with the system.
- **NFR-2 — Observability.** The extension writes to a dedicated output channel, recording
  decisions and their inputs — the cpuset it chose and the host core count behind it, the devices
  it omitted and why, the template version it read — and never the control flow. Anything that
  blocks opening is surfaced as a notification carrying the action that resolves it.
- **NFR-3 — Accessibility.** The user-facing surface is native editor components — notifications,
  quick picks, the output channel — so accessibility is the editor's. The commitment this makes
  concrete: no webview in the first release. A later screen carries its own accessibility cost
  rather than inheriting one for free.
- **NFR-4 — Internationalization.** English only, with no localization mechanism. The audience is
  projects that adopted the template, whose documentation language is English.
- **NFR-5 — Operability.** The extension runs on the host and holds no state of its own beyond
  what it writes into the project it is opening. Removing it leaves the project openable by the
  tooling it delegates to.

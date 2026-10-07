# Alternatives considered

- **The extension runs the container itself and attaches to the result.** Rejected: it would own
  the whole lifecycle — stopped containers, stale images, reconnection after a window reload —
  that the tooling it delegates to already handles, and attach is the path on which every
  isolation defect in manual testing appeared.
- **Generating the dynamic configuration from a host hook at startup.** Rejected: the hook runs
  after the configuration has been read, and its ordering against the runtime commands is
  unspecified, with open upstream bugs. The extension computes everything before handing over.
- **Keeping the existing launcher as a permanent fallback.** Rejected: two implementations of the
  same decisions about CPU affinity and devices, diverging silently. code-server stays in the
  image as the fallback instead, and the launcher goes.
- ~~**One repository for the extension and the image.** Rejected: the image has CI that builds
  images and this does not, and merging them would put the extension's code in a repository whose
  release train is about something else.~~ **Reversed by the seventh amendment**, which accepts
  both costs rather than disputing them: this repository grows the image builds, and its release
  train does gate on them from then on. What changed is the weight of the other side — two release
  trains and a pointer every project has to remember to bump turned out to cost more than one slow
  pipeline.
- **An agent on the host for the flows where no container exists yet.** Rejected: it would ship
  "an unsandboxed agent on the host" as a feature of a project whose purpose is to keep isolation
  intact while moving the editor out.
- **Doing nothing.** Rejected: the defect is measured and reproducible, and the manual workaround
  — attaching by hand — leaves the user as root, with host agent sockets forwarded.

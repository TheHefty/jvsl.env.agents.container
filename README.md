# Agent Containers

A Visual Studio Code extension that gives every project its own development container, built for
working with AI coding agents. It composes the image from the stacks a project needs, builds it,
writes the dev container configuration, and reopens the window inside it.

Installing the extension is the only setup a project needs. The image's definitions ship inside the
extension, so a project carries no template, no submodule and no setup script.

## Why

- **The editor stays on the host.** Only the toolchains, the agents and a nested Docker daemon run
  inside the container, under its CPU and memory limits. The editor is never starved by a build it
  is displaying.
- **Agents run sandboxed by default.** Claude Code and the OpenAI Codex CLI start inside
  [`ai-jail`](https://github.com/akitaonrails/ai-jail), which confines them to the workspace.
- **One project, one container.** Each project declares its stacks, versions and resource limits in
  a small manifest at its root, and gets its own image and its own Docker daemon. Claude Code's
  sign-in and settings come from the host's `~/.claude`, so they are set up once, not per project.

## Requirements

| | |
|---|---|
| **Host** | Linux, with Docker |
| **Editor** | Microsoft's build of Visual Studio Code, 1.90 or newer |
| **Extension** | [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers), installed automatically as a dependency |

Dev Containers is licensed only for Microsoft's build of VS Code, which is why other builds are not
supported.

## Installation

The extension is distributed as a `.vsix` package. Build it from source:

```sh
npm ci
npm run package
code --install-extension jvsl-env-agents-container.vsix
```

CI also publishes the package as a build artifact named `vsix` on every run that changes code.

## Getting started

Open the Command Palette and run one of:

| Command | What it does |
|---|---|
| **Agent Container: Create a Project…** | Asks for stacks, versions, limits and a location. It writes the project, initialises git, builds the image and reopens the window inside the container |
| **Agent Container: Open a Project…** | Opens an existing folder. A folder without a manifest goes through the same questions a new project answers |
| **Agent Container: Build the Image** | Composes and builds the image in a terminal, without reopening the window |
| **Agent Container: Configure Stacks and Limits** | Changes the project's stacks and resource limits |
| **Agent Container: Show What Was Detected** | Reports what the extension read about the host and the project |

The same entries are available from the **Agent Container** view in the Explorer.

## The project manifest

A project is described by `.agent-container.stack.json` at its root. The extension writes it and
keeps it up to date, and it can also be edited by hand:

```json
{
  "node": "22",
  "python": "3.12",
  "limits": {
    "cpus": 4,
    "memory": "6g"
  }
}
```

Each stack is a key, and its value is the version to install. Limits apply to the whole container.

## Stacks

`android` · `cpp` · `dotnet` · `golang` · `java` · `node` · `php` · `python` · `ruby` · `rust`

Each stack lives in [`stacks/`](stacks/) with the versions it offers, the image fragment that
installs it, and the editor extensions it recommends. A stack added there becomes available to
every project.

## What every image includes

| | |
|---|---|
| **Agents** | Claude Code and the OpenAI Codex CLI, each started through `ai-jail` |
| **Toolchain base** | Debian trixie, Git with LFS, the GitHub CLI, Node.js and Rust |
| **Containers** | A nested, rootless Docker daemon, so builds never reach the host's Docker socket |
| **Long-term memory** | [`ai-memory`](https://github.com/akitaonrails/ai-memory), enabled per project by an `.ai-memory.toml` file |
| **Work tracker** | [`beads`](https://github.com/steveyegge/beads), enabled per project with `"beads": true` in the manifest |
| **Working agreements** | The normative documents in [`docs/agent/`](docs/agent/), in English and Portuguese, installed where the agents read them |

Tools downloaded from release pages (`ai-jail`, `ai-memory` and `beads`) are pinned to a version
and verified against a checksum. The agent CLIs are deliberately unpinned and install their latest
release on each build.

## Security model

- **Nothing from the host's identity crosses into the container.** The SSH agent, the GPG agent,
  X11, the host's git credential helper and the host's `~/.gitconfig` are never forwarded.
- **Workspace Trust stays on.** The extension never disables it.
- **The agents' sandbox can be tightened by a project, never widened.** A project's `.ai-jail` file
  may restrict it further. Anything that grants more is decided in the image.
- **Credentials reach an agent as files, never as environment variables.** A variable passed into
  the sandbox would be readable from the process table by anything else in the container.

## Development

```sh
npm test             # unit tests
npm run typecheck    # type checking (the test runner strips types without checking them)
npm run test:bundle  # builds the bundle and checks what the package contains
npm run package      # builds the .vsix
```

Shell scripts are tested by a `*.test.sh` beside each one. Every test has a job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml), and CI also builds an image for each stack
and runs that stack's own checks inside it.

## Documentation

- [`docs/CHARTER.md`](docs/CHARTER.md): what the project is for and what it deliberately does not do
- [`docs/srs/`](docs/srs/): requirements, epics and stories
- [`docs/agent/`](docs/agent/): how work is done here, and in every project that uses the image

## Licence

MIT. See [`LICENSE`](LICENSE).

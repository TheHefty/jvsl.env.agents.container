# Agent Containers

A VS Code extension that runs on the **host** and carries everything a project's dev container
needs: it composes the Dockerfile, builds the image, writes the configuration, and hands the window
to the Dev Containers extension.

**A project installs this and needs nothing else.** No template to vendor, no submodule, no `setup`
script on the host. The image's content — `core/` and `stacks/` — travels inside the `.vsix`.

The editor runs on the host, outside the container's CPU and memory limits, because sharing one
`--cpuset-cpus` with the toolchains, the agents and a nested Docker daemon makes it freeze during a
build. Everything that must stay contained stays contained.

**Requires Microsoft's own build of VS Code**, because it delegates the container lifecycle to the
Dev Containers extension, which is licensed only for that build. Linux hosts only.

## What it does

| | |
|---|---|
| **Create a Project…** | asks for stacks, versions, limits and a location; writes the scaffolding, initialises git, builds the image and reopens the window inside it |
| **Open a Project…** | a folder with a manifest is composed and built for; one without goes through the same stack questions a new project answers |
| **Build the Image** | composes and builds, in a terminal, without opening anything |
| **Configure Stacks and Limits** | rewrites the project's manifest |
| **Show What Was Detected** | what the extension read about this host and this project |

See [`docs/CHARTER.md`](docs/CHARTER.md) for what it is for and what it deliberately will not do,
and [`docs/srs/`](docs/srs/) for the requirements and the story breakdown.

## Upgrading from `jvsl.env.agents.vscode`

**The extension was renamed, and a rename changes its identity.** This was published as
`thehefty.jvsl-env-agents-vscode` and is now `thehefty.jvsl-env-agents-container`. VS Code treats
those as two different extensions, so installing the new one **does not replace the old one** —
both stay installed, and the old one keeps contributing its entries to the command palette under
titles that still look right:

> `Command 'Dev Container: Build the Image' resulted in an error`
> `command 'jvsl.devContainer.build' not found`

Nothing is broken and nothing reports a cause. The entry is simply dead, and following it does
nothing. Remove the old one:

```sh
code --list-extensions | grep thehefty
code --uninstall-extension thehefty.jvsl-env-agents-vscode
```

The commands this extension contributes are all prefixed **`Agent Container:`**. Anything saying
`Dev Container:` is either the old extension or Microsoft's own.

## The template this replaced

[`jvsl.env.agents.code-server`](https://github.com/TheHefty/jvsl.env.agents.code-server) was a
template vendored into every project as a submodule. It is **archived**: its `core/`, `stacks/`,
`scripts/` and normative documents were absorbed into this repository, with their history, and a
project no longer consumes it at all.

A project still carrying a `.code-server/` submodule does not need it. Nothing here reads one —
`scripts/nothing-reads-the-submodule.test.sh` holds that true.

## Licence

MIT. See [`LICENSE`](LICENSE).

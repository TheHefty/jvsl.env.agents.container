# jvsl.env.agents.vscode

A VS Code extension that runs on the host and connects your editor to a project's dev container —
replacing the Tauri launcher that the
[`jvsl.env.agents.code-server`](https://github.com/TheHefty/jvsl.env.agents.code-server) template
ships today.

The editor moves to the host, outside the container's CPU and memory limits, because sharing one
`--cpuset-cpus` with the toolchains, the agents and a nested Docker daemon makes it freeze during a
build. Everything that must stay contained stays contained.

**Requires Microsoft's own build of VS Code**, because it delegates the container lifecycle to the
Dev Containers extension, which is licensed only for that build. Linux hosts only.

**There is no code yet.** The project is at its charter — see [`docs/CHARTER.md`](docs/CHARTER.md)
for what it is for, and what it deliberately will not do.

## Licence

MIT. See [`LICENSE`](LICENSE).

# Epic: the extension changes a project only when asked

**Opening a folder writes nothing to the project; only Open and Create prepare it.**

Agreed on 2026-10-15: `code <folder>` wrote `.devcontainer`, `CLAUDE.md` and `AGENTS.md` and renamed
an old manifest, because activation ran the open flow. The extension still activates — the panel
and the older-copy notice need it — but writes nothing until asked. The epic closes when opening a
project's folder leaves its tree untouched.

| # | Story | Why in that order |
|---|---|---|
| 1 | opening a folder writes nothing | amends the activation behaviour the open flow was built around |

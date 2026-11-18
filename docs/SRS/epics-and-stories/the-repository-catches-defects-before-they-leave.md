# Epic: the repository catches defects before they leave

**The defects a linter finds are caught before a commit and before a push, and CI holds the same line.**

Agreed on 2026-10-09, at the operator's request. Lint is for defects, not style: ESLint with
typescript-eslint reading the real types, and shellcheck for the shell. The hooks remind the author;
CI is the gate, because a hook is enabled per clone and skipped with `--no-verify`. The epic closes
when a lint error, a failing test or a broken build is refused by the hook that sees it first and
by CI.

| # | Story | Why in that order |
|---|---|---|
| 1 | lint and the hooks guard every change | no FR — the repository's own discipline; the linter first, then the hooks and the CI job that run it |

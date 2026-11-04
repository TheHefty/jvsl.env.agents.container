---
name: split-markdown
description: Split a Markdown file that reached the size limit (50 KiB) into a folder of its subjects — one file per top-level section, a README.md index, every inbound link updated — the way the rules prescribe. Use when check-md-size or the pre-commit hook refuses a file, or when the developer asks to split a Markdown file that grew too large. Shows the plan and writes nothing until the developer agrees.
---

# Splitting a Markdown file that grew past the limit

The rules hold every Markdown file under 50 KiB (RULES.md, "Documentation"), and say how a file that reaches the limit is split: **into a folder named for its subject, one file per top-level section, with a `README.md` inside that indexes them.** This skill does that. The arithmetic — where each section starts and ends, how big each file will be, which links point at what — is done by a script, so no prose passes through your hands to be retyped.

## 1. Which file

The file `check-md-size` or the pre-commit hook named, or the one the developer names. Two are special:

- **`CHANGELOG.md` is exempt.** It only grows and release-please writes it. Say so and stop.
- **`CLAUDE.md` stays the file that is loaded.** It is split into files it imports with `@path`, never into a folder that replaces it. Ask the developer which sections must stay in its own body — the mode, the gates and the instruction to stop and say so, at least: what has to survive the imports failing.

## 2. Plan, and show the plan

From the repository's root:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/md-split-plan <file>
```

For `CLAUDE.md`, add `--keep "<heading>"` once for each section that stays in its body.

It prints the plan as JSON and writes nothing. Show the developer, in words:

- the folder and the files it will create, one per section, with each one's size;
- the index (`README.md`), which keeps the file's preamble and lists the sections;
- every file whose links will be rewritten, because they point at the old file or at one of its sections;
- that the old path becomes a one-line pointer to the index — never a second copy.

**If `oversized` is not empty**, a section is over the limit on its own, and its file would be too. Say which, and propose splitting that section by its own subsections first: the same rule, one level down. Do not cut a section at a byte count — the rules forbid it, because it leaves half an argument in each piece.

**Never compress the prose to make it fit.** The length was the signal. Deleting the explanations that made it long throws away the part worth keeping.

## 3. Apply, only on the developer's word

When the developer agrees:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/md-split-plan --apply <file>   # with the same --keep options
```

It writes the section files as exact slices of the original, with only their links rewritten. It writes the index and the pointer, rewrites the inbound links, and prints what it did. It refuses, writing nothing, if a section is still over the limit.

Then run `check-md-size` and show its line. **Nothing is committed**: leave the change for the developer to review and commit, as one change — the split and every link it updated together.

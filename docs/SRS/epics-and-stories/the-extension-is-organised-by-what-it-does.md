# Epic: the extension is organised by what it does

**Each command of the extension lives with its feature, and `src/extension.ts` only registers them.**

Agreed on 2026-10-08, at the operator's request, over folders alone or a split between pure modules
and the editor's adapters. No requirement changes: every command behaves as it did. The epic closes
when the entry point holds no command's body and no check reads fewer files than `src/` holds.

| # | Story | Why in that order |
|---|---|---|
| 1 | the commands leave the hub | no FR — behaviour is unchanged; the guards and the test runner learn to read subfolders first, then each command moves |

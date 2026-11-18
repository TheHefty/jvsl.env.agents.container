# Epic: a release carries what it releases

**Every release of the extension carries its own `.vsix`, so installing a version is downloading it.**

Agreed on 2026-10-09, after `v1.0.0` was cut with no package and the first manual attach picked up
another run's 0.3.0 artifact. The epic closes when a published release gets its package without a
hand on it, checked against its tag and read back.

| # | Story | Why in that order |
|---|---|---|
| 1 | the release workflow attaches the package | no FR — how a release is distributed; one workflow on `release: published` |

# Changelog

## [1.0.0](https://github.com/TheHefty/jvsl.env.agents.container/compare/v0.3.0...v1.0.0) (2026-10-04)


### ⚠ BREAKING CHANGES

* this repository no longer vendors jvsl.env.agents.code-server. `git submodule status` is empty, .gitmodules is gone, and the marketplace description stops naming a template a project does not need.
* `templateMinVersion` is gone from package.json and the extension no longer reads a project's `.code-server/` at all. FR-22's machinery — readTemplateVersion, the three refusals, the OpenContext fields, the diagnostics line and the manifest assertion — is deleted.
* opening a project now refuses a template below 5.0.0. `templateMinVersion` said 2.2.0 and had been wrong since 2.3.0 — nothing read it, so a project on an older template opened, succeeded, and delivered an editor with no extensions at all. `PASSWORD` also leaves `containerEnv`: it existed so code-server would not demand a password, and template 5.0.0 removed the editor.
* the java stack no longer offers 17 and the cpp stack no longer offers 11. Debian trixie does not package either — `openjdk-17-jdk`, `gcc-11` and `g++-11` are absent from it. A project pinned to Java 17 or GCC 11 has to provide it itself.
* the image is built on `ghcr.io/linuxserver/baseimage-debian:trixie` instead of `lscr.io/linuxserver/code-server`. There is no editor in the container, no unauthenticated HTTP server and no published port. The distribution changes from Ubuntu noble to Debian trixie. `setup` must be rerun: a bumped pointer with a stale image describes a different system.
* the python stack no longer installs Debian or Ubuntu python packages. CPython comes from astral-sh/python-build-standalone, unpacked under `/opt/python/<version>`, pinned by release, version and SHA-256. Packages now land in that prefix's `site-packages` rather than in Debian's `dist-packages`, which a project assuming the distribution's layout will notice.
* the php stack installs from `packages.sury.org/php` instead of the `ondrej/php` Launchpad PPA. Same maintainer and the same package names; an image rebuild is required, and a project pinning the PPA by hand no longer matches what the fragment configures.
* the image no longer seeds editor settings and no longer re-applies them on every boot. Six settings stop being written; a bumped template leaves them to whoever opens the project. `workbench.iconTheme` moves into the `devcontainer.metadata` label, because the `file-icons` extension the label declares is installed and invisible without it.
* the Gherkin extension a project's editor installs changes from `alexkrechik.cucumberautocomplete` to `CucumberOpen.cucumber-official`. A project that pinned the old one by hand keeps it; one that relied on the image's list gets the other.

### Features

* a boot hook removes the previous editor's leftover state ([141c9ee](https://github.com/TheHefty/jvsl.env.agents.container/commit/141c9ee8a7b49620b9bb330087d20d7a50074ffc))
* a command picks a folder and opens it ([8ce33ad](https://github.com/TheHefty/jvsl.env.agents.container/commit/8ce33ade8f68bf0e7a2c3fde90e5a85f99225167))
* a folder with no manifest is asked about rather than refused ([d9c5520](https://github.com/TheHefty/jvsl.env.agents.container/commit/d9c5520200064011cfe2a2deb8c39a12fd5171c1))
* a project gets its instruction files when it opens ([7c777be](https://github.com/TheHefty/jvsl.env.agents.container/commit/7c777be712ec4a6551c8a4bf9a14ee547d14d2c8))
* a project whose image is absent is built, then opened ([739df65](https://github.com/TheHefty/jvsl.env.agents.container/commit/739df65e0ef76a7034d63d2484b949c4b9fb77a1))
* FR-8x, the epic, and the template repository is absorbed ([1847bea](https://github.com/TheHefty/jvsl.env.agents.container/commit/1847bea131aa75bb3bfd1d67a4c246f77479e42f))
* Gherkin support comes from Cucumber, and the registry was measured ([15493ed](https://github.com/TheHefty/jvsl.env.agents.container/commit/15493edf7e719b875124a0f18ef6105d553993cc))
* java offers 21 and 25, cpp offers 12, 13 and 14 ([527f2d9](https://github.com/TheHefty/jvsl.env.agents.container/commit/527f2d9d9cd38dd303326f90f781269bce490c32))
* nothing wakes up on a submodule, and the floor that allows it is asserted ([6bf5baf](https://github.com/TheHefty/jvsl.env.agents.container/commit/6bf5bafb717ef345ad8139b5f0e1aadcecb3bea0))
* one editor setting survives and the machinery goes ([440cd58](https://github.com/TheHefty/jvsl.env.agents.container/commit/440cd58023b3839b8d6f78d3d18a3f2697f34950))
* opening stops requiring a submodule ([7ae9bee](https://github.com/TheHefty/jvsl.env.agents.container/commit/7ae9bee834ba616401babbd7a4b707b765a19982))
* php takes its packages from sury ([e91c2a2](https://github.com/TheHefty/jvsl.env.agents.container/commit/e91c2a24b42a5971bd3bf78c370def0bb651d0ce))
* python installs CPython from pinned standalone builds ([ed1a3a1](https://github.com/TheHefty/jvsl.env.agents.container/commit/ed1a3a1664a673fa96282cf12be0918ef7961ade))
* the base carries no editor ([ad2e9ee](https://github.com/TheHefty/jvsl.env.agents.container/commit/ad2e9ee858100c82b72d2f46852ce04d695fc27e))
* the build composes from what the extension carries ([2ad91a3](https://github.com/TheHefty/jvsl.env.agents.container/commit/2ad91a3cb8a6bd95493e5555af485174412137ca))
* the declared extensions are checked when they change ([2e42588](https://github.com/TheHefty/jvsl.env.agents.container/commit/2e425880c30123e3ab9a2e3dc3d0b51187771740))
* the extension carries the image, and the template stops being consumed ([56d9a25](https://github.com/TheHefty/jvsl.env.agents.container/commit/56d9a256107472246a1e00dc15334f287af90b82))
* the extension carries the instruction files a project gets ([fd65138](https://github.com/TheHefty/jvsl.env.agents.container/commit/fd65138daf209d739dda72707ff3c78f2ac8dea6))
* the extension knows what it carries ([2ca4be6](https://github.com/TheHefty/jvsl.env.agents.container/commit/2ca4be6b4adaa983dfa0ca844dfb7ae2c2ccb00d))
* the flow merges three epics, and FR-88 through FR-92 ([a3607a3](https://github.com/TheHefty/jvsl.env.agents.container/commit/a3607a3a3d1aa282b410907b68e6cf9997268251))
* the image carries the documents and a boot hook writes two of them ([0d3dd5f](https://github.com/TheHefty/jvsl.env.agents.container/commit/0d3dd5fe249c40d074bdfb4d880916cc8332990b))
* the image's content arrives, with the 86 commits that explain it ([58a8e42](https://github.com/TheHefty/jvsl.env.agents.container/commit/58a8e4215fb3492811a39ea61e8303090b7ff0c8))
* the minimum template version is true and enforced ([09228be](https://github.com/TheHefty/jvsl.env.agents.container/commit/09228be1e97698e0bdae80c1bb399804b38e033c))
* the normative documents move here, with their parity check ([33f89df](https://github.com/TheHefty/jvsl.env.agents.container/commit/33f89dfe157a5870786fc0490040d69c0d01354b))
* the package carries the image's content ([4ef9543](https://github.com/TheHefty/jvsl.env.agents.container/commit/4ef95438cbb675b0b49c6869b61c9044a191d82e))
* the process documents load as user-level rules, outside the workspace ([2f19f49](https://github.com/TheHefty/jvsl.env.agents.container/commit/2f19f4957ba0a68f977c8873d619d4e9f11cbcb2))
* the submodule goes ([98568b4](https://github.com/TheHefty/jvsl.env.agents.container/commit/98568b4a3b1d447bc1104cbc272fc93d2aa21001))


### Bug Fixes

* agent-rules gates, and it took three attempts to put it in the right list ([1a79295](https://github.com/TheHefty/jvsl.env.agents.container/commit/1a792951dfff2590400ba64d4755b5ee273360e0))
* docker-compose is what the package is called on Debian ([e449944](https://github.com/TheHefty/jvsl.env.agents.container/commit/e449944f324cab5aabef2f7ba0b5f0633a351da4))
* no stack hardcodes one distribution's package source ([06a5394](https://github.com/TheHefty/jvsl.env.agents.container/commit/06a53948dccb2463411a35011a7d5cef7fa656bb))
* put back the manual-page directory the base image deletes ([8913a48](https://github.com/TheHefty/jvsl.env.agents.container/commit/8913a48e84b203e72a95f3f3602a397e31c75af5))
* the integration fixture declares the image state ([402fa58](https://github.com/TheHefty/jvsl.env.agents.container/commit/402fa58ca36f66341de207af2bb7c317a86c4f03))
* the manifest test typechecks ([51a8e2f](https://github.com/TheHefty/jvsl.env.agents.container/commit/51a8e2f3f9c84e9559a252509be468afae9d87af))
* the package stops carrying what nothing reads ([7bf3fc7](https://github.com/TheHefty/jvsl.env.agents.container/commit/7bf3fc7ba9b2bc245c49a45523b81cf3519ccde6))
* the packaging test builds the artifact it inspects ([5434fd1](https://github.com/TheHefty/jvsl.env.agents.container/commit/5434fd15c5fa249aae5326e9e9316280e96f847c))

## [0.3.0](https://github.com/TheHefty/jvsl.env.agents.vscode/compare/v0.2.1...v0.3.0) (2026-10-02)


### Features

* a view in the Explorer shows what is selected ([2ef58a1](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/2ef58a148c6cdf0469caad921eda8064e1da2f6e))
* the build runs in a terminal whose process is setup ([1d7eab0](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/1d7eab051e34269fa5428f7bffa5bc716bc47f46))
* the defaults are a tested function, not a literal in two repositories ([29e92c6](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/29e92c662ba459891257a20c2410356faa3d85d3))
* the editor asks the five questions and writes the manifest ([f7dc4cf](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/f7dc4cf4150760e19fd38deb0474b70110702e65))
* Workspace Trust is never written by the extension ([#14](https://github.com/TheHefty/jvsl.env.agents.vscode/issues/14)) ([6c8ef12](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/6c8ef123ff7fb01d8e7aab2602f9e7b06334e92f))


### Bug Fixes

* confirming the questions builds, as the story asked from the start ([0d1f6f1](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/0d1f6f1d0bfb3e20de405fefe3c1ed1457ce21aa))
* packaging builds what it packages ([22f6a43](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/22f6a43ea327af7d626983be54e5079385f34a0a))
* the release PR gets a CI run, so it can be merged at all ([1e8b2db](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/1e8b2db513aca6cc8dd8e235416273d853acc9d2))

## [0.2.1](https://github.com/TheHefty/jvsl.env.agents.vscode/compare/v0.2.0...v0.2.1) (2026-10-01)


### Bug Fixes

* let the image's own command run ([ebbde9e](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/ebbde9e9b2278fb686c717e97c5c490b4d2f3c30))

## [0.2.0](https://github.com/TheHefty/jvsl.env.agents.vscode/compare/v0.1.0...v0.2.0) (2026-10-01)


### Features

* generate the dev container configuration and hand over ([647df52](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/647df52e2d0570da06a4d8dd6b6ab3230dc9cd71))

## 0.1.0 (2026-10-01)


### Features

* the extension exists and wakes up on a template project ([abf4922](https://github.com/TheHefty/jvsl.env.agents.vscode/commit/abf492216e09e57fc434a35946d78048a3138c08))

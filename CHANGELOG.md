# Changelog

## [1.0.0](https://github.com/TheHefty/jvsl.env.agents.container/compare/v0.3.0...v1.0.0) (2026-10-09)


### ⚠ BREAKING CHANGES

* every command id changes from jvsl.devContainer.* to jvsl.agentContainer.*, and the package name from jvsl-env-agents-vscode to jvsl-env-agents-container. A keybinding naming an old id stops working. Done now because the charter puts publishing to a marketplace out of scope — the rename is free before there are installs and is not after.
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
* a check keeps the planning out of docs/ ([c9cf821](https://github.com/TheHefty/jvsl.env.agents.container/commit/c9cf821d8eeb3dc61dd8e619cd433b874582094a))
* a check keeps the planning out of docs/ ([a08b63b](https://github.com/TheHefty/jvsl.env.agents.container/commit/a08b63bd0f299786a16f7877a3a3093fa53ae6b6))
* a command creates a project and opens it ([1fe5f8f](https://github.com/TheHefty/jvsl.env.agents.container/commit/1fe5f8fe0e672f4e085ae57d941daebbbc536c1b))
* a command picks a folder and opens it ([8ce33ad](https://github.com/TheHefty/jvsl.env.agents.container/commit/8ce33ade8f68bf0e7a2c3fde90e5a85f99225167))
* a folder with no manifest is asked about rather than refused ([d9c5520](https://github.com/TheHefty/jvsl.env.agents.container/commit/d9c5520200064011cfe2a2deb8c39a12fd5171c1))
* a linter, git hooks that run it and the tests, and a CI job that holds the line ([fc53724](https://github.com/TheHefty/jvsl.env.agents.container/commit/fc53724f7cfde5b1937dd42a715c6fe0b61806de))
* a linter, git hooks that run it and the tests, and a CI job that holds the line ([86e200c](https://github.com/TheHefty/jvsl.env.agents.container/commit/86e200cfba60ec7e1627930a13a84c1d017cb560))
* a migration plan for a code-server project's files ([fb12032](https://github.com/TheHefty/jvsl.env.agents.container/commit/fb1203284346b55daee219b9be135dfd5c2fdd7e))
* a planning migration that stopped part-way carries on from where it stopped ([63ef444](https://github.com/TheHefty/jvsl.env.agents.container/commit/63ef4444eaea8170d089c847c66e6cfa58409351))
* a planning migration that stopped part-way carries on from where it stopped ([a6fba4f](https://github.com/TheHefty/jvsl.env.agents.container/commit/a6fba4fb4fcdfb2817d2f17bb4492902ff067b99))
* a project gets its instruction files when it opens ([7c777be](https://github.com/TheHefty/jvsl.env.agents.container/commit/7c777be712ec4a6551c8a4bf9a14ee547d14d2c8))
* a project whose image is absent is built, then opened ([739df65](https://github.com/TheHefty/jvsl.env.agents.container/commit/739df65e0ef76a7034d63d2484b949c4b9fb77a1))
* Agent Container: Migrate from code-server takes a project across, one step at a time ([5ccbaa6](https://github.com/TheHefty/jvsl.env.agents.container/commit/5ccbaa67981c0dbdb73c8cdb8230a9ebea5aeaf6))
* Agent Container: Migrate from code-server takes a project across, one step at a time ([9ad1a70](https://github.com/TheHefty/jvsl.env.agents.container/commit/9ad1a70760abdac00e082b8605c7529b64c67aeb))
* an older copy of this extension is found and said ([608496a](https://github.com/TheHefty/jvsl.env.agents.container/commit/608496afe6674af4b4deaac9f90d4448a930f92a))
* an older copy of this extension is found and said ([8e276f6](https://github.com/TheHefty/jvsl.env.agents.container/commit/8e276f6e466cd8ccbd95668cf9084e2b347c064d))
* creating a project decides what to write before writing any of it ([0df928f](https://github.com/TheHefty/jvsl.env.agents.container/commit/0df928fab3f7d0e225c14583efacb9407fa655a0))
* drafts are proposed in the tracker, and agreement makes them work ([97aa565](https://github.com/TheHefty/jvsl.env.agents.container/commit/97aa5655863c9f95b68f5406a04aae4ae4316c2b))
* drafts are proposed in the tracker, and agreement makes them work ([3558272](https://github.com/TheHefty/jvsl.env.agents.container/commit/3558272ec56f0320d7e07d13ec005d6b3e2dde91))
* FR-8x, the epic, and the template repository is absorbed ([1847bea](https://github.com/TheHefty/jvsl.env.agents.container/commit/1847bea131aa75bb3bfd1d67a4c246f77479e42f))
* Gherkin support comes from Cucumber, and the registry was measured ([15493ed](https://github.com/TheHefty/jvsl.env.agents.container/commit/15493edf7e719b875124a0f18ef6105d553993cc))
* java offers 21 and 25, cpp offers 12, 13 and 14 ([527f2d9](https://github.com/TheHefty/jvsl.env.agents.container/commit/527f2d9d9cd38dd303326f90f781269bce490c32))
* nothing wakes up on a submodule, and the floor that allows it is asserted ([6bf5baf](https://github.com/TheHefty/jvsl.env.agents.container/commit/6bf5bafb717ef345ad8139b5f0e1aadcecb3bea0))
* one editor setting survives and the machinery goes ([440cd58](https://github.com/TheHefty/jvsl.env.agents.container/commit/440cd58023b3839b8d6f78d3d18a3f2697f34950))
* opening stops requiring a submodule ([7ae9bee](https://github.com/TheHefty/jvsl.env.agents.container/commit/7ae9bee834ba616401babbd7a4b707b765a19982))
* php takes its packages from sury ([e91c2a2](https://github.com/TheHefty/jvsl.env.agents.container/commit/e91c2a24b42a5971bd3bf78c370def0bb651d0ce))
* python installs CPython from pinned standalone builds ([ed1a3a1](https://github.com/TheHefty/jvsl.env.agents.container/commit/ed1a3a1664a673fa96282cf12be0918ef7961ade))
* the agent CLIs float, and ai-jail carries the fix we reported ([907d428](https://github.com/TheHefty/jvsl.env.agents.container/commit/907d428db8d7fc278f6883a98b0bef683e4c308f))
* the agent CLIs float, and ai-jail carries the fix we reported ([b7669e4](https://github.com/TheHefty/jvsl.env.agents.container/commit/b7669e4beea2823a92870d6fed73b9b0f23d00dc))
* the backlog filters and sorts, and an item opens as a dialog ([56c9129](https://github.com/TheHefty/jvsl.env.agents.container/commit/56c9129c641a2d4632d596c722f8f0097b8ea37d))
* the backlog filters and sorts, and an item opens as a dialog ([52dd6cd](https://github.com/TheHefty/jvsl.env.agents.container/commit/52dd6cd078b59542eb64126cdb668167d1462813))
* the base carries no editor ([ad2e9ee](https://github.com/TheHefty/jvsl.env.agents.container/commit/ad2e9ee858100c82b72d2f46852ce04d695fc27e))
* the board shows the work, read through the project's container ([4e2baf0](https://github.com/TheHefty/jvsl.env.agents.container/commit/4e2baf0a15314614a54163a881b0f5d4aec42dde))
* the board shows the work, read through the project's container ([dd42726](https://github.com/TheHefty/jvsl.env.agents.container/commit/dd4272657b9f1864ef237e4298a73237e05cec9b))
* the board takes Azure DevOps's shape ([cd0045a](https://github.com/TheHefty/jvsl.env.agents.container/commit/cd0045a4dd1a4d443bafdac0f88bb68d0113c37e))
* the board takes Azure DevOps's shape ([0b5e9fc](https://github.com/TheHefty/jvsl.env.agents.container/commit/0b5e9fcc7c7a6597ad74c69d8b821150c8a8463b))
* the build composes from what the extension carries ([2ad91a3](https://github.com/TheHefty/jvsl.env.agents.container/commit/2ad91a3cb8a6bd95493e5555af485174412137ca))
* the commands are Agent Container, and the project is named for what it is ([a6f293a](https://github.com/TheHefty/jvsl.env.agents.container/commit/a6f293af7cc2dba328731d7e0f5b48f10ee4c391))
* the declared extensions are checked when they change ([2e42588](https://github.com/TheHefty/jvsl.env.agents.container/commit/2e425880c30123e3ab9a2e3dc3d0b51187771740))
* the extension carries the image, and the template stops being consumed ([56d9a25](https://github.com/TheHefty/jvsl.env.agents.container/commit/56d9a256107472246a1e00dc15334f287af90b82))
* the extension carries the instruction files a project gets ([fd65138](https://github.com/TheHefty/jvsl.env.agents.container/commit/fd65138daf209d739dda72707ff3c78f2ac8dea6))
* the extension knows what it carries ([2ca4be6](https://github.com/TheHefty/jvsl.env.agents.container/commit/2ca4be6b4adaa983dfa0ca844dfb7ae2c2ccb00d))
* the extension says when this host will stop the agents' sandbox ([beba432](https://github.com/TheHefty/jvsl.env.agents.container/commit/beba4321b067a9afca0f0175da8313936fe7bf45))
* the extension says when this host will stop the agents' sandbox ([ee0c971](https://github.com/TheHefty/jvsl.env.agents.container/commit/ee0c971b4b9c8e21547284d20c041f6822d6357d))
* the flow merges three epics, and FR-88 through FR-92 ([a3607a3](https://github.com/TheHefty/jvsl.env.agents.container/commit/a3607a3a3d1aa282b410907b68e6cf9997268251))
* the image carries bd, and a project that asks gets a tracker ([4ff1665](https://github.com/TheHefty/jvsl.env.agents.container/commit/4ff1665c9b53a4cd976a34f8718de0d7a6ec22ee))
* the image carries bd, and a project that asks gets a tracker ([4a4eb29](https://github.com/TheHefty/jvsl.env.agents.container/commit/4a4eb297c2daa286ea13bf7f9782f265e51678b6))
* the image carries the documents and a boot hook writes two of them ([0d3dd5f](https://github.com/TheHefty/jvsl.env.agents.container/commit/0d3dd5fe249c40d074bdfb4d880916cc8332990b))
* the image's content arrives, with the 86 commits that explain it ([58a8e42](https://github.com/TheHefty/jvsl.env.agents.container/commit/58a8e4215fb3492811a39ea61e8303090b7ff0c8))
* the manifest is named for the product that reads it ([3c4b3fe](https://github.com/TheHefty/jvsl.env.agents.container/commit/3c4b3fecbf86c80c7e79aef78c0e149ce72d55f3))
* the manifest is named for the product that reads it ([25bfdf2](https://github.com/TheHefty/jvsl.env.agents.container/commit/25bfdf2d42d1d40268d0828f2bbf36c47a2ab4b3))
* the Markdown size check ships in the image ([7437d42](https://github.com/TheHefty/jvsl.env.agents.container/commit/7437d4271e9e92d145824befc0c0d41362ae2be7))
* the migration carries the prose, and refuses to delete what did not ([a600f25](https://github.com/TheHefty/jvsl.env.agents.container/commit/a600f25ddc14cf9fb3622c9d737070a4c6c7971e))
* the migration carries the prose, and refuses to delete what did not ([77f5bf4](https://github.com/TheHefty/jvsl.env.agents.container/commit/77f5bf49ef4f9c096282a1068e8a96aad4429382))
* the migration closes finished work, carries the debts, and plans first ([8ac7aa8](https://github.com/TheHefty/jvsl.env.agents.container/commit/8ac7aa84d81b6f592d1ccc75d33da5f92cbf7aea))
* the migration closes finished work, carries the debts, and plans first ([6bdc63f](https://github.com/TheHefty/jvsl.env.agents.container/commit/6bdc63fab29a0d8f651dc2affae5fcb2a7a48713))
* the minimum template version is true and enforced ([09228be](https://github.com/TheHefty/jvsl.env.agents.container/commit/09228be1e97698e0bdae80c1bb399804b38e033c))
* the normative documents move here, with their parity check ([33f89df](https://github.com/TheHefty/jvsl.env.agents.container/commit/33f89dfe157a5870786fc0490040d69c0d01354b))
* the package carries the image's content ([4ef9543](https://github.com/TheHefty/jvsl.env.agents.container/commit/4ef95438cbb675b0b49c6869b61c9044a191d82e))
* the panel is there with no folder open ([cc55cb3](https://github.com/TheHefty/jvsl.env.agents.container/commit/cc55cb3c27f6a2daeef37d7bf38168695943b593))
* the planning migration reads any template layout, and ships in the image ([d822fb3](https://github.com/TheHefty/jvsl.env.agents.container/commit/d822fb33c5c8a746c453cffcd3578da3506c4636))
* the planning migration reads any template layout, and ships in the image ([5002d7b](https://github.com/TheHefty/jvsl.env.agents.container/commit/5002d7b238ce4854b34bb43b317fa4c0fb641371))
* the process documents load as user-level rules, outside the workspace ([2f19f49](https://github.com/TheHefty/jvsl.env.agents.container/commit/2f19f4957ba0a68f977c8873d619d4e9f11cbcb2))
* the questions can ask where a project goes, and whether it remembers ([a10ea1a](https://github.com/TheHefty/jvsl.env.agents.container/commit/a10ea1a728837fe3f1d3106402c4f9d5ecb7a48e))
* the rules say how to work from the tracker ([a17c994](https://github.com/TheHefty/jvsl.env.agents.container/commit/a17c994e4f8932cbb41226b921b44f18fedf3965))
* the rules say how to work from the tracker ([74b9d60](https://github.com/TheHefty/jvsl.env.agents.container/commit/74b9d603651624bb263f40eb0c2ff36db080a467))
* the rules say the tracker travels with the code's push ([afd744a](https://github.com/TheHefty/jvsl.env.agents.container/commit/afd744a7e1efe89c8300381ed40489d48f5b586c))
* the shipped rules say where planning lives in a project that has a tracker ([224a4f1](https://github.com/TheHefty/jvsl.env.agents.container/commit/224a4f11e2d311766518c8338e7e05e53b6b758a))
* the shipped rules say where planning lives in a project that has a tracker ([0e97d7a](https://github.com/TheHefty/jvsl.env.agents.container/commit/0e97d7a286acefb35e5892401cbd857fa78ba697))
* the size check ships in the image, and a code-server project's files have a migration plan ([ca53b20](https://github.com/TheHefty/jvsl.env.agents.container/commit/ca53b2011916fffdfcd06bb4fcf4494062af7872))
* the submodule goes ([98568b4](https://github.com/TheHefty/jvsl.env.agents.container/commit/98568b4a3b1d447bc1104cbc272fc93d2aa21001))


### Bug Fixes

* a failed planning step names its cause, not the command that ran ([d127546](https://github.com/TheHefty/jvsl.env.agents.container/commit/d1275466f163781893782af390eb8c9a607f958b))
* a failed planning step names its cause, not the command that ran ([c739d94](https://github.com/TheHefty/jvsl.env.agents.container/commit/c739d94f6167a04a1a480cbb41cabb674ef75cea))
* a limit written as an object no longer reads [object Object] ([d4b7081](https://github.com/TheHefty/jvsl.env.agents.container/commit/d4b70818e1a30a13c1736e59c96399af49ad91f9))
* a Markdown change asks for nine runners, not twenty-seven ([83a58ec](https://github.com/TheHefty/jvsl.env.agents.container/commit/83a58ec7c196c773554a29764d0eddb3cd96a542))
* a Markdown change asks for nine runners, not twenty-seven ([8cd5c81](https://github.com/TheHefty/jvsl.env.agents.container/commit/8cd5c81901f93b3468a4b6d65dce2fe2274a60fd))
* a refusal stays on screen, comes first, and offers no Apply ([3f0fa4c](https://github.com/TheHefty/jvsl.env.agents.container/commit/3f0fa4c387ae945f0b3e238c234f1cf93a7bb4b7))
* a refusal stays on screen, comes first, and offers no Apply ([aa53de6](https://github.com/TheHefty/jvsl.env.agents.container/commit/aa53de6aa374bbb30e2c916f8bb6ba836e4ad3c6))
* activation does not wait for the open flow ([9152330](https://github.com/TheHefty/jvsl.env.agents.container/commit/91523306e9ef97eb54c4e4d7e522c04738f6fe10))
* activation does not wait for the open flow ([b95d622](https://github.com/TheHefty/jvsl.env.agents.container/commit/b95d622e494ed2127a275c736d4ce1717f761c84))
* after a build, a container on the previous image is named and its recreation offered ([11c7276](https://github.com/TheHefty/jvsl.env.agents.container/commit/11c72768e651e9249c040352c5c5cbccf88d9b6c))
* after a build, a container on the previous image is named and its recreation offered ([b02d422](https://github.com/TheHefty/jvsl.env.agents.container/commit/b02d4220add5c281526020510a43be10e3a0c93f))
* agent-rules gates, and it took three attempts to put it in the right list ([1a79295](https://github.com/TheHefty/jvsl.env.agents.container/commit/1a792951dfff2590400ba64d4755b5ee273360e0))
* bd reports nothing about how it is used ([cca3ca0](https://github.com/TheHefty/jvsl.env.agents.container/commit/cca3ca073adc0252a9d6c008ad60edf7671b6e7b))
* bd reports nothing about how it is used ([cf78672](https://github.com/TheHefty/jvsl.env.agents.container/commit/cf7867297763d0902965eec7e28cbb4f49a147fd))
* bd's -C is not git's, and the stand-in now knows it ([644a8ae](https://github.com/TheHefty/jvsl.env.agents.container/commit/644a8aef70b53d1c03697feea8b18c6775412b41))
* Codex authenticates from its own file, and no secret crosses as a variable ([0da8cfd](https://github.com/TheHefty/jvsl.env.agents.container/commit/0da8cfdf4e83450ad5ccd90f873c7072a9ad2ff5))
* Codex authenticates from its own file, and no secret crosses as a variable ([987f47f](https://github.com/TheHefty/jvsl.env.agents.container/commit/987f47f09b16d9cc7e65e7404621f5bb427d8dcb))
* docker-compose is what the package is called on Debian ([e449944](https://github.com/TheHefty/jvsl.env.agents.container/commit/e449944f324cab5aabef2f7ba0b5f0633a351da4))
* every command finds the project on the host, not at the container's path ([39ffca4](https://github.com/TheHefty/jvsl.env.agents.container/commit/39ffca4f3f73fe315af2eba5e855a11e5ddbb9ee))
* every command finds the project on the host, not at the container's path ([1dbf81d](https://github.com/TheHefty/jvsl.env.agents.container/commit/1dbf81d0bf545f4a89f9de5061839a77fc24f301))
* every command name in the source is one the manifest contributes ([7ed3f7f](https://github.com/TheHefty/jvsl.env.agents.container/commit/7ed3f7f66a45082dc06626e750820f51e2579707))
* every command name in the source is one the manifest contributes ([12bb477](https://github.com/TheHefty/jvsl.env.agents.container/commit/12bb477566bfa123c068e94a8e4a8c6dd0c282b9))
* initialising the tracker leaves the person's repository alone ([bed26fd](https://github.com/TheHefty/jvsl.env.agents.container/commit/bed26fda1204534f1e9172292f1005ab5d69967e))
* initialising the tracker no longer commits into the person's repository ([0b5e951](https://github.com/TheHefty/jvsl.env.agents.container/commit/0b5e951837cd16457e7b626f9b70f4cabe7ce280))
* no build-time script runs unverified ([d96320f](https://github.com/TheHefty/jvsl.env.agents.container/commit/d96320f3b4987ea161ed65ff232e305abcada16c))
* no build-time script runs unverified ([a4b8473](https://github.com/TheHefty/jvsl.env.agents.container/commit/a4b847347446881d1644f0d09d1b21382730b9f6))
* no call to docker runs without a time limit ([da3759d](https://github.com/TheHefty/jvsl.env.agents.container/commit/da3759d82fc67175e6975236b251b1a044a636fa))
* no call to docker runs without a time limit ([8838b0c](https://github.com/TheHefty/jvsl.env.agents.container/commit/8838b0c17a6fe42fdd25c56d13d4bc282bb7122b))
* no stack hardcodes one distribution's package source ([06a5394](https://github.com/TheHefty/jvsl.env.agents.container/commit/06a53948dccb2463411a35011a7d5cef7fa656bb))
* no two commands share an id, so activation registers them all ([9c8319b](https://github.com/TheHefty/jvsl.env.agents.container/commit/9c8319b14018760e88f4e64865d80ba07bcad5be))
* nothing optional runs before the commands are registered ([75403c5](https://github.com/TheHefty/jvsl.env.agents.container/commit/75403c50c0b8219cfce92018336e8071fac7542f))
* nothing optional runs before the commands are registered ([5e52bbd](https://github.com/TheHefty/jvsl.env.agents.container/commit/5e52bbd5e688a8393965f918b99d4b719c181531))
* put back the manual-page directory the base image deletes ([8913a48](https://github.com/TheHefty/jvsl.env.agents.container/commit/8913a48e84b203e72a95f3f3602a397e31c75af5))
* the agent sandbox opens with ai-jail v2.6.4 ([1b24699](https://github.com/TheHefty/jvsl.env.agents.container/commit/1b2469950721a9741d6dae00a27b1d83eb0d919b))
* the agent state directories survive a /config that shadows the image ([39486ba](https://github.com/TheHefty/jvsl.env.agents.container/commit/39486ba739ed4fb22e3b85b8228a5951b3413587))
* the agent state directories survive a /config that shadows the image ([f83e751](https://github.com/TheHefty/jvsl.env.agents.container/commit/f83e75190e80ea60f7334618f6800527d7bac566))
* the beads fetch retries, because a 500 killed two builds ([398747b](https://github.com/TheHefty/jvsl.env.agents.container/commit/398747be82d1748e0f16aee41b9d189b5f35c03a))
* the boot dump keeps the line that says why ([8203e6e](https://github.com/TheHefty/jvsl.env.agents.container/commit/8203e6e9c05d45240f5881bbda2fded714792f2c))
* the boot says when the tracker is broken, and changes nothing ([8bdf4c5](https://github.com/TheHefty/jvsl.env.agents.container/commit/8bdf4c504d0f6510975a46e139891fe9b762d922))
* the boot says when the tracker is broken, and changes nothing ([aa81183](https://github.com/TheHefty/jvsl.env.agents.container/commit/aa81183bb7a5f2dc8d9894ec7de495be8120d2fd))
* the boot test captures output before searching it ([6f60ca4](https://github.com/TheHefty/jvsl.env.agents.container/commit/6f60ca40e0bfdc7ac9a49722baf71753884701a6))
* the build composes the stacks the manifest selects ([e4ec2a0](https://github.com/TheHefty/jvsl.env.agents.container/commit/e4ec2a0e6552314b719ff74ab76c3a96d96a5ef7))
* the build composes the stacks the manifest selects ([d47dd21](https://github.com/TheHefty/jvsl.env.agents.container/commit/d47dd21ba2c8762a0f025554a851c90404aeac07))
* the documents the image copies ship in the package ([5514ef8](https://github.com/TheHefty/jvsl.env.agents.container/commit/5514ef8bc81cb70cd9df2bd75a3abb48e34f4dd8))
* the duplicate key that made the workflow unreadable ([f2feb62](https://github.com/TheHefty/jvsl.env.agents.container/commit/f2feb62827ef98978725ea6f69e6467ceed5bf3d))
* the extension activates, and its image builds from the installed package ([bfff388](https://github.com/TheHefty/jvsl.env.agents.container/commit/bfff3885ed287cd100d42ecfd48d49623841c36a))
* the Go and Android archives are checked before they are unpacked ([4a481b9](https://github.com/TheHefty/jvsl.env.agents.container/commit/4a481b9478f9014846597fa0a012526bf953a082))
* the Go and Android archives are checked before they are unpacked ([860f63b](https://github.com/TheHefty/jvsl.env.agents.container/commit/860f63b9297d422e7bb6ce84e72a743f12b69dda))
* the hook, the image and CI run one shellcheck, the pinned one ([5769d13](https://github.com/TheHefty/jvsl.env.agents.container/commit/5769d13acdf510f47909c42d6a75de256f20ee48))
* the image carries ps, which Codex needs to start ([df68998](https://github.com/TheHefty/jvsl.env.agents.container/commit/df68998a118e0737ba06dd0a205682c07a19c237))
* the image carries ps, which Codex needs to start ([433eb52](https://github.com/TheHefty/jvsl.env.agents.container/commit/433eb529064a2eb9abae6a909098563ef0ce737c))
* the image carries the libraries a downloaded browser loads ([d1a9b8e](https://github.com/TheHefty/jvsl.env.agents.container/commit/d1a9b8e8096e076ac13f3e13c200e02410a08630))
* the image carries the libraries a downloaded browser loads ([204df61](https://github.com/TheHefty/jvsl.env.agents.container/commit/204df618292cf7c8172ce37df22c2151e58e6e2b))
* the image creates the mount points ai-jail's toolchain caches need ([8ab45b9](https://github.com/TheHefty/jvsl.env.agents.container/commit/8ab45b90a78c2e5a3eaa1cb5a67988facf0df333))
* the image declares a HOME, so connecting as abc means being at home ([fcbecf6](https://github.com/TheHefty/jvsl.env.agents.container/commit/fcbecf601f2ada2b270f40746216de60645fca15))
* the image declares a HOME, so connecting as abc means being at home ([93305b8](https://github.com/TheHefty/jvsl.env.agents.container/commit/93305b8d712e7998740a7259c15935c8c6800428))
* the integration fixture declares the image state ([402fa58](https://github.com/TheHefty/jvsl.env.agents.container/commit/402fa58ca36f66341de207af2bb7c317a86c4f03))
* the manifest test typechecks ([51a8e2f](https://github.com/TheHefty/jvsl.env.agents.container/commit/51a8e2f3f9c84e9559a252509be468afae9d87af))
* the migration ignores the generated devcontainer, and the debts index ([418eca5](https://github.com/TheHefty/jvsl.env.agents.container/commit/418eca5218628764425447da22d494b684f84cae))
* the migration ignores the generated devcontainer, and the debts index ([4293c23](https://github.com/TheHefty/jvsl.env.agents.container/commit/4293c23866f7babb0fe28ef55e7126f0e753d809))
* the migration runs against the real bd, not only its stand-in ([224d041](https://github.com/TheHefty/jvsl.env.agents.container/commit/224d0417a5a611a9eec1088a2ca74d35949cd8c7))
* the migration runs against the real bd, not only its stand-in ([6624226](https://github.com/TheHefty/jvsl.env.agents.container/commit/6624226806e6f0abfb5523b236553b6981f670fe))
* the migration's and the build's terminals run on the host, in either kind of window ([9794595](https://github.com/TheHefty/jvsl.env.agents.container/commit/9794595891bc38769ca41b60195b8897f54ef01e))
* the migration's and the build's terminals run on the host, in either kind of window ([a64f534](https://github.com/TheHefty/jvsl.env.agents.container/commit/a64f53435b1b3964ff8d27ed0b554794df569286))
* the node image test asks dpkg where nodejs came from ([cf84bf2](https://github.com/TheHefty/jvsl.env.agents.container/commit/cf84bf2cca46df2b63d5b7dde5a74a7f0dab4ac7))
* the package stops carrying what nothing reads ([7bf3fc7](https://github.com/TheHefty/jvsl.env.agents.container/commit/7bf3fc7ba9b2bc245c49a45523b81cf3519ccde6))
* the packaging test builds the artifact it inspects ([5434fd1](https://github.com/TheHefty/jvsl.env.agents.container/commit/5434fd15c5fa249aae5326e9e9316280e96f847c))
* the planning migration refuses a tracker whose configuration is missing ([1b39d34](https://github.com/TheHefty/jvsl.env.agents.container/commit/1b39d3470e3a55210a0fab2e5a70f53935d50e21))
* the planning migration refuses a tracker whose configuration is missing ([cb35703](https://github.com/TheHefty/jvsl.env.agents.container/commit/cb35703b06062ddef4a58d2f478966d733b43801))
* the planning migration refuses while another tool still reads the folders ([4ed6beb](https://github.com/TheHefty/jvsl.env.agents.container/commit/4ed6bebb9b7ea17d25d7b8e0c62fda78e03b0e84))
* the planning migration refuses while another tool still reads the folders ([ffed80f](https://github.com/TheHefty/jvsl.env.agents.container/commit/ffed80fbe330999489f7d7ac6e50e46acfe8cc9b))
* the planning migration runs only when asked for with --apply ([7c88e2c](https://github.com/TheHefty/jvsl.env.agents.container/commit/7c88e2cedd678de90060cef81dc58df7b63b9134))
* the planning migration runs only when asked for with --apply ([9f51ff7](https://github.com/TheHefty/jvsl.env.agents.container/commit/9f51ff7c8af36460cc98e117b038d50e7072f1ae))
* the size check's test builds its embedded repository in place ([9666910](https://github.com/TheHefty/jvsl.env.agents.container/commit/9666910f51a7f7beb8f40c29310323408edcb525))
* the size check's test builds its embedded repository in place ([40bc3c4](https://github.com/TheHefty/jvsl.env.agents.container/commit/40bc3c49dbe758a5a6e983b3bf9f0dac2110eb2b))
* the stand-in can drop privileges, and the failure says why it could not ([bbcf6bf](https://github.com/TheHefty/jvsl.env.agents.container/commit/bbcf6bf1dbf79f62b91ee853681385b90b364910))
* the test's workspace belongs to abc, as production's does ([ffbd9d1](https://github.com/TheHefty/jvsl.env.agents.container/commit/ffbd9d1509e9ab58ccf73f33a18c3aba05691108))
* the tracker hook survives a second boot ([418608e](https://github.com/TheHefty/jvsl.env.agents.container/commit/418608e65afb297df640f07d42038bcabf59ce24))
* the tracker hook survives a second boot ([a5584db](https://github.com/TheHefty/jvsl.env.agents.container/commit/a5584dba05566094d38bbd6201efb08f1427ef0f))

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

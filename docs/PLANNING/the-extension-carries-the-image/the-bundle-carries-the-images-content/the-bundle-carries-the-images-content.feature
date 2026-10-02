# Acceptance criteria for the story beside this file.
#
# Documentation first, and not executable: no Gherkin runner is wired to it.
# What holds the code to it is a test per scenario, named for the scenario, in
# this repository's CI.
#
# One scenario is @manual, and it is the boundary this story cannot see across:
# what a package *contains* is readable from the zip, and what an *installed*
# extension has on disk is not.

Feature: The bundle carries the image's content
  `core/` and `stacks/` travel inside the extension, so that a project needs
  nothing but the extension installed.

  Scenario: The image's content ships
    Given the extension is packaged
    Then every file under core/ and stacks/ is in the package
    And the paths match what the repository holds

  Scenario: The tests do not ship
    # Sixteen *.test.sh under those two directories, and thirteen more under
    # scripts/. They run in CI. An editor extension has no business carrying
    # the checks that guard it.
    Given the extension is packaged
    Then no *.test.sh is in the package
    And nothing under scripts/ is in the package

  Scenario: A stack added to the repository travels without anyone editing a list
    # The same property `discover-stacks` gives CI, on the other side of the
    # boundary. A hand-written list of what to package is how a stack ships
    # without its fragment, or does not ship at all.
    Given a new directory under stacks/
    When the extension is packaged
    Then that directory is in the package
    And no list of stacks was edited to make that happen

  Scenario: A file that is executable stays executable
    # Measured before this story was written: a .vsix preserves the mode, 755
    # as 755 and 644 as 644. So this is an assertion that it keeps doing so
    # rather than a repair. Eight non-test files carry the bit, and the image's
    # build chmods after every COPY anyway — what the bit matters for is
    # anything the *host* runs straight out of the package.
    Given a file that is executable in the repository
    When the extension is packaged
    Then it is executable in the package

  Scenario: Nothing ships that nobody asked to ship
    # The allowlist written in story 1 fails by existing when a new directory
    # appears in the package. Satisfying it is a deliberate act: each entry
    # says why it travels.
    Given the packaging assertion that lists what may ship
    When core/ and stacks/ are added to it
    Then every entry carries the reason it is there
    And an unlisted file still fails the assertion

  @manual
  Scenario: An installed extension has the files where the code looks for them
    # The package is a zip whose paths are prefixed `extension/`, and the
    # editor strips that prefix on install. Everything above reads the zip;
    # none of it reads an installation. Until something composes from these
    # files — story 3 — nothing would notice the prefix assumption being wrong.
    Given the packaged extension is installed in the editor
    When its installation directory is examined
    Then core/ and stacks/ are present at the path the extension computes

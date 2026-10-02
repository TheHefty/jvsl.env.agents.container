# Acceptance criteria for the story beside this file.
#
# Documentation first, and not executable. What holds the code to it is a test
# per scenario, named for the scenario, in this repository's CI.

Feature: A project needs nothing but the extension
  Opening a project writes the instruction files it needs and never overwrites
  anybody's work.

  Scenario: A project without instruction files gets them
    Given a project with no CLAUDE.md and no AGENTS.md
    When it is opened
    Then both are written from what the extension carries

  Scenario: A project that already has them keeps them
    # They are tracked in git and carry a project's own standing answers —
    # this extension's own CLAUDE.md is one, and the reference monorepo's is
    # 20 KiB of them. Overwriting is destructive in a way the generated
    # dev container configuration is not.
    Given a project whose CLAUDE.md this extension did not write
    When it is opened
    Then the file is untouched
    And the refusal names the file rather than failing quietly

  Scenario: Nothing activates on a submodule
    Given a project with no `.code-server/`
    When the editor starts in it
    Then the extension activates on its manifest

  Scenario: A project with the old submodule still opens
    # Every project built on the template has one today. It stops being read
    # rather than becoming an error, because an extension that refuses the
    # thing it is replacing strands everybody mid-migration.
    Given a project that still carries `.code-server/`
    When it is opened
    Then it opens
    And nothing is read from the submodule

# Acceptance criteria for the story beside this file.
#
# One scenario is @manual: what survives a window reload is not observable
# from inside the session that is about to be discarded.

Feature: Creating a project from nothing
  A directory, some answers, and a project that opens — without the person
  having written a file.

  Scenario: The questions include where the project goes
    Given the create entry
    When the questions are asked
    Then they cover the stacks, their versions, ai-memory, and the location

  Scenario: An empty directory is scaffolded
    Given a chosen directory that is empty
    When the project is created
    Then it carries a manifest, the instruction files, and .ai-memory.toml if asked for

  Scenario: A directory that is already somebody's work is refused
    # The same rule as the instruction files, for the same reason. git init
    # over an existing repository, or scaffolding over existing files, destroys
    # something the person did not offer up.
    Given a chosen directory that is not empty or is already a git repository
    When the project is created
    Then it refuses, naming what it found
    And nothing in that directory changed

  Scenario: Scaffolding initialises git and commits once
    Given a newly scaffolded directory
    When the scaffolding finishes
    Then it is a git repository with one commit
    And that commit contains the scaffolding

  Scenario: Creating is opening, after the scaffolding
    # Said as a requirement rather than left as an implementation note: two
    # flows that look similar and are implemented twice diverge, which is the
    # reason the launcher was deleted rather than kept as a fallback.
    Given a directory that has just been scaffolded
    When the extension continues
    Then it follows the same path as opening an existing project

  @manual
  Scenario: The handoff survives the window reload
    # vscode.openFolder restarts the extension host and discards everything in
    # memory. remote-containers.reopenInContainer takes no folder and acts on
    # the current window, so creating is two-phase by construction.
    Given a project that has just been created
    When the editor opens the new folder
    Then the extension continues into the container without being asked again

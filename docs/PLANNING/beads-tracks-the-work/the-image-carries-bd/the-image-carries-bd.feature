# Acceptance criteria for the story beside this file.
#
# **The scenarios name no mechanism on purpose.** Whether a project opts in with
# a marker file or a field in the manifest it already has is a task-design
# decision, and writing it here would settle it in the wrong document.
#
# One scenario is @manual, and it is the one that matters: that an agent inside
# the sandbox reaches the *same* database the boot hook prepared. Nothing
# observable from outside a running sandbox can tell that from reaching a
# different one successfully.

Feature: The image carries bd
  A project that opts in gets a work tracker with its database on the project's
  own volume, and a project that does not opt in is untouched by any of it.

  Scenario: The binary is the version that was pinned
    Given an image built from this extension's content
    When bd reports its version
    Then it is the version this repository pinned

  Scenario: What was fetched is what was published
    # The project ships an install script that pipes to a shell. A script that
    # fetches and executes verifies nothing about what it fetched, and the
    # release publishes a checksum file precisely so it does not have to be
    # trusted blind. Same rule as ai-jail and ai-memory.
    Given the image's build
    When it fetches the bd release
    Then it verifies the published checksum before installing it
    And the build fails when the checksum does not match

  Scenario: A project that did not opt in gets nothing
    # This widens what the agent can reach, so it widens only where somebody
    # asked. The cost of being wrong is a grant nobody wanted.
    Given a project with no opt-in
    When its container has booted
    Then there is no database
    And the sandbox was granted no access to one

  Scenario: A project that opted in has a database after boot
    # bd init is explicit and nothing works before it, which is the whole
    # reason a boot hook exists rather than a documented first step.
    Given a project that opted in
    When its container has booted
    Then a database exists where BEADS_DIR says
    And booting again leaves what is in it alone

  Scenario: The database is on the project's volume, not in the image
    # The lesson the state-directory debt left: a claim about a path under
    # /config is a claim about a mount, and only a booted container settles it.
    Given a project that opted in
    When the container is replaced by one built from a newer image
    Then what was in the database is still there

  Scenario: Nothing is written into the repository
    # Stealth is unconditional. The engine keeps versioned binary files, and a
    # repository that is not the user's to change must not receive them.
    Given a project that opted in
    When bd has been initialised and used
    Then the repository has no new tracked files
    And no git hook was installed

  Scenario: The sandbox is told where the database is, and can reach it
    Given a project that opted in
    When the agent's sandbox is built
    Then BEADS_DIR crosses into it
    And the database's directory is mapped writable

  @manual
  Scenario: An agent in the sandbox reaches the same database as the boot hook
    # **Both halves of the grant, because either alone is a wrong answer and
    # only one of them is a loud one.** A missing map fails. A missing variable
    # *succeeds* — bd resolves a different directory and reports success about
    # the wrong database, which is what ai-memory does today: without
    # AI_MEMORY_DATA_DIR it resolves /config/.local/share/ai-memory while the
    # server its boot hook started serves /config/ai-memory.
    #
    # No test outside a real sandbox can tell "the right database" from "a
    # database". This is observed once, by a person, in a container.
    Given a project that opted in, with work recorded in its tracker
    When an agent inside the sandbox lists the work
    Then it sees what was recorded
    And not an empty tracker it created itself

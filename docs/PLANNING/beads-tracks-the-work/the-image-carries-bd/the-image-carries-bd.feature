# Acceptance criteria for the story beside this file.
#
# **Regrilled on 2026-10-05.** The first version of this file was agreed and
# then invalidated the same day: it asserted `--stealth` and "nothing is written
# into the repository", and FR-116 reverses both. It is rewritten rather than
# edited, because a scenario patched to agree with a new decision is a scenario
# that describes what was built.
#
# The scenarios name no mechanism for opting in. Whether that is a marker file
# or a field in the manifest is a task-design decision, and settling it here
# would settle it in the wrong document.

Feature: The image carries bd
  A project that opts in gets a work tracker whose contents are versioned with
  the project, and a project that does not opt in is untouched by any of it.

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
    Then there is no tracker
    And the sandbox was granted no access to one

  Scenario: A project that opted in has a tracker after boot
    # bd init is explicit and nothing works before it, which is the whole
    # reason a boot hook exists rather than a documented first step.
    Given a project that opted in
    When its container has booted
    Then the tracker is initialised
    And booting again leaves what is in it alone

  Scenario: What the tracker holds is versioned with the project
    # FR-116, and the reversal that made this story worth rewriting. The work
    # items' content lives here now, so it has to travel with the clone and
    # reach a pull request like everything else does.
    Given a project that opted in
    When work is recorded in the tracker
    Then it is in a file the project tracks in git
    And that file is text a person can read

  Scenario: The tracker survives a rebuild
    # The lesson the state-directory debt left: a claim about a path under
    # /config is a claim about a mount, and only a booted container settles it.
    # Now doubled, because the content also lives in the repository — and the
    # two must not disagree after a rebuild.
    Given a project that opted in, with work recorded
    When the container is replaced by one built from a newer image
    Then the work recorded before is still there

  Scenario: The sandbox can reach the tracker
    Given a project that opted in
    When the agent's sandbox is built
    Then the agent can read and write the tracker

  @manual
  Scenario: An agent in the sandbox reaches the same tracker as the person
    # **The one that cannot be automated, and the reason it matters has not
    # changed with the reversal.** A missing grant fails. A missing BEADS_DIR
    # *succeeds* — bd resolves a different directory and reports success about
    # the wrong database, which is what ai-memory does today: without
    # AI_MEMORY_DATA_DIR it resolves /config/.local/share/ai-memory while the
    # server its boot hook started serves /config/ai-memory.
    #
    # No test outside a real sandbox can tell "the right tracker" from "a
    # tracker". This is observed once, by a person, in a container.
    Given a project that opted in, with work recorded in its tracker
    When an agent inside the sandbox lists the work
    Then it sees what was recorded
    And not an empty tracker it created itself

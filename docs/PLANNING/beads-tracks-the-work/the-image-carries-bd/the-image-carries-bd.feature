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

  Scenario: What the tracker holds travels with the code
    # FR-116, amended on 2026-10-06: the Dolt remote, not an exported file.
    # The requirement is unchanged, in the operator's words: change machine,
    # or clone the repository again, and carry on from where you left off.
    # Measured against bd v1.3.1: nothing is exported by default, and a clone
    # does not read an export without an explicit import. The tool's own sync
    # is its Dolt remote, and a clone's init found the pushed work unaided.
    Given a project that opted in, with work recorded
    When the operator approves a push of the code
    Then the tracker's contents are pushed to the same remote
    And not before that approval

  Scenario: A fresh clone carries on from where it left off
    # The whole of the requirement, at the level a person experiences it.
    Given a project whose tracker was pushed to its remote
    When it is cloned somewhere else and its container boots
    Then the work that was recorded is there

  Scenario: Initialising the tracker leaves the repository as the person left it
    # FR-121. Measured: a bare bd init commits on its own, sweeping in
    # whatever was staged, and installs agent instructions, session hooks
    # and a git hooks path nobody asked for.
    Given a project that opted in, with work staged but not committed
    When its container boots for the first time
    Then no commit was made
    And what was staged is still staged, and nothing else is
    And no agent instructions, session hooks or git hooks path were added

  Scenario: The tracker survives a rebuild
    # The lesson the state-directory debt left: a claim about a path under
    # /config is a claim about a mount, and only a booted container settles it.
    # Now doubled, because the content also lives in the repository — and the
    # two must not disagree after a rebuild.
    Given a project that opted in, with work recorded
    When the container is replaced by one built from a newer image
    Then the work recorded before is still there

  Scenario: The sandbox can reach the tracker
    # No grant is asked for. The tracker is inside the workspace, which the
    # sandbox already maps read-write — FR-103 asked for a map and a variable
    # and was struck once that became true by another route.
    Given a project that opted in
    When the agent's sandbox is built
    Then the agent can read and write the tracker
    And nothing was granted beyond the workspace it already had

  @manual
  Scenario: An agent in the sandbox sees the same work as the person
    # **What it watches changed when FR-103 was struck.** It used to watch for a
    # missing BEADS_DIR succeeding about the wrong database — a real failure
    # mode, measured on ai-memory, and one that needs a variable to be missing.
    # There is no variable now: the tracker is in the workspace and bd finds it
    # by walking up from the working directory.
    #
    # What remains is the claim underneath, which no test outside a real sandbox
    # can make: that walking up from *the agent's* working directory arrives at
    # the same database. ai-jail synthesizes /config, and whether the walk lands
    # where a person's does is observed once, in a container.
    Given a project that opted in, with work recorded in its tracker
    When an agent inside the sandbox lists the work
    Then it sees what was recorded
    And not an empty tracker it created itself

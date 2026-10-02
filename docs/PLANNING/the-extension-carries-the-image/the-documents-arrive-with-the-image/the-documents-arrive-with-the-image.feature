# Acceptance criteria for the story beside this file.
#
# Two scenarios are @manual. Both are about what a running container has and
# what an agent inside it was given, and neither is visible from outside one.

Feature: The documents arrive with the image
  The normative documents are delivered by the image and load without an
  import, so that a rule corrected in one place reaches every project that
  rebuilds.

  Scenario: The image carries them
    Given an image built from this extension's content
    When its filesystem is examined
    Then the normative documents are at a fixed path in it

  Scenario: They are written where they load from, on every boot
    Given a container starting
    When its boot hooks have run
    Then the documents are in /config/.claude/rules/
    And they were rewritten rather than merged with what was there

  Scenario: Writing them does not reach the host's own configuration
    # /config/.claude is bind-mounted from the person's own ~/.claude. A hook
    # writing the documents there would put one project's rules into every
    # project on that machine.
    Given a container whose /config/.claude comes from the host
    When the documents are written
    Then nothing under the host's own ~/.claude changed

  Scenario: Only what must govern every turn is resident
    # Everything in rules/ loads in every session. INITIALIZATION.md is
    # 13.4 KiB describing a moment that happens once.
    Given the documents the image carries
    When the boot hook chooses what to write to rules/
    Then it writes the modes and the rules
    And the rest stays readable at its path in the image

  @manual
  Scenario: An agent in the container is given the modes and the rules
    # The only check that matters and the only one nothing can automate: that
    # a session actually opens with them in context. Everything above asserts
    # the files are in the right place, which is not the same claim.
    Given a container built and started from this extension
    When an agent session begins in it
    Then the modes and the rules are in its context

  @manual
  Scenario: No approval dialog appears
    # The measurement this design rests on: an import resolving outside the
    # working directory is external, and declining its dialog once disables it
    # for good with nothing said afterwards. Loading from rules/ is supposed to
    # avoid the dialog entirely.
    Given a project opened in a container built from this extension
    When the first agent session begins
    Then no external-import approval is requested

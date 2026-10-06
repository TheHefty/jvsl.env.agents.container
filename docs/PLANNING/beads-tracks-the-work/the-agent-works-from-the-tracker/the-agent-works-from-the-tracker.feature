# Acceptance criteria for the story beside this file.
#
# **Written beside a story although story 2's file said it would be the last.**
# That sentence was true about the order the stories were planned in and false
# about the order they ship in: the migration has not run, so there is nowhere
# else for these to go yet. Corrected in story 2 rather than left standing.
#
# Both @manual scenarios are about the agent's behaviour over a session, which
# no assertion reaches — a rule can be written correctly and followed badly.

Feature: The agent works from the tracker
  The tracker is where the agent finds what is unblocked and records what was
  finished. It is not where work gets authorised.

  Scenario: What is unblocked can be reported
    Given a project whose work is in the tracker
    When the agent is asked what to do next
    Then it reports what has no open blocker

  Scenario: Reporting is not starting
    # FR-106. The tracker knows what is *possible*; it does not thereby decide
    # what happens. Every link in the chain is still agreed before the next is
    # written, and that is where this project has found most of its design
    # errors.
    Given an item the tracker says is unblocked
    When the agent reports it
    Then it has not begun that work
    And it waits

  Scenario: Work that was agreed is recorded as it happens
    Given work the operator has agreed to
    When the agent begins it
    Then the item says so

  Scenario: Finishing says why
    # A closed item with no reason is a row that went grey. The reason is what
    # makes the tracker readable a month later, which is the whole argument for
    # moving the prose into it.
    Given work that is finished
    When the agent closes its item
    Then the item carries why it was closed

  Scenario: Nothing is created without a gate
    # The chain is charter, SRS, epic, story with its scenarios, task, code —
    # each agreed before the next is written. An item that appeared because the
    # agent decided it should exist is content that never passed a gate.
    # The one exception, a debt recorded after a yes, is the next scenario.
    Given the agent working from the tracker
    When no new link has been agreed
    Then it creates no epic, story or task

  Scenario: A problem found along the way is recorded only with a yes
    # FR-106 and FR-117, amended on 2026-10-06. A defect found mid-task used
    # to live in the conversation and be lost with it. Recording it is the
    # operator's to allow, every time, and never authorises fixing it.
    Given the agent finds a problem outside the work it was given
    When it would record it
    Then it asks first
    And only after a yes is there a bug labelled defect
    And it has not started fixing it

  Scenario: The rules say this, and say it for projects that have no tracker
    # The normative documents ship in the image to every project, and most will
    # never opt in. A rule written as though a tracker always exists would be
    # false for them — the same shape as the scenarios rule story 2 amends.
    Given the normative documents
    When they are read by a project without a tracker
    Then what they require still describes that project

  @manual
  Scenario: A session actually works this way
    # A rule can be written correctly and followed badly, and nothing here can
    # see the difference. This is observed across a real session: that the agent
    # reports and waits rather than reporting and starting.
    Given a session with work available in the tracker
    When the agent is left to proceed
    Then it does not start what was not agreed

  @manual
  Scenario: The tracker is worth reading afterwards
    Given a week of work recorded this way
    When somebody reads the closed items
    Then they can tell what happened and why, without the pull requests

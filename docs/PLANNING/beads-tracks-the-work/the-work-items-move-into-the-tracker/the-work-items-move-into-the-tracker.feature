# Acceptance criteria for the story beside this file.
#
# **This is the last .feature file this repository writes beside a story**, and
# the behaviour it describes is what moves it. After this story the scenarios of
# a story live in the tracker with it; the rule that says where they live is
# amended in the same change, in both languages, because it ships to every
# project that bumps.
#
# One scenario is @manual, and it is the one that matters: whether a person
# reading a migrated story finds what the document said. Nothing automatic can
# tell content that survived from content that was merely copied.

Feature: The work items move into the tracker
  Every epic, story and task lives in the tracker, their documents are gone from
  the repository, and what travels with a clone is the tracker's remote.

  Scenario: Everything that exists is carried, closed work included
    # 5 epics, 14 stories, 25 tasks. Migrating only what is open would leave a
    # board showing the project's recent half rather than its shape.
    Given the planning documents this repository has
    When they are migrated
    Then every epic, story and task is in the tracker
    And the ones whose work is finished are there too, marked as finished

  Scenario: The hierarchy survives the move
    # A story belongs to an epic and a task to a story. That is the structure
    # the directories carried for free, and a flat list of fifty-eight items
    # would lose what a reader uses to navigate them.
    Given the migrated items
    When the tracker is asked what belongs to what
    Then each story is under its epic
    And each task is under its story

  Scenario: A story's acceptance criteria arrive with it
    Given a story whose scenarios were a .feature file
    When it is migrated
    Then its acceptance criteria are in the tracker with the story

  Scenario: The documents are gone
    # Not archived, not moved aside. Two places holding one document is where a
    # reader cannot tell which one the work followed.
    Given the migration has run
    When the repository is examined
    Then no epic, story or task survives as a file

  Scenario: Nothing is only in the history
    # The documents hold 285 KB of reasoning — why this order, what was
    # measured, what a change deliberately does not do. `git log` would still
    # have it, and nobody reads a deleted file.
    Given a document that was migrated
    When its item in the tracker is read
    Then what the document said is there

  Scenario: A clone carries the work
    # FR-116, amended on 2026-10-06: the tracker travels by its Dolt remote.
    Given the migration has run and the tracker has been pushed
    When the repository is cloned somewhere else and its container boots
    Then every migrated item is in its tracker

  Scenario: Debts move with their kind
    # FR-117, amended on 2026-10-06. A debt's kind is free text in today's
    # files, so the migration does not guess it: each is mapped by hand in
    # the change that carries this scenario, and a debt left out of that map
    # stops the migration before anything is deleted.
    Given the debts this repository has
    When they are migrated
    Then each is a bug in the tracker with exactly one of hotfix, shortcut or defect
    And a debt that was paid arrives closed, with why

  Scenario: The rules say where scenarios live
    # The inherited rules state that acceptance criteria live beside their story
    # as a .feature file, and the image ships a Gherkin extension for that
    # reason. This story makes that one of two places, so the rule is amended
    # rather than quietly broken — in both languages, because it ships to every
    # project that bumps.
    Given the normative documents
    When they are read after this story
    Then they describe both places acceptance criteria may live

  @manual
  Scenario: Somebody reading a migrated story finds what the document said
    # The only check that matters here and the only one nothing automates. A
    # migration can carry every field and still lose the thing the documents
    # were for: an argument that reads as an argument. Fifty-eight items of
    # structure proving nothing about one paragraph of reasoning.
    Given a story that was migrated
    When a person reads it in the tracker
    Then they can follow why it was ordered as it was, and what it refuses to do

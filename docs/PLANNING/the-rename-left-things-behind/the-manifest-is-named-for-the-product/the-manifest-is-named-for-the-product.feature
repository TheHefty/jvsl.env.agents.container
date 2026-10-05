# Acceptance criteria for the story beside this file.
#
# **Two scenarios are @manual**, and both are about a project that exists
# outside this repository: what happens on a real one carrying the old name,
# and that the editor wakes for it at all. Activation is the one thing no test
# here can observe — a test that runs is already past the question of whether
# anything ran.

Feature: The manifest is named for the product that reads it
  A project's manifest carries the name of the extension that reads it rather
  than of an archived template, and a project that still has the old name keeps
  working without anybody being told to fix it by hand.

  Scenario: The name exists in one place
    # The rename is the easy half; leaving one literal behind is the hard one,
    # and it is the failure this whole epic is about — nothing breaks, nothing
    # fails, and one path keeps looking for a file nobody writes any more.
    Given the extension's source
    When the manifest's name is read from it
    Then it is written out in exactly one place
    And every other use refers to that one

  Scenario: The declared name and the compiled name are the same
    # Activation cannot be a variable: package.json is data, read before any of
    # this extension's code runs. So the name exists twice by necessity, and
    # the two agreeing is something that has to be checked rather than assumed.
    Given the activation event in the extension's manifest
    When it is compared with the name the source uses
    Then they are the same name

  Scenario: A project with the new name is opened
    Given a project whose manifest has the new name
    When the extension reads it
    Then it finds the stacks and limits in it
    And nothing is renamed

  Scenario: A project with the old name is adopted
    # The migration the operator chose: find it, write the new one, remove the
    # old, and say so. The manifest is the extension's own file — written by
    # the configure flow — which is why it may do this at all.
    Given a project whose manifest has only the old name
    When the extension reads it
    Then the manifest is now at the new name
    And it holds what the old one held
    And the old name is gone
    And the person is told what was renamed

  Scenario: A project that has both keeps the new one
    # Two names disagreeing is somebody's situation, not a state to resolve by
    # guessing. Nothing is merged and nothing is deleted.
    Given a project that has a manifest under both names
    When the extension reads it
    Then the new one is used unchanged
    And the old one is left where it is
    And the person is told both exist

  Scenario: A file at the old name that is not a manifest is left alone
    # The line FR-113 draws. What this extension did not write is somebody's
    # work, and a file it cannot recognise is not its own however it is named.
    Given a file at the old name that does not parse as a manifest
    When the extension reads it
    Then nothing is renamed
    And nothing is deleted
    And the person is told it could not be read

  @manual
  Scenario: A real project carrying the old name still wakes the extension
    # The one thing no test in this repository can see. Activation happens
    # before any code of this extension runs, so a test that runs has already
    # passed the question it was asking. Observed once, on a host, with a
    # project that has only the old name.
    Given a project on a host, with a manifest under the old name only
    When its folder is opened in the editor
    Then the extension activates

  @manual
  Scenario: The rename is reported where somebody will see it
    # A file in a tracked repository changed without being asked for. Whether
    # that reads as helpful or as alarming is a judgement about wording, and no
    # assertion settles it.
    Given a project whose manifest was renamed on open
    When the person looks at what the extension said
    Then they can tell what changed and why, without reading the source

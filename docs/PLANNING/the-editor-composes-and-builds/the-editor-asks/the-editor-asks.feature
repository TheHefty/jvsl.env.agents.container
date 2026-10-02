# Acceptance criteria for the story beside this file.
#
# Documentation first, and not executable: no Gherkin runner is wired to it.
# What holds the code to it is a test per scenario, named for the scenario, in
# this repository's CI.
#
# One scenario is @manual and it is the view. Whether a tree reads clearly, and
# whether the numbers on it are the ones a person expects, is not what a test
# over a data structure answers. Everything else is a pure function over a
# manifest and a stacks directory, which is how the rest of this extension is
# tested without an editor.

Feature: The editor asks
  The five questions `whiptail` used to ask are asked by the editor, and the
  answers become the manifest that `setup` reads.

  Background:
    Given a project carrying an initialised `.code-server/`

  Scenario: The stacks offered are the ones the template has
    When the first question is asked
    Then every directory under the template's stacks is offered
    And nothing else is

  Scenario: A stack added to the template needs no change here
    # The same property the image's per-stack extension declarations have: the
    # list lives where the stacks do.
    Given a stack newly added to the template
    When the first question is asked
    Then that stack is offered

  Scenario: Each question defaults to what the manifest already says
    Given a manifest selecting a stack at a version, with limits
    When the questions are asked
    Then each one offers the manifest's own answer first

  Scenario: A version offered is one the stack has
    Given a stack selected
    When its version is asked
    Then the choices are exactly that stack's versions
    And the manifest's current value is offered first

  Scenario: A stack with no version recorded offers the lowest
    # The same default `setup` uses, so the two doors agree.
    Given a stack selected that the manifest does not mention
    When its version is asked
    Then the lowest version the stack lists is offered first

  Scenario: The answers become the manifest
    When every question is answered
    Then the manifest holds exactly those stacks at those versions, with those limits

  Scenario: A key the extension does not own survives
    # The manifest is the only per-project record of intent, and this repository
    # has already had one feature blocked by that file being rebuilt from
    # scratch.
    Given a manifest carrying a key neither the extension nor setup writes
    When the questions are answered
    Then that key is still there afterwards

  Scenario: A missing stack dependency is refused, naming the pair
    Given a stack selected whose requires.json names another that is not
    When the answers are confirmed
    Then it refuses, naming both stacks
    And the manifest is not written

  Scenario: Confirming with nothing changed still builds
    Given a manifest that the answers reproduce exactly
    When the answers are confirmed
    Then a build is still asked for

  Scenario: A project with no manifest is served
    # The reason activation had to change: no manifest meant no activation, and
    # the thing that produces a manifest was what would not start.
    Given a project with an initialised `.code-server/` and no manifest
    When the editor opens it
    Then the view appears
    And the questions can be asked

  Scenario: An uninitialised submodule is refused rather than offered an empty list
    Given a project whose `.code-server/` is empty
    When the view is asked for
    Then it says the submodule is not initialised and what to run
    And no question is asked

  @manual
  Scenario: The view says what is selected
    Given a project with two stacks and limits in its manifest
    When the sidebar view is opened
    Then it shows each stack with its version, and the limits
    And the action that asks the questions again is on it

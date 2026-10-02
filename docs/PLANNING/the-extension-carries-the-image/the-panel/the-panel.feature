# Acceptance criteria for the story beside this file.
#
# Two scenarios are @manual. A panel is a thing a person reads, and whether it
# reads clearly is not something a fixture can answer.

Feature: The panel
  One place to start, with no folder open, offering only what works.

  Scenario: It is there with no folder open
    Given an editor window with no folder
    When the extension has activated
    Then the panel offers creating a project and opening one

  Scenario: It offers nothing it cannot do
    # An entry for a capability that does not exist yet is a worse state than
    # no entry: it reports a defect where there is only an absence.
    Given a capability the extension does not have
    Then the panel has no entry for it

  Scenario: A host that cannot build says so before anything is offered
    # docker absent, or present and not usable by this user. The panel is the
    # first thing anybody sees, so it is the right place for a host problem to
    # surface rather than three clicks later.
    Given a host without a usable container runtime
    When the panel is shown
    Then it names what is missing and how to install it

  @manual
  Scenario: The panel reads clearly to somebody who has not seen it
    Given a person opening the editor for the first time with this installed
    When they look at the panel
    Then it is clear which entry creates and which opens

  @manual
  Scenario: Activating in every window costs nothing visible
    # onStartupFinished is the price of existing with no folder open: the
    # extension loads in every window on the host, including ones that have
    # nothing to do with this.
    Given an editor window for an unrelated project
    When it starts
    Then nothing of this extension is visible and startup is not noticeably slower

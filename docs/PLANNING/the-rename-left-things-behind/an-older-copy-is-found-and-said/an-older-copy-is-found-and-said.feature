# Acceptance criteria for the story beside this file.
#
# **The scenarios do not say how often "once" is.** Once per window, once per
# machine, or once until the older copy is gone are three different behaviours
# with three different costs, and this extension now activates in every window
# on the host. That is a task-design decision; settling it here would settle it
# in the wrong document.
#
# Two are @manual, and both are about a person rather than a program: whether
# the sentence is actionable, and whether a notice nobody asked for is welcome.

Feature: An older copy of this extension is found and said
  A rename changed this extension's identity, so installing the current one
  leaves the older one installed beside it — still offering commands it can no
  longer run. Nothing detects that for you, and nothing reports it as an error.

  Scenario: The older copy is installed
    Given a host with the older extension still installed
    When this extension starts
    Then it says that the older copy is there
    And it names what to remove

  Scenario: The older copy is not installed
    # Most hosts. An extension that says something on every start is one people
    # learn to ignore, including when it finally matters.
    Given a host with only this extension installed
    When this extension starts
    Then nothing is said about an older copy

  Scenario: Saying it does not stop anything
    # FR-115. The older copy costs a person time and a wrong belief, which a
    # sentence fixes; nothing about it stops this extension working, so nothing
    # about the notice may stop it either.
    Given a host with the older extension still installed
    When this extension starts
    Then everything it does otherwise is unchanged
    And nothing waits for the notice to be answered

  Scenario: What it names is what is actually installed
    # The identity is inferred from the publisher and the old package name
    # rather than read from anything. A notice telling somebody to remove an
    # extension that is not what they have is worse than no notice.
    Given the notice names an extension to remove
    When that name is compared with what the editor reports as installed
    Then they are the same

  @manual
  Scenario: Somebody who has not seen this before can act on it
    # The defect this exists for is an instruction that does nothing. A notice
    # about it that a person cannot act on would be the same defect wearing a
    # different hat.
    Given a host with the older extension installed
    When a person reads the notice without knowing the history
    Then they can tell which extension to remove, and how

  @manual
  Scenario: It is not a nuisance
    # The extension now activates in every window on the host. Whether "once"
    # was chosen correctly is not something an assertion settles — it is
    # whether a person opening five windows in a day feels informed or nagged.
    Given a person who works across several windows
    When they go about a normal day with the older copy installed
    Then they do not find the notice intrusive

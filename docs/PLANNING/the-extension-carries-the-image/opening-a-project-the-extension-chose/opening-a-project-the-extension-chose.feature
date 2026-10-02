# Acceptance criteria for the story beside this file.
#
# One scenario is @manual: a window reloading and reattaching is the thing a
# fixture cannot watch.

Feature: Opening a project the extension chose
  The extension picks the folder rather than the folder having been opened
  first, and builds what is missing instead of refusing.

  Scenario: The extension activates with no folder open
    Given an editor window with no folder
    When the extension's entry is used
    Then it is available

  Scenario: A folder with a manifest is built and opened
    Given a chosen folder carrying a manifest
    When it is opened through the extension
    Then its image is built if absent
    And the editor attaches to its container

  Scenario: A folder without a manifest is asked about
    # Adoption, and the cheap half of it. The epic this replaced specified
    # stack detection by heuristic, confirmed by the user; asking the question
    # a new project is asked has nothing to detect wrongly.
    Given a chosen folder with no manifest
    When it is opened through the extension
    Then the same questions a new project answers are asked
    And the answers are written as that folder's manifest

  Scenario: A missing image is built rather than refused
    # Reverses FR-23, which was right while building was another repository's
    # job.
    Given a project whose image does not exist
    When it is opened
    Then the image is built
    And the refusal that used to name the build command is gone

  @manual
  Scenario: The window reattaches to the container
    Given a folder chosen through the extension
    When the build finishes
    Then the editor reopens attached to that project's container

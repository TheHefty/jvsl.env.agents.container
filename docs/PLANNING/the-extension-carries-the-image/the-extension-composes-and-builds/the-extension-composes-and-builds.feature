# Acceptance criteria for the story beside this file.
#
# Documentation first, and not executable. What holds the code to it is a test
# per scenario, named for the scenario, in this repository's CI.

Feature: The extension composes and builds
  The Dockerfile is composed from what the extension carries, and built by the
  extension, so that nothing on the host is needed but the extension itself.

  Scenario: The composition is the one CI verifies
    # Story 1's seventh scenario, falling due. CI composes with
    # core/compose-dockerfile.sh; if the extension composed differently, CI
    # would be verifying an image nobody runs.
    Given the extension composes a project's Dockerfile
    When CI composes the same project's Dockerfile
    Then both used one implementation

  Scenario: A project with no setup script still builds
    Given a project with a manifest and no `.code-server/`
    When the build is run from the editor
    Then an image is built for that project

  Scenario: The build reads the files the extension carries
    # Not the repository's copies. A developer running from a checkout and a
    # user running from an installed .vsix must compose from the same place,
    # or the thing that ships is not the thing that was tested.
    Given the extension is installed rather than run from a checkout
    When it composes a Dockerfile
    Then it reads core/ and stacks/ from its own installation

  Scenario: A composition that cannot be written refuses, naming why
    Given a directory the extension cannot write to
    When the build is run
    Then it refuses naming the path and the reason
    And no partial Dockerfile is left behind

  Scenario: The build is interruptible and its output survives
    # Carried over from the story that first ran setup in a terminal: a build
    # takes minutes, writes a great deal, and has to be readable afterwards.
    Given a build running in an editor terminal
    When the person closes the terminal
    Then the build stops
    And what it printed is still readable

  Scenario: A cancelled build is not a failed one
    Given a build the person cancelled
    When the extension reports the outcome
    Then it does not report a failure

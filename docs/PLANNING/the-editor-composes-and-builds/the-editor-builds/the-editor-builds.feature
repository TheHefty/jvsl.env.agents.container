# Acceptance criteria for the story beside this file.
#
# Documentation first, and not executable: no Gherkin runner is wired to it.
# What holds the code to it is a test per scenario, named for the scenario, in
# this repository's CI.
#
# Two scenarios are @manual and both need a terminal to exist. Everything else is
# a pure function: which command would be composed, which package name a manager
# maps to, what a given exit status means.

Feature: The editor builds
  The build runs from the editor, with `setup` as a terminal's own process, and
  what the host is missing is named before anything starts.

  Scenario: The build is the script, not a command typed into a shell
    When a build is asked for
    Then the terminal's process is `setup` itself
    And nothing is written into the terminal as text

  Scenario: The script is not asked any questions
    # createTerminal gives its process a pty, and a pty is what setup uses to
    # decide whether to ask. Without this the build stops on questions the editor
    # has already asked.
    When a build is asked for
    Then the script's standard input is not a terminal

  Scenario: A path with a space in it is still the path
    Given a project whose directory name contains a space
    When a build is asked for
    Then the script that runs is the one in that directory

  Scenario: A missing host tool is named with its package
    Given a host without `jq`
    When a build is asked for
    Then it refuses, naming `jq` and the package this distribution installs it from
    And no terminal is opened

  Scenario: A docker that is installed and not usable is told apart from an absent one
    Given a host where `docker` exists and the daemon refuses this user
    When a build is asked for
    Then the refusal says it is not usable by this user, not that it is missing

  Scenario: The package name comes from the manager this host has
    Given a host whose package manager is each of apt, dnf and pacman in turn
    When a package name is needed
    Then it is the name that manager uses

  Scenario: A host check that cannot answer in time says so
    # `docker info` hangs when the daemon is unreachable rather than failing, and
    # an activation that hangs is a window opening slowly with nothing saying why.
    Given a docker that does not answer
    When the checks run on activation
    Then the result is unknown rather than bad
    And activation is not held up

  Scenario: A failed build leaves its state where it can be found
    Given a build that exits non-zero
    Then the view says the last build failed
    And it leads to the terminal holding the error
    And no notification is raised

  Scenario: A cancelled build is not a failed one
    Given a build whose terminal is closed before it finishes
    Then the view says it was cancelled
    And it does not say it failed

  @manual
  Scenario: The build really runs, and reads
    When a build is asked for on a real project
    Then the terminal shows `docker build` progressing
    And the output can be scrolled back through afterwards

  @manual
  Scenario: Closing the terminal stops the build
    Given a build in progress
    When the terminal is closed
    Then the build stops
    And the view says cancelled rather than failed

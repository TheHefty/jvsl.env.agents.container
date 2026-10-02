# Acceptance criteria for the story beside this file.
#
# Documentation first, and not executable: no Gherkin runner is wired to it.
# What holds the code to it is a test per scenario, named for the scenario.
#
# Nothing here is @manual. Every claim is about what a pure function decides
# given what the host looks like, which is the shape this repository's code
# already has.

Feature: The configuration declares no editor's variable
  The generated configuration carries nothing that only the editor in the image
  read, and the template version this extension claims to need is true and
  enforced.

  Scenario: The generated configuration declares no password
    When a configuration is generated
    Then it declares no password variable

  Scenario: What the base image needs is still declared
    # PUID and PGID are the base image's, not the editor's, and the whole
    # ownership arrangement rests on them being applied.
    When a configuration is generated
    Then it still declares the user and group ids

  Scenario: A template older than the extension needs is refused
    Given a project whose template is older than the minimum
    When it is opened
    Then it is refused, naming the version found and the minimum
    And nothing is written

  Scenario: A template version that cannot be read is a different refusal
    # Saying "too old" for a file that is not there sends somebody to bump a
    # submodule that was never initialised.
    Given a project whose template version cannot be read
    When it is opened
    Then it is refused, saying the submodule is probably not initialised
    And it does not say the template is out of date

  Scenario: A template at the minimum is opened
    Given a project whose template is exactly the minimum
    When it is opened
    Then it is not refused for its version

  Scenario: The old launcher's container is still refused
    # The launcher is gone from the template and not from somebody's machine.
    Given a container from this project's old launcher is running
    When it is opened
    Then it is refused, naming that container

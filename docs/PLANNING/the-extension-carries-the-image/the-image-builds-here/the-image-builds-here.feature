# Acceptance criteria for the story beside this file.
#
# Documentation first, and not executable: no Gherkin runner is wired to it.
# What holds the code to it is a test per scenario, named for the scenario, in
# this repository's CI.
#
# **Nothing here is @manual, and that is unusual for this project.** Every other
# story so far has owed a pass that no CI can see — a window reopening, a tree
# reading clearly, extensions actually installed. This story is *about* CI, so
# every claim it makes is a claim about something CI does, and CI can be made to
# say it.

Feature: The image builds here
  This repository builds and verifies the image it will ship, so that moving
  4629 lines of shell into it is a move whose result is checked rather than
  asserted.

  Scenario: Every stack the repository offers is built
    # Derived from the tree, never from a list written by hand beside it. A
    # stack added without its build is the whole failure this story exists
    # against, and a hand-written matrix is how that happens.
    Given the stack directories in the repository
    When the pipeline runs
    Then one image is built for each of them
    And the list of stacks built was read from the tree

  Scenario: Each stack's own assertions run inside its built image
    # An image that builds is not an image that works. `php` asserts the
    # manifest's version answers and composer runs; `python` asserts a C
    # extension compiles, links and imports.
    Given a stack that carries its own in-image assertions
    When its image has been built
    Then those assertions run inside that image
    And their names appear in the output

  Scenario: No check that ran before the move fails to run after it
    # The risk the move actually carries. A dropped job does not fail — it
    # reports nothing, and a guard that reports nothing is indistinguishable
    # from a guard that passes.
    Given every test file the repository tracks
    When the pipeline's definition is examined
    Then each of them has something that runs it
    And a test file with no runner fails the examination

  Scenario: A test reached only through a matrix still counts as run
    # Measured while writing this story: grepping the workflow for each test
    # file's path reports three of twenty-nine missing. All three are
    # `stacks/<name>/image.test.sh`, invoked as `stacks/${{ matrix.stack }}/…`,
    # and all three do run. A check that cannot see that is a check that cries
    # wolf until somebody stops reading it.
    Given a test invoked through a matrix variable rather than by its path
    When the examination above runs
    Then it is reported as having a runner

  Scenario: A documentation-only change builds no images
    Given a change that touches only Markdown
    When the pipeline runs
    Then no image is built
    And the pipeline still reports success as a whole

  Scenario: A failing in-image assertion fails the pull request
    # Not merely the job. One required check stands in front of branch
    # protection, and it has to tell a skipped job from a failed one — a
    # distinction this project has already got wrong once.
    Given a stack whose in-image assertion fails
    When the pipeline runs
    Then the single required check fails
    And a pipeline whose image jobs were skipped reports success

  Scenario: What CI builds is what will be shipped
    # The window this story opens and story 3 closes. CI composes the image the
    # way the thing that ships composes it; if the two ever differ, CI is
    # verifying something nobody runs.
    Given the composition this repository uses to build
    When the extension later composes the image itself
    Then both use one implementation, changed in one place

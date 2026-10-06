# Acceptance criteria for the story beside this file.
#
# **Written beside the story, not in the tracker, for the same reason story 4's
# were**: the migration has not run, so there is nowhere else for them yet.
#
# Two scenarios are @manual. Whether the board reads well, and whether it is
# where the operator actually reads before approving, are judgements about a
# page, not assertions about one.

Feature: The board shows the work
  A page in the editor shows what the project's tracker holds, in two views,
  and only shows it. Approval stays a sentence the operator says.

  Scenario: It opens from where the project already is
    Given a project whose container is running and that has a tracker
    When the operator runs the command that shows the work, or picks it in the Agent Container panel
    Then a page opens with what the tracker holds

  Scenario: Two views of the same reading
    # Chosen by the operator on 2026-10-06: columns by state, as on a Trello
    # board, and the hierarchy as a tree. One reading feeds both, so the two
    # can never disagree about what the tracker holds.
    Given the page is open
    Then one view shows the items in columns by their state
    And the other shows them as epics, their stories, and their tasks
    And both show the same items

  Scenario: An item's content can be read
    # FR-118: the content, not only the title.
    Given an item on either view
    When the operator opens it
    Then its full text is shown as formatted text
    And so are its acceptance criteria, its design, and why it was closed, where it has them

  Scenario: A proposal stands apart, and is read before it is agreed
    # The epic's purpose in the operator's words: "preciso de lugar pra ler,
    # quando aprovar eu venho aqui e digo aprovado". FR-106, amended on
    # 2026-10-06: a draft is an item labelled proposed, deferred so nothing
    # treats it as work, until the operator says it is agreed.
    Given an epic, story or task the agent has proposed
    When the page is open
    Then it is marked as a proposal on both views, apart from agreed work
    And its full text can be read there before the operator answers

  Scenario: Debts are shown as debts
    # FR-117, amended on 2026-10-06.
    Given a debt in the tracker
    When it is shown
    Then its kind is visible: hotfix, shortcut or defect

  Scenario: The page writes nothing
    # FR-118. Every command it runs only reads, and it offers no control that
    # changes an item. Approval is not on it.
    Given the page is open
    Then nothing on it changes the tracker
    And nothing it runs could

  Scenario: What an item says cannot act on the page
    # The text of an item is content somebody wrote, and the page renders it.
    # A script or a link inside it must not run or reach anything.
    Given an item whose text contains a script, or markup that tries to load something
    When the operator opens it
    Then it is shown as text, and nothing in it runs or loads

  Scenario: A stopped container is said, not guessed around
    # Chosen by the operator on 2026-10-06: the tracker is read from inside
    # the container, so a stopped container means no reading. No snapshot is
    # kept, because a stale board that looks current is the worse failure.
    Given a project that has a tracker and whose container is not running
    When the page is opened
    Then it says the container is not running and that the tracker is read from inside it
    And it shows no items

  Scenario: A project without a tracker is told how to get one
    Given a project that never opted in
    When the page is opened
    Then it says the project has no tracker, and how a project asks for one

  Scenario: A reading that fails says why, and does not hang
    Given a project whose tracker cannot be read
    When the page is opened
    Then within a bounded time it says what failed
    And the editor is not left waiting on it

  Scenario: It reads again when asked
    # Agreed on 2026-10-06: the page reads when it opens and when it is asked
    # to, and does not poll.
    Given the page is open and the tracker has changed
    When the operator asks it to read again
    Then it shows what the tracker holds now

  @manual
  Scenario: The board reads well
    Given a project with its planning migrated into the tracker
    When the operator opens the board
    Then both views can be followed without explanation

  @manual
  Scenario: It is where reading happens before approval
    # The epic's purpose, observed rather than asserted.
    Given a week of work with the board available
    When the operator approves an epic, story or task
    Then they read the proposal on the board first

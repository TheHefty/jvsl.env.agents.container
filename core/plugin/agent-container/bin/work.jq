# The one definition of a debt the ceremonies share, included with
#   jq -L <this folder> 'include "work"; …'
# (task refinement-plans-a-debts-fix-as-tasks-under-it). A debt is a bug labelled
# with one of the kinds the board already knows; it is like a story, and its fix
# is planned at refinement as tasks under it. A bug with none of these labels is
# not a debt by the rules' definition, and the ceremonies do not treat it as one.
def debt_kinds: ["defect", "hotfix", "shortcut"];
def is_debt: .issue_type == "bug" and ((.labels // []) | any(. as $l | debt_kinds | index($l)));

# A task closed by refine-reject, from the reason it writes: rejected, not done.
# refine-candidates.test.sh feeds it the real script's reason, so the two cannot
# drift apart (debt ay8).
def rejected: (.close_reason // "") | startswith("Rejected in refinement:");

# Experiment cloning plan

## Goal
Implement `experiment-duplication`: clone an experiment's configuration into a new no-run draft and provide the requested accessible UI flow.

## Phases
- [completed] Trace current experiment data, routes, and UI patterns.
- [completed] Bring the committed experiment-history dependency into this otherwise empty feature worktree.
- [completed] Implement server cloning and navigation/state handling.
- [completed] Implement list/detail clone controls, warnings, empty state, and accessibility.
- [completed] Run targeted checks and a temporary Playwright verification; remove its test file.
- [completed] Review diff and document results.

## Decisions
- Preserve the existing component, button, menu, badge, toast, and empty-state patterns where present.
- This branch starts at an empty initial commit; `feature/experiment-history-list-c2badad4` is the committed source baseline that contains the required experiment schema, auth, and history UI.

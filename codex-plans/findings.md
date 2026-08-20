# Findings

- The assigned branch is an empty initial commit (`6d5e5c2`), so it cannot implement this feature alone.
- `feature/experiment-history-list-c2badad4` (`e1b76dc`) is a committed, compatible baseline. It contains the schema, auth-scoped server functions, experiment history list, status badges, empty state, Vite configuration, and Playwright configuration.
- Current schema connects experiments -> templates -> variables -> variants and records runs under run_batches. Evidence belongs to response/observation records, so a clone must deliberately create none of these downstream records.
- Existing history actions are inline buttons labelled "Duplicate" rather than the requested kebab menu, and no experiment detail editor currently exists.
- The clone implementation is transaction-scoped and inserts a draft experiment, templates, variables, and variants only. The new migration stores the source experiment reference for persistent "Cloned from" metadata.

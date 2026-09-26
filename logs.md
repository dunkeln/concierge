# Observed issues

Record a new entry only when a failure or limitation is observed and useful to revisit. Keep private data and secrets out.

## Entry format

### YYYY-MM-DD — Short symptom

- Evidence: What happened and where it was observed.
- Hypothesis or cause: What explains it; mark uncertainty.
- Change: What was done, or `open`.
- Verification: What was checked and what remains unproven.
- Regression guard: The smallest repeatable check, if one exists.
- Remaining limit: What this check still does not prove.

## Entries

### 2026-09-26 — SevenRooms inspection can fall back to links

- Evidence: A local reservation probe hit a dynamic iframe/CDP error during Stagehand inspection.
- Hypothesis or cause: The page's dynamic iframe changed while the browser client was inspecting it; the precise cause is unconfirmed.
- Change: The reservation capability catches inspection failures and returns candidate links without claiming availability.
- Verification: A later Ai Fiori probe showed visible times for a selected date and party size. The failure is intermittent.
- Regression guard: Repeat a dated venue query and check that the response either contains times verified against page buttons or labels the links as uninspected.
- Remaining limit: Visible times may be incomplete; no booking flow has been proven.

# CON-5 acceptance record

CON-5 is split into independently reviewable implementation PRs, with one dependency where Slack startup code overlaps:

1. [#132: chat](https://github.com/buluma/redmine-dashboard/pull/132): derive the welcome message and preserve conversation state across locale changes.
2. [#133: search](https://github.com/buluma/redmine-dashboard/pull/133): abort obsolete searches, scope results to their query, and render threshold/empty states correctly.
3. [#134: issues](https://github.com/buluma/redmine-dashboard/pull/134): scope loading/results to the active request and derive cached transition-status fallback.
4. [#135: conditional requests](https://github.com/buluma/redmine-dashboard/pull/135): scope notes to the active issue and abort obsolete modal project loads.
5. [#136: polling](https://github.com/buluma/redmine-dashboard/pull/136): cancel obsolete user/query scopes, ignore stale refresh callbacks, recover errors, and clean up intervals.
6. [#137: preferences](https://github.com/buluma/redmine-dashboard/pull/137): subscribe to storage without writing hydration defaults over saved preferences.
7. [#138: browser state](https://github.com/buluma/redmine-dashboard/pull/138): derive capabilities/connectivity and show Slack timestamps only after real refreshes. Depends on #137.
8. This acceptance record and a real SSR-to-client preference hydration regression test. Based on #138; evaluate the combined behavior after the other implementation PRs are integrated.

## Local validation

Validated on 2026-10-25 with the frozen Bun lockfile, Node 24.18.0, generated SQLite Prisma client, and a native SQLite binding matching Node 24. Implementation branches were merged into a local integration branch without conflicts (implementation merge `52ed14b0c56b858328b2ee5e251101e8f9a3afb9`). No implementation PR was merged on GitHub.

- The full suite ran 977 tests: 973 passed and four exceeded the default five-second timeout on the loaded host.
- All four timeout cases passed on a rerun with a 30-second timeout. That rerun also covered the affected components/hooks and the new hydration test: 55 tests passed across 17 files.
- The final notes/dashboard scope guards passed 21 tests across two files, including two additional regressions for callbacks retained from an obsolete scope.
- Full TypeScript checking passed.
- Full ESLint passed with three existing Next.js navigation warnings outside this task's changes.
- All 16 original reason-tagged `react-hooks/set-state-in-effect` suppressions were removed. Other pre-existing suppressions, including those in the i18n provider and page-size hook, remain outside CON-5's scope.

The production build result is recorded below after completion.

## Browser acceptance

Chromium exercised the combined React components in a temporary local fixture page under the application's normal layout. Fixture APIs returned deterministic local data; no Redmine, Slack, AI provider, or production data was modified. The temporary page was removed after testing.

Passed checks:

- Saved metrics preferences survive startup.
- Issue switching settles on the current issue, notes and dashboard query, with loading completed.
- An older search response cannot replace a newer result; clearing the query hides results immediately.
- A chat question and response remain visible after changing locale.
- The create modal loads its project list and continues working after close/reopen.
- Sync/AI status completes initial loading; unsupported push capabilities do not prevent rendering.
- No uncaught browser page errors occurred.

Deterministic tests additionally cover SSR output, actual preference hydration without recoverable errors or startup writes, malformed/blocked storage, polling failure/recovery, interval cleanup, offline transitions, and late responses.

Live-provider behavior and deployed production behavior were not tested. This record covers the local integration of the proposed changes.

## Remote checks and merge order

GitHub Actions jobs did not start. The check annotation states: "The job was not started because recent account payments have failed or your spending limit needs to be increased."

Restore Actions availability and run fresh checks before merging. Merge #137 before #138, then retarget #138 to master. The other implementation PRs target master independently. Integrate all implementation scopes before accepting CON-5; this acceptance PR alone does not deliver them.

# Remediation Plan

## Purpose

This document records the improvement work identified in the September 2026 audit, in the order it should be completed. It distinguishes work already started from work that needs a terminal-backed validation or a product/design decision.

## Shipped

These items from the original audit are done and merged — kept here as a record, not as open work:

1. **Deterministic linting** — `eslint.config.mjs` ignores `Redmine dashboard revamp/**`. That directory is intentionally gitignored, contains local design-export artifacts rather than product source, and was making `bun run lint` fail in worktrees where it exists.
2. **Dependency remediation** — `bun audit fix` updated `bun.lock`, resolving the reported vulnerabilities by updating transitive packages, including `@xmldom/xmldom`, `browserslist`, `fast-uri`, `js-yaml`, `sharp`, and Vitest internals. Root-level overrides pin the two transitive paths that stayed on vulnerable versions to patched releases. `bun audit --audit-level=high` reports no vulnerabilities.
3. **CI audit gate** — `.github/workflows/ci.yml` has a separate `audit` job running `bun run audit` (`bun audit --audit-level=high`) after a frozen install.
4. **Transitive advisory overrides** — `package.json` pins the vulnerable `browserslist` and `js-yaml` resolution paths to patched releases, with the corresponding entries recorded in `bun.lock`.
5. **Browser CI coverage** — `.github/workflows/ci.yml` runs an `a11y` job and a matrix `e2e` job (smoke, auth-csrf, external-api), each provisioning its own SQLite database and uploading Playwright artifacts on failure. These have real green runs on `master`, not just a local dry run.
6. **Saved views unified on the server** — the competing localStorage/Prisma-backed shapes are gone. `SavedView` is the single source of truth, legacy localStorage views migrate once on hydration, and optimistic UI updates are retained (`src/hooks/useDashboardSavedViews.ts`, `app/api/saved-views/*`).
7. **`app/issues/[id]/page.tsx` split (in progress, most of the way there)** — description, subtickets, markdown rendering, activity tabs (history/notes/internal-notes/properties/time-entries), comment form, and overview cards are extracted into `src/components/issue-detail/*`. Remaining: GitHub links/relations/metadata sections and the mutation logic itself are still inline; no dedicated data-fetching/mutation hooks yet.

## Descoped

- **Offline mutation conflict handling** (`expectedUpdatedAt`/version-on-mutation, 409 + merge/keep/discard UI, shared PWA/Android contract) — not required. Nothing changes here from what the app has today; do not build this without a new, explicit product decision to revisit it.

## Ordered work

### 1. Put the Android client on the delivery path

Priority: high

The Compose client is a supported application surface but is not represented in the current CI pipeline.

- Add a separate Android CI job using the Gradle wrapper: `assembleDebug`, `lintDebug`, and JVM unit tests.
- Cache Gradle safely and keep Android SDK/JDK versions pinned.
- Establish a first test floor for `ConvergeRepository` and `SecureTokenStore`; add one Compose UI test per primary screen. (`OfflineSyncWorker` conflict-handling coverage is out of scope — see Descoped above.)
- Harden release builds after CI is green: minification/resource shrinking, ProGuard rules, release signing, no cleartext release networking, safe Sentry privacy defaults, adaptive/round icons, and versioning policy.

Validation:

```sh
cd mobile/android-native
./gradlew assembleDebug lintDebug test
```

### 2. Finish reducing high-risk module complexity

Priority: high

- Finish `app/issues/[id]/page.tsx`: extract the remaining GitHub links/relations/metadata sections and move fetching/mutations into focused hooks, matching the pattern already used for the sections listed under Shipped.
- Apply the same incremental approach to `src/lib/sync.ts`, then the large Slack and AI client modules. Avoid broad mechanical refactors.
- Add regression tests before each extraction and keep API behavior unchanged.

Completion criteria:

- Each module has a clear owner/responsibility boundary.
- Existing tests pass; new tests cover changed mutation/error paths.
- Lint, typecheck, build, and the relevant browser specs are clean.

### 3. Reconcile and maintain planning documentation

Priority: follow-up

`IMPROVEMENTS.md` has its own `## 0. Status` section tracking shipped items, but line-count/path references elsewhere in the backlog can still drift from the current repository state as extractions land.

- Mark shipped items with their verification reference or move them to the completed-history section.
- Keep only actionable items in the active backlog, with owner, priority, dependency, and acceptance criteria.
- Update stale line-count and path references while touching each item.

## Resuming from a terminal

Start with section 1 (Android CI) or section 2 (module complexity) — they're independent. Commit each numbered section separately so Android and behavior changes remain easy to review and revert.

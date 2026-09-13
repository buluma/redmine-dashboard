# Remediation Plan

## Purpose

This document records the improvement work identified in the September 2026
audit, in the order it should be completed. It distinguishes work already
started from work that needs a terminal-backed validation or a product/design
decision.

## Current working-tree changes

These changes have been made locally and are not committed:

1. **Deterministic linting** — `eslint.config.mjs` now ignores
   `Redmine dashboard revamp/**`. That directory is intentionally gitignored,
   contains local design-export artifacts rather than product source, and was
   making `bun run lint` fail in worktrees where it exists.
2. **First-pass dependency remediation** — `bun audit fix` updated `bun.lock`.
   It resolved 18 reported vulnerabilities by updating transitive packages,
   including `@xmldom/xmldom`, `browserslist`, `fast-uri`, `js-yaml`, `sharp`,
   and Vitest internals. Root-level overrides now select patched releases for
   the two transitive paths that remained pinned to vulnerable versions.
3. **CI audit gate** — `.github/workflows/ci.yml` now has a separate `audit`
   job running `bun audit --audit-level=high` after a frozen install.
4. **Transitive advisory overrides** — `package.json` pins the vulnerable
   `browserslist` and `js-yaml` resolution paths to patched releases, with the
   corresponding entries recorded in `bun.lock`.
5. **Browser CI coverage** — `.github/workflows/ci.yml` now runs separate
   `a11y`, `e2e-smoke`, `e2e-auth-csrf`, and `e2e-external-api` jobs. Each
   provisions its own SQLite database, and each uploads Playwright artifacts
   on failure.

Validation checkpoint (2026-09-13, Node 24.19.0 / Bun 1.4.2): frozen install,
lint, typecheck, 84 test files/818 tests, production build, and `git diff
--check` pass. `bun audit --audit-level=high` now reports no vulnerabilities.
The workflow passes `actionlint`; browser jobs still require CI/Chromium
execution for terminal-backed validation. A local smoke attempt was blocked
because the Playwright Chromium binary is not installed in this environment;
the server itself started, but no browser assertions ran.

The baseline is ready for review; run the validation checklist below again in
CI before merging.

## Ordered work

### 1. Finish and verify the quality/dependency baseline

Priority: immediate

- Keep the ESLint ignore scoped to the local design-export directory; do not
  loosen rules for application code.
- Review the `package.json` and `bun.lock` audit diff and run
  `bun audit --audit-level=high`.
- Revisit the overrides when `@serwist/next` and `swagger-ui-react` publish
  releases that widen or remove their vulnerable transitive pins. Do not add
  blanket audit suppressions.
- Keep the CI audit job failing on high/critical findings. If a temporary
  exception is unavoidable, document the advisory, exposure, owner, and expiry
  in the repository.

Validation:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
bun audit --audit-level=high
git diff --check
```

### 2. Make CI execute the intended browser coverage

Priority: immediate

Current state: CI now executes the repository's a11y, smoke, auth/CSRF, and
external-API browser specs as separate jobs. The new jobs have not yet had a
remote CI run from this working tree.

- Split browser testing into clearly named jobs if runtime requires it:
  `a11y`, `e2e-smoke`, `e2e-auth-csrf`, and `e2e-external-api`.
- Ensure every job uses its own disposable SQLite database and provides the
  same encryption/session environment contract.
- Keep fixture-writing specs serial and preserve their cleanup behavior.
- Upload Playwright traces/screenshots on failure.
- Do not treat the existing smoke assertions as a substitute for an
  authenticated, seeded user journey; add that only after the current suite is
  consistently green.

Validation:

```sh
bunx playwright install --with-deps chromium
bun run test:a11y
bunx playwright test e2e/smoke.spec.ts
bunx playwright test e2e/auth-csrf.spec.ts
bunx playwright test e2e/external-api.spec.ts
```

### 3. Put the Android client on the delivery path

Priority: high

The Compose client is a supported application surface but is not represented in
the current CI pipeline.

- Add a separate Android CI job using the Gradle wrapper:
  `assembleDebug`, `lintDebug`, and JVM unit tests.
- Cache Gradle safely and keep Android SDK/JDK versions pinned.
- Establish a first test floor for `ConvergeRepository`, `SecureTokenStore`,
  and `OfflineSyncWorker`; add one Compose UI test per primary screen.
- Harden release builds after CI is green: minification/resource shrinking,
  ProGuard rules, release signing, no cleartext release networking, safe Sentry
  privacy defaults, adaptive/round icons, and versioning policy.
- Add token-lifecycle UI coverage and ensure offline conflict handling follows
  the same server contract as the web client.

Validation:

```sh
cd mobile/android-native
./gradlew assembleDebug lintDebug test
```

### 4. Resolve cross-device state and offline conflicts

Priority: high product work

Two workflows require a deliberate data-contract change rather than a local UI
patch:

1. **Saved views:** eliminate the competing localStorage and Prisma-backed
   shapes. Choose a single server-backed schema, migrate existing local views
   once, and retain optimistic UI updates.
2. **Offline mutations:** send an `expectedUpdatedAt` (or equivalent version)
   with each mutation. On mismatch, return `409` plus the latest server state;
   surface a user choice to merge, keep local changes, or discard them. Both
   the PWA queue and Android `OfflineSyncWorker` must use this contract.

Before implementation, document the API payloads, migration/rollback plan,
authorization rules, retry semantics, and tests in `docs/DESIGN_NOTES.md`.

### 5. Reduce high-risk module complexity

Priority: high, after the data contracts stabilize

- Split `app/issues/[id]/page.tsx` by behaviorally independent sections
  (header, description, comments, attachments, relations, GitHub links, time
  logging, and AI actions). Move fetching/mutations into focused hooks.
- Add regression tests before each extraction and keep API behavior unchanged.
- Apply the same incremental approach to `src/lib/sync.ts`, then the large
  Slack and AI client modules. Avoid broad mechanical refactors.

Completion criteria:

- Each module has a clear owner/responsibility boundary.
- Existing tests pass; new tests cover changed mutation/error paths.
- Lint, typecheck, build, and the relevant browser specs are clean.

### 6. Reconcile and maintain planning documentation

Priority: follow-up

`IMPROVEMENTS.md` contains historical entries that conflict with the current
repository state (for example, it says there is no accessibility CI gate even
though axe tests and an `a11y` CI job exist).

- Mark shipped items with their verification reference or move them to a
  concise completed-history section.
- Keep only actionable items in the active backlog, with owner, priority,
  dependency, and acceptance criteria.
- Update stale line-count and path references while touching each item.

## Resuming from a terminal

Start with section 1. Do not begin product-contract work (section 4) until the
quality gate and full CI coverage work are green. Commit each numbered section
separately so dependency/tooling, CI, Android, and behavior changes remain easy
to review and revert.

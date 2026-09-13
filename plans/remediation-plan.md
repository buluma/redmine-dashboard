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
7. **`app/issues/[id]/page.tsx` split** — description, subtickets, markdown rendering, activity tabs (history/notes/internal-notes/properties/time-entries), comment form, overview cards, standard metadata fields, GitHub links, and relations are extracted into `src/components/issue-detail/*`. The data-fetching/mutation logic itself is out too, into three focused hooks: `useIssueDetail` (issue load/reload/refresh, live statuses, activity/user/priority/custom-field lookups, favorite, related-issue prefetch, attachment-refresh), `useIssueEditDraft` (the metadata edit-mode flow, including the local-vs-Redmine save split), and `useGithubLinkActions`. The page went from 1420 to 943 lines. Remaining: the quick-actions local-only status/assign/time-log branches and the assignee-custom-field-click-to-assign button are still small inline fetches — left as-is since extracting them didn't reduce complexity meaningfully on their own.
8. **`src/lib/sync.ts` split** — the 1399-line file is now a 12-line barrel re-exporting the same public surface from `src/lib/sync/parsers.ts` (raw Redmine-JSON parsing), `issue-cache.ts` (per-issue upserts: issue row, attachments, relations, journals, time entries), `catalog.ts` (status/enumeration catalogs), `breadcrumbs.ts` (parent-chain walk), `single-issue.ts` (`syncSingleIssue` orchestrator plus push/Slack/webhook notification fan-out), and `jobs.ts` (SyncJob claim/create/execute lifecycle). No call site changed — every existing `from "@/src/lib/sync"` import still resolves the same names. Purely mechanical: no logic changed, verified by the existing `sync.test.ts`/`sync-watermark.test.ts`/`sync-hybrid-local-mirror.test.ts`/`sync-orphan.test.ts` suite passing unmodified.
9. **`src/lib/ai-tools.ts` split** — the 975-line file is now a 13-line barrel re-exporting the same public surface from `src/lib/ai-tools/types.ts`, `permissions.ts` (role/confirmation requirements), `definitions.ts` (the static OpenAI-format tool schemas), `issue-ref.ts` (shared Redmine-#ID-vs-local-L-N resolution), `read-handlers.ts`/`write-handlers.ts` (one handler per tool, split by whether it mutates), `execute.ts` (the `executeTool`/`runTool` dispatcher), and `presentation.ts` (cross-provider formatting). No call site changed. Purely mechanical, verified by the existing `ai-tools.test.ts` suite passing unmodified.
10. **`src/lib/llm-provider.ts` fixed, then split** — writing per-provider regression tests first (thin coverage before this: 208 lines of tests for 768 of implementation, and every test secretly ran through ollama only, since the env mock hardcoded `llmProvider: 'ollama'`) surfaced a real bug: `chat()`/`checkHealth()` did `return this.xChat(...)`/`return this.checkXHealth()` with no `await` inside their try/catch, so the documented "fall back to Ollama when a provider fails" safety net silently never fired for openai/anthropic/openrouter/aperture. Fixed, with 21 new tests actually exercising each provider (health/chat/streaming/tool-calls/fallback). Then split the 768-line single-class file into `src/lib/llm-provider/types.ts` and one free-function module per provider (`ollama.ts`, `openai.ts`, `anthropic.ts`, `openrouter.ts`, `aperture.ts`, `embeddings.ts`), with `manager.ts` keeping the thin `LLMProviderManager` class that just dispatches to them. `src/lib/llm-provider.ts` is now a 17-line barrel; no call site changed.

## Descoped

- **Offline mutation conflict handling** (`expectedUpdatedAt`/version-on-mutation, 409 + merge/keep/discard UI, shared PWA/Android contract) — not required. Nothing changes here from what the app has today; do not build this without a new, explicit product decision to revisit it.
- **Android CI/delivery path** (a dedicated Gradle CI job, a test floor for `ConvergeRepository`/`SecureTokenStore`, release hardening) — not required. `mobile/android-native/` stays as-is, unrepresented in CI; do not build this without a new, explicit product decision to revisit it.

## Ordered work

### 1. Finish reducing high-risk module complexity

Priority: high

- `app/issues/[id]/page.tsx`, `src/lib/sync.ts`, `src/lib/ai-tools.ts`, and `src/lib/llm-provider.ts` are done (see Shipped #7-10).
- Apply the same incremental approach to the large Slack modules (`slack-notifier.ts`, `slack-notification-service.ts`, `slack.ts`). Avoid broad mechanical refactors.
- Add regression tests before each extraction and keep API behavior unchanged.

Completion criteria:

- Each module has a clear owner/responsibility boundary.
- Existing tests pass; new tests cover changed mutation/error paths.
- Lint, typecheck, build, and the relevant browser specs are clean.

### 2. Reconcile and maintain planning documentation

Priority: follow-up

`IMPROVEMENTS.md` has its own `## 0. Status` section tracking shipped items, but line-count/path references elsewhere in the backlog can still drift from the current repository state as extractions land.

- Mark shipped items with their verification reference or move them to the completed-history section.
- Keep only actionable items in the active backlog, with owner, priority, dependency, and acceptance criteria.
- Update stale line-count and path references while touching each item.

## Resuming from a terminal

Start with section 1 (module complexity). Commit each numbered section separately so unrelated behavior changes remain easy to review and revert.

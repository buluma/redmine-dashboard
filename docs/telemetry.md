# Telemetry Conventions

This document defines the standard for operational telemetry in Converge.

Telemetry in this codebase is emitted through [`src/lib/telemetry.ts`](../src/lib/telemetry.ts), which wraps:

- Structured app logs (`src/lib/log.ts`)
- Sentry logs (`Sentry.logger`)
- Sentry metrics (`Sentry.metrics`)

## Goals

- Keep event and metric names consistent across routes.
- Make dashboards and alerts stable over time.
- Avoid high-cardinality tags that degrade metric usability.

## Required Pattern For Mutations

For write operations (create/update/delete), follow this sequence:

1. Emit a request-start event with `trackInfo`.
2. On success, emit `trackSuccess` with:
   - an operation success metric (`..._succeeded` or `..._completed`)
   - a duration metric (`..._duration`)
3. On failures, emit `trackFailure` with:
   - an operation failure metric (`..._failed`)
   - `status_class` tag when HTTP status is known
   - the same duration metric (`..._duration`)
4. On rate limiting, emit `trackFailure` with:
   - `level: "warn"`
   - metric `..._rate_limited`
   - tag `reason=rate_limited`

## Naming Rules

### Log events

- Format: `domain.action.state`
- Examples:
  - `issue.comment.post.requested`
  - `issue.comment.post.succeeded`
  - `issue.comment.post.failed`

### Metric names

- Format: `snake_case`
- Use suffixes:
  - `_succeeded` or `_completed` for successful operations
  - `_failed` for failed operations
  - `_rate_limited` for throttled operations
  - `_duration` for latency distributions
- Examples:
  - `issue_comment_post_succeeded`
  - `issue_comment_post_failed`
  - `issue_comment_post_duration`

### Metric tags

- Keep tags low-cardinality.
- Recommended:
  - `status_class` (`2xx`, `4xx`, `5xx`)
  - `reason` (`rate_limited`, `validation`, `upstream_error`)
  - coarse booleans like `partial_failure=true|false`
- Avoid:
  - user IDs
  - issue IDs
  - UUIDs
  - raw URLs with dynamic parts

## API Usage

Use telemetry helpers from `src/lib/telemetry.ts`:

- `trackInfo(event, data?)`
- `trackWarn(event, data?)`
- `trackSuccess({ ... })`
- `trackFailure({ ... })`
- `trackDuration(metricName, duration, options?)`

Example:

```ts
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

const startedAt = Date.now();
trackInfo("feature.action.requested", { userId });

try {
  await doWork();
  trackSuccess({
    event: "feature.action.succeeded",
    data: { userId },
    metricName: "feature_action_succeeded",
    durationMetricName: "feature_action_duration",
    durationMs: Date.now() - startedAt,
  });
} catch (error) {
  trackFailure({
    event: "feature.action.failed",
    error,
    metricName: "feature_action_failed",
    metricTags: { status_class: "5xx" },
    durationMetricName: "feature_action_duration",
    durationMs: Date.now() - startedAt,
  });
  throw error;
}
```

## Current Scope

These routes already follow this standard:

- Manual sync mutation routes
- Issue mutation routes (status, comment, timelog, bulk status)
- Issue GitHub link mutation routes (web and mobile)

When adding a new mutation route, follow the same pattern from the start.

## Sentry Runtime Controls

Runtime telemetry volume is controlled through environment variables:

- `SENTRY_TRACES_SAMPLE_RATE`: Defaults to `0.0` in development and `0.1` in production.
- `SENTRY_PROFILE_SAMPLE_RATE`: Defaults to `0.0` unless profiling is explicitly needed.
- `SENTRY_ENABLE_LOGS`: Defaults to `false`.
- `SENTRY_ENABLE_CONSOLE_LOGGING`: Defaults to `false`.
- `SENTRY_SEND_DEFAULT_PII`: Defaults to `false`.
- `NEXT_PUBLIC_SENTRY_*`: Browser-side trace/profile/log/PII controls. These are intentionally separate from server variables because they are exposed to client builds.
- `ENABLE_SENTRY_TEST_ROUTES` and `NEXT_PUBLIC_ENABLE_SENTRY_TEST_ROUTES`: Defaults to `false`; enable only for intentional Sentry smoke tests.

These defaults keep error reporting active while reducing memory and CPU overhead from high-volume tracing, profiling, and console-log ingestion.

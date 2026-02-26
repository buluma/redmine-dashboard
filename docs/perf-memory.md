# Memory Profiling Guide

This guide defines a repeatable process to measure and compare NRCC runtime memory before and after optimization changes.

## Goals

- Measure memory behavior in development (`next dev`) and production (`next start`).
- Compare baseline and post-change medians using the same navigation flow.
- Keep captures simple and reproducible with built-in scripts.

## Prerequisites

- `.env` is configured.
- Test account can load issue list and issue detail pages.
- Optional: `SENTRY_DSN` values configured if validating telemetry behavior.

## Measurement Scripts

- Development with memory logs:

```bash
npm run mem:dev
```

- Production with memory logs:

```bash
npm run build
npm run mem:start
```

Both scripts emit `runtime.memory.usage` structured log events once per minute when `MEMORY_LOGGING=true`.

## Measurement Protocol

Run each scenario for 10 minutes and capture logs:

1. Start server (`mem:dev` or `mem:start`).
2. Keep the app idle for 5 minutes.
3. Execute normal user flow:
   - open issue list
   - open issue detail
   - submit one comment
4. Continue idle for another 5 minutes.
5. Record memory metrics from the emitted log events:
   - `rss`
   - `heapTotal`
   - `heapUsed`
   - `external`

## Baseline Snapshot Template

Fill this table for each run:

| Scenario | Median RSS (bytes) | Median heapUsed (bytes) | Notes |
| --- | ---: | ---: | --- |
| Dev baseline | TBD | TBD | |
| Dev optimized | TBD | TBD | |
| Prod baseline | TBD | TBD | |
| Prod optimized | TBD | TBD | |

## Acceptance Target

- Aim for `25-35%` reduction in median RSS and a matching drop in heap pressure.
- Verify no regressions in issue/comment/timelog APIs and sync behavior.

## Optional Production Guard

For memory-constrained deployments, cap V8 old-space heap:

```bash
NODE_ENV=production NODE_OPTIONS=--max-old-space-size=768 npm run start
```

Adjust based on GC pauses and request latency.

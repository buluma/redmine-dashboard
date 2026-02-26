import * as Sentry from "@sentry/nextjs";

import { logEvent } from "@/src/lib/log";

type TelemetryLevel = "info" | "warn" | "error";
type TelemetryData = Record<string, unknown>;

type DurationOptions = {
  data?: TelemetryData;
  tags?: Record<string, unknown>;
  unit?: "millisecond" | "second" | "byte" | "none";
};

type SuccessOptions = {
  event: string;
  data?: TelemetryData;
  metricName?: string;
  metricValue?: number;
  metricTags?: Record<string, unknown>;
  durationMetricName?: string;
  durationMs?: number;
  durationUnit?: "millisecond" | "second" | "byte" | "none";
};

type FailureOptions = {
  event: string;
  error: unknown;
  data?: TelemetryData;
  level?: "warn" | "error";
  metricName?: string;
  metricValue?: number;
  metricTags?: Record<string, unknown>;
  durationMetricName?: string;
  durationMs?: number;
  durationUnit?: "millisecond" | "second" | "byte" | "none";
};

function normalize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

function toMetricTags(tags: Record<string, unknown> = {}): Record<string, string> {
  const entries = Object.entries(tags)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const);
  return Object.fromEntries(entries);
}

function emitLog(level: TelemetryLevel, event: string, data: TelemetryData = {}): void {
  const payload = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, normalize(value)]),
  );

  logEvent(event, payload, level);

  if (level === "error") {
    Sentry.logger.error(event, payload);
    return;
  }

  if (level === "warn") {
    Sentry.logger.warn(event, payload);
    return;
  }

  Sentry.logger.info(event, payload);
}

export function trackInfo(event: string, data: TelemetryData = {}): void {
  emitLog("info", event, data);
}

export function trackWarn(event: string, data: TelemetryData = {}): void {
  emitLog("warn", event, data);
}

export function trackDuration(
  metricName: string,
  durationValue: number,
  options: DurationOptions = {},
): void {
  const { data = {}, tags = {}, unit = "millisecond" } = options;
  Sentry.metrics.distribution(metricName, durationValue, {
    unit,
    attributes: toMetricTags(tags),
  });

  emitLog("info", `${metricName}.recorded`, {
    ...data,
    duration: durationValue,
    durationUnit: unit,
  });
}

export function trackSuccess(options: SuccessOptions): void {
  const {
    event,
    data = {},
    metricName,
    metricValue = 1,
    metricTags = {},
    durationMetricName,
    durationMs,
    durationUnit = "millisecond",
  } = options;

  emitLog("info", event, data);

  if (metricName) {
    Sentry.metrics.count(metricName, metricValue, { attributes: toMetricTags(metricTags) });
  }

  if (durationMetricName && typeof durationMs === "number") {
    trackDuration(durationMetricName, durationMs, {
      data: { event, ...data },
      tags: metricTags,
      unit: durationUnit,
    });
  }
}

export function trackFailure(options: FailureOptions): void {
  const {
    event,
    error,
    data = {},
    level = "error",
    metricName,
    metricValue = 1,
    metricTags = {},
    durationMetricName,
    durationMs,
    durationUnit = "millisecond",
  } = options;

  const errorData =
    error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: error.message,
        }
      : { errorMessage: String(error) };

  emitLog(level, event, { ...data, ...errorData, error });

  if (metricName) {
    Sentry.metrics.count(metricName, metricValue, { attributes: toMetricTags(metricTags) });
  }

  if (durationMetricName && typeof durationMs === "number") {
    trackDuration(durationMetricName, durationMs, {
      data: { event, ...data, ...errorData },
      tags: metricTags,
      unit: durationUnit,
    });
  }
}

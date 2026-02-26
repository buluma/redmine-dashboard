type LogLevel = "info" | "warn" | "error";

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

export function logEvent(
  event: string,
  data: Record<string, unknown> = {},
  level: LogLevel = "info",
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, normalize(v)])),
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

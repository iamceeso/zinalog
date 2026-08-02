import type { Monitor } from "./db";

export const MASKED_SECRET = "********************";

export function isMaskedSecret(value: string | null | undefined): boolean {
  return value === MASKED_SECRET;
}

export function sanitizeMonitorForClient<T extends Monitor>(monitor: T) {
  return {
    ...monitor,
    basic_auth_pass: monitor.basic_auth_pass ? MASKED_SECRET : null,
    headers: monitor.headers ? MASKED_SECRET : null,
  };
}

// `monitors.name` and `monitors.target` are both UNIQUE; surface that as a
// normal validation error instead of letting the raw SQLITE_CONSTRAINT
// exception crash the request.
export function monitorUniqueConstraintField(
  err: unknown
): "name" | "target" | null {
  if (!(err instanceof Error)) return null;
  if (!err.message.includes("UNIQUE constraint failed")) return null;
  if (err.message.includes("monitors.name")) return "name";
  if (err.message.includes("monitors.target")) return "target";
  return null;
}

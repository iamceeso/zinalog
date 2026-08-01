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

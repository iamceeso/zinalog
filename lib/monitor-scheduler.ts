import {
  getDueMonitors,
  recordMonitorCheck,
  type Monitor,
  type MonitorCheckOutcome,
  type MonitorStatus,
} from "./db";
import { runMonitorCheck } from "./monitor-checks";
import { sendAllNotifications } from "./notifications";

declare global {
  var __monitorSchedulerStarted: boolean | undefined;
}

const TICK_MS = 10_000;
const MAX_CONCURRENT_CHECKS = 10;

export function buildStatusMessage(
  monitor: Monitor,
  newStatus: MonitorStatus,
  error: string | null | undefined,
  responseTimeMs: number | null | undefined
): { level: string; message: string } {
  if (newStatus === "down") {
    return {
      level: "error",
      message: `Monitor "${monitor.name}" is DOWN${error ? ` - ${error}` : ""}`,
    };
  }

  return {
    level: "info",
    message: `Monitor "${monitor.name}" is back UP${
      responseTimeMs != null ? ` (${responseTimeMs}ms)` : ""
    }`,
  };
}

export async function runAndRecordMonitorCheck(
  monitor: Monitor
): Promise<MonitorCheckOutcome> {
  const result = await runMonitorCheck(monitor);
  const outcome = await recordMonitorCheck(monitor, result);

  if (
    outcome.statusChanged &&
    monitor.notify_enabled &&
    (outcome.newStatus === "down" || outcome.newStatus === "up")
  ) {
    const { level, message } = buildStatusMessage(
      monitor,
      outcome.newStatus,
      result.error,
      result.response_time_ms
    );

    sendAllNotifications({
      level,
      message,
      service: `monitor:${monitor.name}`,
      stack: null,
      metadata: JSON.stringify({
        monitor_id: monitor.id,
        type: monitor.type,
        target: monitor.target,
        status_code: result.status_code ?? null,
        response_time_ms: result.response_time_ms ?? null,
      }),
      created_at: new Date().toISOString(),
    }).catch((err) => console.error("[monitor-alert]", err));
  }

  return outcome;
}

export async function runDueChecks(): Promise<void> {
  const due = await getDueMonitors();
  if (due.length === 0) return;

  for (let i = 0; i < due.length; i += MAX_CONCURRENT_CHECKS) {
    const batch = due.slice(i, i + MAX_CONCURRENT_CHECKS);
    await Promise.all(
      batch.map((monitor) =>
        runAndRecordMonitorCheck(monitor).catch((err) =>
          console.error(
            `[monitor-scheduler] check failed for monitor ${monitor.id}`,
            err
          )
        )
      )
    );
  }
}

function tick(): void {
  runDueChecks().catch((err) =>
    console.error("[monitor-scheduler] tick failed", err)
  );
}

export function ensureMonitorSchedulerStarted(): void {
  if (global.__monitorSchedulerStarted) return;
  global.__monitorSchedulerStarted = true;

  const interval = setInterval(tick, TICK_MS);
  interval.unref?.();
  tick();
}

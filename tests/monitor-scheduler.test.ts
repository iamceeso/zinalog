import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import type {
  Monitor,
  MonitorCheckOutcome,
  MonitorCheckResult,
} from "../lib/db";

type SchedulerModule = typeof import("../lib/monitors/scheduler");

const cjsRequire = createRequire(__filename);
const compiledDbPath = path.resolve(__dirname, "../lib/db.js");
const compiledSchedulerPath = path.resolve(
  __dirname,
  "../lib/monitors/scheduler.js"
);
const compiledChecksPath = path.resolve(__dirname, "../lib/monitors/checks.js");
const compiledNotificationsPath = path.resolve(
  __dirname,
  "../lib/notifications.js"
);
const compiledDomainUtilsPath = path.resolve(
  __dirname,
  "../lib/domain-utils.js"
);
const compiledWhoisPath = path.resolve(__dirname, "../lib/whois.js");

const ALL_COMPILED_PATHS = [
  compiledDbPath,
  compiledSchedulerPath,
  compiledChecksPath,
  compiledNotificationsPath,
  compiledDomainUtilsPath,
  compiledWhoisPath,
];

function baseMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: "prod-api",
    type: "http",
    target: "https://example.com/",
    port: null,
    method: "GET",
    headers: null,
    basic_auth_user: null,
    basic_auth_pass: null,
    expected_status: "200-299",
    interval_seconds: 60,
    timeout_seconds: 10,
    retries: 0,
    follow_redirects: 1,
    verify_ssl: 1,
    is_active: 1,
    notify_enabled: 1,
    status: "pending",
    consecutive_fails: 0,
    last_check_at: null,
    last_status_change_at: null,
    ssl_expires_at: null,
    ssl_issuer: null,
    ssl_valid: null,
    domain_expires_at: null,
    domain_registrar: null,
    domain_checked_at: null,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
    ...overrides,
  };
}

function mockModule(
  modulePath: string,
  exports: Record<string, unknown>
): void {
  cjsRequire.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  } as NodeModule;
}

function loadSchedulerWithMocks(options: {
  due?: Monitor[];
  checkResult?: MonitorCheckResult;
  outcome?: MonitorCheckOutcome | ((monitor: Monitor) => MonitorCheckOutcome);
  getDueMonitors?: () => Promise<Monitor[]>;
  domainDue?: Monitor[];
  getMonitorsDueForDomainRefresh?: () => Promise<Monitor[]>;
  recordMonitorCheck?: (
    monitor: Monitor,
    result: MonitorCheckResult
  ) => Promise<MonitorCheckOutcome>;
  updateMonitorDomainInfo?: (
    id: number,
    info: { expires_at: string | null; registrar: string | null }
  ) => Promise<void>;
  runMonitorCheck?: (monitor: Monitor) => Promise<MonitorCheckResult>;
  sendAllNotifications?: (log: unknown) => Promise<unknown>;
  isIpAddress?: (value: string) => boolean;
  getDomainInfo?: (
    hostname: string
  ) => Promise<{ expires_at: string | null; registrar: string | null } | null>;
}): {
  scheduler: SchedulerModule;
  calls: {
    checked: Monitor[];
    recorded: Array<{ monitor: Monitor; result: MonitorCheckResult }>;
    notifications: unknown[];
    domainUpdates: Array<{
      id: number;
      info: { expires_at: string | null; registrar: string | null };
    }>;
    domainLookups: string[];
  };
} {
  for (const p of ALL_COMPILED_PATHS) delete cjsRequire.cache[p];
  delete global.__monitorSchedulerStarted;

  const calls = {
    checked: [] as Monitor[],
    recorded: [] as Array<{ monitor: Monitor; result: MonitorCheckResult }>,
    notifications: [] as unknown[],
    domainUpdates: [] as Array<{
      id: number;
      info: { expires_at: string | null; registrar: string | null };
    }>,
    domainLookups: [] as string[],
  };
  const checkResult = options.checkResult ?? {
    status: "up",
    status_code: 200,
    response_time_ms: 42,
    error: null,
  };
  const defaultOutcome: MonitorCheckOutcome = options.outcome
    ? typeof options.outcome === "function"
      ? options.outcome(baseMonitor())
      : options.outcome
    : {
        previousStatus: "pending",
        newStatus: checkResult.status,
        statusChanged: true,
        check: checkResult,
      };

  mockModule(compiledDbPath, {
    getDueMonitors:
      options.getDueMonitors ??
      (async () => {
        return options.due ?? [];
      }),
    getMonitorsDueForDomainRefresh:
      options.getMonitorsDueForDomainRefresh ??
      (async () => {
        return options.domainDue ?? [];
      }),
    updateMonitorDomainInfo:
      options.updateMonitorDomainInfo ??
      (async (
        id: number,
        info: { expires_at: string | null; registrar: string | null }
      ) => {
        calls.domainUpdates.push({ id, info });
      }),
    recordMonitorCheck:
      options.recordMonitorCheck ??
      (async (monitor: Monitor, result: MonitorCheckResult) => {
        calls.recorded.push({ monitor, result });
        return typeof options.outcome === "function"
          ? options.outcome(monitor)
          : defaultOutcome;
      }),
  });
  mockModule(compiledChecksPath, {
    runMonitorCheck:
      options.runMonitorCheck ??
      (async (monitor: Monitor) => {
        calls.checked.push(monitor);
        return checkResult;
      }),
  });
  mockModule(compiledNotificationsPath, {
    sendAllNotifications:
      options.sendAllNotifications ??
      (async (log: unknown) => {
        calls.notifications.push(log);
        return [];
      }),
  });
  mockModule(compiledDomainUtilsPath, {
    isIpAddress:
      options.isIpAddress ??
      ((value: string) =>
        /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value === "::1"),
  });
  mockModule(compiledWhoisPath, {
    getDomainInfo:
      options.getDomainInfo ??
      (async (hostname: string) => {
        calls.domainLookups.push(hostname);
        return { expires_at: "2027-01-01T00:00:00.000Z", registrar: "Example" };
      }),
  });

  const scheduler = cjsRequire(compiledSchedulerPath) as SchedulerModule;
  return { scheduler, calls };
}

test("buildStatusMessage formats down and up monitor alerts", () => {
  const { scheduler } = loadSchedulerWithMocks({});

  assert.deepEqual(
    scheduler.buildStatusMessage(
      baseMonitor({ name: "api" }),
      "down",
      "connection refused",
      null
    ),
    { level: "error", message: 'Monitor "api" is DOWN - connection refused' }
  );
  assert.deepEqual(
    scheduler.buildStatusMessage(
      baseMonitor({ name: "api" }),
      "down",
      null,
      null
    ),
    { level: "error", message: 'Monitor "api" is DOWN' }
  );
  assert.deepEqual(
    scheduler.buildStatusMessage(baseMonitor({ name: "api" }), "up", null, 42),
    { level: "info", message: 'Monitor "api" is back UP (42ms)' }
  );
  assert.deepEqual(
    scheduler.buildStatusMessage(
      baseMonitor({ name: "api" }),
      "up",
      null,
      null
    ),
    { level: "info", message: 'Monitor "api" is back UP' }
  );
});

test("runAndRecordMonitorCheck records a check and sends a status-change notification", async () => {
  const checkResult: MonitorCheckResult = {
    status: "down",
    status_code: 503,
    response_time_ms: 88,
    error: "unavailable",
  };
  const { scheduler, calls } = loadSchedulerWithMocks({ checkResult });
  const monitor = baseMonitor({
    id: 7,
    name: "billing",
    target: "https://billing.test",
  });

  const outcome = await scheduler.runAndRecordMonitorCheck(monitor);

  assert.equal(outcome.newStatus, "down");
  assert.deepEqual(calls.checked, [monitor]);
  assert.deepEqual(calls.recorded, [{ monitor, result: checkResult }]);
  assert.equal(calls.notifications.length, 1);
  assert.deepEqual(calls.notifications[0], {
    level: "error",
    message: 'Monitor "billing" is DOWN - unavailable',
    service: "monitor:billing",
    stack: null,
    metadata: JSON.stringify({
      monitor_id: 7,
      type: "http",
      target: "https://billing.test",
      status_code: 503,
      response_time_ms: 88,
    }),
    created_at: (calls.notifications[0] as { created_at: string }).created_at,
  });
  assert.match(
    (calls.notifications[0] as { created_at: string }).created_at,
    /^\d{4}-/
  );
});

test("runAndRecordMonitorCheck skips notification when the guard conditions are false", async () => {
  const noChange = loadSchedulerWithMocks({
    outcome: {
      previousStatus: "up",
      newStatus: "up",
      statusChanged: false,
      check: { status: "up" },
    },
  });
  await noChange.scheduler.runAndRecordMonitorCheck(baseMonitor());
  assert.equal(noChange.calls.notifications.length, 0);

  const disabled = loadSchedulerWithMocks({
    outcome: {
      previousStatus: "up",
      newStatus: "down",
      statusChanged: true,
      check: { status: "down" },
    },
  });
  await disabled.scheduler.runAndRecordMonitorCheck(
    baseMonitor({ notify_enabled: 0 })
  );
  assert.equal(disabled.calls.notifications.length, 0);

  const pending = loadSchedulerWithMocks({
    outcome: {
      previousStatus: "up",
      newStatus: "pending",
      statusChanged: true,
      check: { status: "down" },
    },
  });
  await pending.scheduler.runAndRecordMonitorCheck(baseMonitor());
  assert.equal(pending.calls.notifications.length, 0);
});

test("runAndRecordMonitorCheck logs rejected monitor notifications", async () => {
  const notificationError = new Error("notification failed");
  const errors: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const { scheduler } = loadSchedulerWithMocks({
      checkResult: { status: "down", error: "boom" },
      sendAllNotifications: async () => {
        throw notificationError;
      },
    });
    await scheduler.runAndRecordMonitorCheck(baseMonitor());
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(errors, [["[monitor-alert]", notificationError]]);
});

test("runDueChecks returns when there are no due monitors", async () => {
  const { scheduler, calls } = loadSchedulerWithMocks({ due: [] });

  await scheduler.runDueChecks();

  assert.equal(calls.checked.length, 0);
});

test("runDueChecks processes due monitors in batches and logs per-monitor failures", async () => {
  const monitors = Array.from({ length: 12 }, (_, i) =>
    baseMonitor({ id: i + 1, name: `monitor-${i + 1}` })
  );
  const failed = monitors[10];
  const checkError = new Error("check exploded");
  const errors: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const { scheduler, calls } = loadSchedulerWithMocks({
      due: monitors,
      runMonitorCheck: async (monitor) => {
        callsPlaceholder.checked.push(monitor);
        if (monitor === failed) throw checkError;
        return { status: "up" };
      },
    });
    const callsPlaceholder = calls;

    await scheduler.runDueChecks();

    assert.equal(calls.checked.length, 12);
  } finally {
    console.error = originalConsoleError;
  }

  assert.ok(
    errors.some(
      (call) =>
        call[0] ===
          `[monitor-scheduler] check failed for monitor ${failed.id}` &&
        call[1] === checkError
    )
  );
});

test("runDueChecks probes monitors concurrently but serializes result recording", async () => {
  const monitors = [
    baseMonitor({ id: 1 }),
    baseMonitor({ id: 2 }),
    baseMonitor({ id: 3 }),
  ];
  let activeRecordings = 0;
  let maxActiveRecordings = 0;
  let completedProbes = 0;
  const recordedIds: number[] = [];

  const { scheduler } = loadSchedulerWithMocks({
    due: monitors,
    runMonitorCheck: async () => {
      completedProbes += 1;
      return { status: "up" };
    },
    recordMonitorCheck: async (monitor, result) => {
      assert.equal(completedProbes, monitors.length);
      activeRecordings += 1;
      maxActiveRecordings = Math.max(maxActiveRecordings, activeRecordings);
      await new Promise<void>((resolve) => setImmediate(resolve));
      activeRecordings -= 1;
      recordedIds.push(monitor.id);
      return {
        previousStatus: "pending",
        newStatus: result.status,
        statusChanged: true,
        check: result,
      };
    },
  });

  await scheduler.runDueChecks();

  assert.equal(maxActiveRecordings, 1);
  assert.deepEqual(recordedIds, [1, 2, 3]);
});

test("extractHostname returns raw non-http targets, parsed http hostnames, and null for invalid URLs", () => {
  const { scheduler } = loadSchedulerWithMocks({});

  assert.equal(
    scheduler.extractHostname(baseMonitor({ type: "tcp", target: "db.local" })),
    "db.local"
  );
  assert.equal(
    scheduler.extractHostname(
      baseMonitor({ type: "http", target: "https://status.example.com/path" })
    ),
    "status.example.com"
  );
  assert.equal(
    scheduler.extractHostname(
      baseMonitor({ type: "http", target: "not a url" })
    ),
    null
  );
});

test("runDueDomainRefreshes returns when there are no due monitors", async () => {
  const { scheduler, calls } = loadSchedulerWithMocks({ domainDue: [] });

  await scheduler.runDueDomainRefreshes();

  assert.equal(calls.domainUpdates.length, 0);
  assert.equal(calls.domainLookups.length, 0);
});

test("runDueDomainRefreshes stamps skipped hostnames without lookup", async () => {
  const monitors = [
    baseMonitor({ id: 1, type: "http", target: "not a url" }),
    baseMonitor({ id: 2, type: "http", target: "https://127.0.0.1/health" }),
    baseMonitor({ id: 3, type: "tcp", target: "::1" }),
  ];
  const { scheduler, calls } = loadSchedulerWithMocks({ domainDue: monitors });

  await scheduler.runDueDomainRefreshes();

  assert.equal(calls.domainLookups.length, 0);
  assert.deepEqual(calls.domainUpdates, [
    { id: 1, info: { expires_at: null, registrar: null } },
    { id: 2, info: { expires_at: null, registrar: null } },
    { id: 3, info: { expires_at: null, registrar: null } },
  ]);
});

test("runDueDomainRefreshes swallows skipped-hostname update failures", async () => {
  const updateError = new Error("stamp failed");
  const monitor = baseMonitor({ id: 7, type: "http", target: "not a url" });
  const { scheduler } = loadSchedulerWithMocks({
    domainDue: [monitor],
    updateMonitorDomainInfo: async () => {
      throw updateError;
    },
  });

  await assert.doesNotReject(scheduler.runDueDomainRefreshes());
});

test("runDueDomainRefreshes records domain lookup results", async () => {
  const monitor = baseMonitor({
    id: 4,
    type: "http",
    target: "https://example.com/app",
  });
  const { scheduler, calls } = loadSchedulerWithMocks({ domainDue: [monitor] });

  await scheduler.runDueDomainRefreshes();

  assert.deepEqual(calls.domainLookups, ["example.com"]);
  assert.deepEqual(calls.domainUpdates, [
    {
      id: 4,
      info: { expires_at: "2027-01-01T00:00:00.000Z", registrar: "Example" },
    },
  ]);
});

test("runDueDomainRefreshes stores nulls for empty lookup results", async () => {
  const monitor = baseMonitor({
    id: 5,
    type: "http",
    target: "https://empty.example/",
  });
  const { scheduler, calls } = loadSchedulerWithMocks({
    domainDue: [monitor],
    getDomainInfo: async (hostname) => {
      callsPlaceholder.domainLookups.push(hostname);
      return null;
    },
  });
  const callsPlaceholder = calls;

  await scheduler.runDueDomainRefreshes();

  assert.deepEqual(calls.domainUpdates, [
    { id: 5, info: { expires_at: null, registrar: null } },
  ]);
});

test("runDueDomainRefreshes logs lookup failures and stamps nulls", async () => {
  const lookupError = new Error("whois failed");
  const updateError = new Error("update failed");
  const monitor = baseMonitor({
    id: 6,
    type: "http",
    target: "https://broken.example/",
  });
  const errors: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const { scheduler, calls } = loadSchedulerWithMocks({
      domainDue: [monitor],
      getDomainInfo: async (hostname) => {
        callsPlaceholder.domainLookups.push(hostname);
        throw lookupError;
      },
      updateMonitorDomainInfo: async () => {
        throw updateError;
      },
    });
    const callsPlaceholder = calls;

    await scheduler.runDueDomainRefreshes();
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(errors, [
    ["[monitor-scheduler] domain refresh failed for monitor 6", lookupError],
  ]);
});

test("ensureMonitorSchedulerStarted starts once, unreferences when possible, and runs an immediate tick", async () => {
  const due = [baseMonitor()];
  const { scheduler, calls } = loadSchedulerWithMocks({ due });
  const originalSetInterval = global.setInterval;
  let intervalCalls = 0;
  let unrefCalls = 0;

  (global as unknown as { setInterval: unknown }).setInterval = () => {
    intervalCalls += 1;
    return {
      unref: () => {
        unrefCalls += 1;
      },
    } as unknown as NodeJS.Timeout;
  };

  try {
    scheduler.ensureMonitorSchedulerStarted();
    scheduler.ensureMonitorSchedulerStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    global.setInterval = originalSetInterval;
  }

  assert.equal(intervalCalls, 1);
  assert.equal(unrefCalls, 1);
  assert.equal(calls.checked.length, 1);
});

test("ensureMonitorSchedulerStarted tolerates interval handles without unref", async () => {
  const { scheduler } = loadSchedulerWithMocks({});
  const originalSetInterval = global.setInterval;

  (global as unknown as { setInterval: unknown }).setInterval = () =>
    ({}) as NodeJS.Timeout;

  try {
    assert.doesNotThrow(() => scheduler.ensureMonitorSchedulerStarted());
  } finally {
    global.setInterval = originalSetInterval;
  }
});

test("the scheduler tick logs runDueChecks failures", async () => {
  const tickError = new Error("due failed");
  const { scheduler } = loadSchedulerWithMocks({
    getDueMonitors: async () => {
      throw tickError;
    },
  });
  const originalSetInterval = global.setInterval;
  const originalConsoleError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  (global as unknown as { setInterval: unknown }).setInterval = () =>
    ({}) as NodeJS.Timeout;

  try {
    scheduler.ensureMonitorSchedulerStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    global.setInterval = originalSetInterval;
    console.error = originalConsoleError;
  }

  assert.deepEqual(errors, [["[monitor-scheduler] tick failed", tickError]]);
});

test("the scheduler tick logs runDueDomainRefreshes failures", async () => {
  const tickError = new Error("domain due failed");
  const { scheduler } = loadSchedulerWithMocks({
    getMonitorsDueForDomainRefresh: async () => {
      throw tickError;
    },
  });
  const originalSetInterval = global.setInterval;
  const originalConsoleError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  (global as unknown as { setInterval: unknown }).setInterval = () =>
    ({}) as NodeJS.Timeout;

  try {
    scheduler.ensureMonitorSchedulerStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    global.setInterval = originalSetInterval;
    console.error = originalConsoleError;
  }

  assert.deepEqual(errors, [
    ["[monitor-scheduler] domain refresh tick failed", tickError],
  ]);
});

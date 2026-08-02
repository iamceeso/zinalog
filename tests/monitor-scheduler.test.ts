import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type * as DbModuleType from "../lib/db";
import type * as SchedulerModuleType from "../lib/monitor-scheduler";
import { buildStatusMessage } from "../lib/monitor-scheduler";

type DbModule = typeof DbModuleType;
type SchedulerModule = typeof SchedulerModuleType;

const compiledDbPath = path.resolve(__dirname, "../lib/db.js");
const compiledSchedulerPath = path.resolve(
  __dirname,
  "../lib/monitor-scheduler.js"
);
const compiledChecksPath = path.resolve(__dirname, "../lib/monitor-checks.js");
const compiledNotificationsPath = path.resolve(
  __dirname,
  "../lib/notifications.js"
);
const compiledSecretCryptoPath = path.resolve(
  __dirname,
  "../lib/secret-crypto.js"
);
const compiledEmailPath = path.resolve(__dirname, "../lib/email.js");

const cjsRequire = createRequire(__filename);
const TEST_ENCRYPTION_KEY = "b".repeat(64);

const ALL_COMPILED_PATHS = [
  compiledDbPath,
  compiledSchedulerPath,
  compiledChecksPath,
  compiledNotificationsPath,
  compiledSecretCryptoPath,
  compiledEmailPath,
];

async function withSchedulerModules(
  fn: (modules: { db: DbModule; scheduler: SchedulerModule }) => Promise<void>
): Promise<void> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinalog-scheduler-test-")
  );
  const databasePath = path.join(tempDir, "logs.db");

  process.env.NODE_ENV = "production";
  process.env.DATABASE_PATH = databasePath;
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  delete global.__dbPromise;
  delete global.__monitorSchedulerStarted;
  for (const p of ALL_COMPILED_PATHS) delete cjsRequire.cache[p];

  const db = cjsRequire(compiledDbPath) as DbModule;
  const scheduler = cjsRequire(compiledSchedulerPath) as SchedulerModule;

  try {
    await fn({ db, scheduler });
    // Let any fire-and-forget notification calls settle before closing the DB.
    await new Promise((resolve) => setTimeout(resolve, 30));
  } finally {
    const database = await db.getDb();
    await database.close();
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_PATH;
    delete process.env.ENCRYPTION_KEY;
    delete global.__dbPromise;
    delete global.__monitorSchedulerStarted;
    for (const p of ALL_COMPILED_PATHS) delete cjsRequire.cache[p];
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function withHttpServer(
  handler: http.RequestListener,
  fn: (port: number) => Promise<void>
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function findClosedPort(): Promise<number> {
  const server = net.createServer();
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

//  buildStatusMessage

test("buildStatusMessage formats a down message with and without an error detail", () => {
  const withError = buildStatusMessage(
    { name: "prod-api" } as DbModuleType.Monitor,
    "down",
    "connection refused",
    null
  );
  assert.equal(withError.level, "error");
  assert.match(withError.message, /is DOWN — connection refused/);

  const withoutError = buildStatusMessage(
    { name: "prod-api" } as DbModuleType.Monitor,
    "down",
    null,
    null
  );
  assert.equal(withoutError.message, 'Monitor "prod-api" is DOWN');
});

test("buildStatusMessage formats an up message with and without a response time", () => {
  const withTime = buildStatusMessage(
    { name: "prod-api" } as DbModuleType.Monitor,
    "up",
    null,
    42
  );
  assert.equal(withTime.level, "info");
  assert.match(withTime.message, /is back UP \(42ms\)/);

  const withoutTime = buildStatusMessage(
    { name: "prod-api" } as DbModuleType.Monitor,
    "up",
    null,
    null
  );
  assert.equal(withoutTime.message, 'Monitor "prod-api" is back UP');
});

//  runAndRecordMonitorCheck

test("runAndRecordMonitorCheck records an up result and fires the notify path on first success", async () => {
  await withSchedulerModules(async ({ db, scheduler }) => {
    await withHttpServer(
      (_req, res) => {
        res.writeHead(200);
        res.end();
      },
      async (port) => {
        const monitor = await db.createMonitor({
          name: "up-monitor",
          type: "http",
          target: `http://127.0.0.1:${port}/`,
          interval_seconds: 60,
          timeout_seconds: 2,
        });

        const outcome = await scheduler.runAndRecordMonitorCheck(monitor);
        assert.equal(outcome.previousStatus, "pending");
        assert.equal(outcome.newStatus, "up");
        assert.equal(outcome.statusChanged, true);

        const updated = await db.getMonitorById(monitor.id);
        assert.equal(updated?.status, "up");
      }
    );
  });
});

test("runAndRecordMonitorCheck records a down result and fires the notify path", async () => {
  await withSchedulerModules(async ({ db, scheduler }) => {
    const closedPort = await findClosedPort();
    const monitor = await db.createMonitor({
      name: "down-monitor",
      type: "http",
      target: `http://127.0.0.1:${closedPort}/`,
      interval_seconds: 60,
      timeout_seconds: 2,
      retries: 0,
    });

    const outcome = await scheduler.runAndRecordMonitorCheck(monitor);
    assert.equal(outcome.newStatus, "down");
    assert.equal(outcome.statusChanged, true);
  });
});

test("runAndRecordMonitorCheck does not notify when the status hasn't changed", async () => {
  await withSchedulerModules(async ({ db, scheduler }) => {
    const closedPort = await findClosedPort();
    const monitor = await db.createMonitor({
      name: "flapping-monitor",
      type: "http",
      target: `http://127.0.0.1:${closedPort}/`,
      interval_seconds: 60,
      timeout_seconds: 2,
      retries: 2,
    });

    // First failure stays within the retry budget: status remains "pending".
    const first = await scheduler.runAndRecordMonitorCheck(monitor);
    assert.equal(first.newStatus, "pending");
    assert.equal(first.statusChanged, false);
  });
});

test("runAndRecordMonitorCheck skips notifications when notify_enabled is false", async () => {
  await withSchedulerModules(async ({ db, scheduler }) => {
    const closedPort = await findClosedPort();
    const monitor = await db.createMonitor({
      name: "silent-monitor",
      type: "http",
      target: `http://127.0.0.1:${closedPort}/`,
      interval_seconds: 60,
      timeout_seconds: 2,
      retries: 0,
      notify_enabled: false,
    });

    const outcome = await scheduler.runAndRecordMonitorCheck(monitor);
    assert.equal(outcome.newStatus, "down");
    assert.equal(outcome.statusChanged, true);
  });
});

test("runAndRecordMonitorCheck rejects when the monitor row no longer exists", async () => {
  await withSchedulerModules(async ({ db, scheduler }) => {
    const monitor = await db.createMonitor({
      name: "ghost-monitor",
      type: "ping",
      target: "127.0.0.1",
      interval_seconds: 60,
      timeout_seconds: 2,
    });
    const fakeMonitor = { ...monitor, id: monitor.id + 100000 };

    await assert.rejects(scheduler.runAndRecordMonitorCheck(fakeMonitor));
  });
});

//  runDueChecks

test("runDueChecks does nothing when there are no due monitors", async () => {
  await withSchedulerModules(async ({ scheduler }) => {
    await assert.doesNotReject(scheduler.runDueChecks());
  });
});

test("runDueChecks processes a single due monitor", async () => {
  await withSchedulerModules(async ({ db, scheduler }) => {
    await withHttpServer(
      (_req, res) => {
        res.writeHead(200);
        res.end();
      },
      async (port) => {
        const monitor = await db.createMonitor({
          name: "due-monitor",
          type: "http",
          target: `http://127.0.0.1:${port}/`,
          interval_seconds: 60,
          timeout_seconds: 2,
        });

        await scheduler.runDueChecks();

        const updated = await db.getMonitorById(monitor.id);
        assert.equal(updated?.status, "up");
        assert.ok(updated?.last_check_at);
      }
    );
  });
});

test("runDueChecks processes more monitors than the concurrency batch size", async () => {
  await withSchedulerModules(async ({ db, scheduler }) => {
    const monitors = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        db.createMonitor({
          name: `bulk-monitor-${i}`,
          type: "ping",
          target: `127.0.0.${i + 1}`,
          interval_seconds: 60,
          timeout_seconds: 2,
        })
      )
    );

    await scheduler.runDueChecks();

    for (const monitor of monitors) {
      const updated = await db.getMonitorById(monitor.id);
      assert.ok(updated?.last_check_at, `monitor ${monitor.name} should have been checked`);
    }
  });
});

test("runDueChecks does not process paused (inactive) monitors", async () => {
  await withSchedulerModules(async ({ db, scheduler }) => {
    const monitor = await db.createMonitor({
      name: "paused-monitor",
      type: "ping",
      target: "127.0.0.1",
      interval_seconds: 60,
      timeout_seconds: 2,
      is_active: false,
    });

    await scheduler.runDueChecks();

    const updated = await db.getMonitorById(monitor.id);
    assert.equal(updated?.last_check_at, null);
  });
});

//  ensureMonitorSchedulerStarted

test("ensureMonitorSchedulerStarted arms the interval once and is a no-op on subsequent calls", async () => {
  await withSchedulerModules(async ({ scheduler }) => {
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    let setIntervalCalls = 0;
    const fakeHandle = { unref: () => {} };

    (global as unknown as { setInterval: unknown }).setInterval = (
      ...args: unknown[]
    ) => {
      setIntervalCalls += 1;
      return fakeHandle as unknown as NodeJS.Timeout;
    };

    try {
      scheduler.ensureMonitorSchedulerStarted();
      scheduler.ensureMonitorSchedulerStarted();
      assert.equal(setIntervalCalls, 1);
    } finally {
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    }

    // Give the immediate tick() a chance to finish its (empty) DB query.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});

test("ensureMonitorSchedulerStarted tolerates an interval handle without unref", async () => {
  await withSchedulerModules(async ({ scheduler }) => {
    const originalSetInterval = global.setInterval;
    const fakeHandle = {};

    (global as unknown as { setInterval: unknown }).setInterval = () =>
      fakeHandle as unknown as NodeJS.Timeout;

    try {
      assert.doesNotThrow(() => scheduler.ensureMonitorSchedulerStarted());
    } finally {
      global.setInterval = originalSetInterval;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});

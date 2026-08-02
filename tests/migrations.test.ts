import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sqlite3 from "sqlite3";
import { open, type Database as SqliteDatabase } from "sqlite";

type MigrationsModule = typeof import("../lib/migrations");

const compiledMigrationsPath = path.resolve(__dirname, "../lib/migrations.js");
const cjsRequire = createRequire(__filename);

async function withTempCwd<T>(
  fn: (tempDir: string) => Promise<T>
): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zinalog-migrations-test-"));
  const previousCwd = process.cwd();
  process.chdir(tempDir);
  delete cjsRequire.cache[compiledMigrationsPath];

  try {
    return await fn(tempDir);
  } finally {
    process.chdir(previousCwd);
    delete cjsRequire.cache[compiledMigrationsPath];
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function loadMigrationsModule(): MigrationsModule {
  return cjsRequire(compiledMigrationsPath) as MigrationsModule;
}

async function openTempDb(): Promise<SqliteDatabase> {
  return open({ filename: ":memory:", driver: sqlite3.Database });
}

async function writeMigration(
  tempDir: string,
  filename: string,
  contents: string
): Promise<void> {
  await fs.mkdir(path.join(tempDir, "migrations"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "migrations", filename), contents);
}

test("readMigrations returns an empty array when the migrations directory does not exist", async () => {
  await withTempCwd(async () => {
    const migrations = loadMigrationsModule();
    assert.deepEqual(await migrations.readMigrations(), []);
  });
});

test("readMigrations parses, sorts, and filters migration files", async () => {
  await withTempCwd(async (tempDir) => {
    await writeMigration(
      tempDir,
      "20260101000000_second.sql",
      "-- migrate:up\nCREATE TABLE second (id INTEGER);\n-- migrate:down\nDROP TABLE second;\n"
    );
    await writeMigration(
      tempDir,
      "20260101000000_second.sql".replace("second", "aaa_first").replace(
        "20260101000000",
        "20250101000000"
      ),
      "-- migrate:up\nCREATE TABLE first (id INTEGER);\n-- migrate:down\nDROP TABLE first;\n"
    );
    await fs.writeFile(
      path.join(tempDir, "migrations", "README.md"),
      "not a migration"
    );

    const migrations = loadMigrationsModule();
    const result = await migrations.readMigrations();

    assert.equal(result.length, 2);
    assert.equal(result[0].id, "20250101000000");
    assert.equal(result[0].name, "aaa_first");
    assert.equal(result[0].upSql, "CREATE TABLE first (id INTEGER);");
    assert.equal(result[0].downSql, "DROP TABLE first;");
    assert.equal(result[1].id, "20260101000000");
    assert.equal(result[1].name, "second");
  });
});

test("readMigrations rejects filenames that don't match the timestamp_name.sql pattern", async () => {
  await withTempCwd(async (tempDir) => {
    await writeMigration(tempDir, "not-a-valid-name.sql", "-- migrate:up\n-- migrate:down\n");
    const migrations = loadMigrationsModule();
    await assert.rejects(
      migrations.readMigrations(),
      /Invalid migration filename/
    );
  });
});

test("readMigrations requires both markers in order", async () => {
  await withTempCwd(async (tempDir) => {
    await writeMigration(
      tempDir,
      "20260101000000_missing_down.sql",
      "-- migrate:up\nCREATE TABLE x (id INTEGER);\n"
    );
    const migrations = loadMigrationsModule();
    await assert.rejects(
      migrations.readMigrations(),
      /must contain -- migrate:up before -- migrate:down/
    );
  });

  await withTempCwd(async (tempDir) => {
    await writeMigration(
      tempDir,
      "20260101000000_reversed.sql",
      "-- migrate:down\nDROP TABLE x;\n-- migrate:up\nCREATE TABLE x (id INTEGER);\n"
    );
    const migrations = loadMigrationsModule();
    await assert.rejects(
      migrations.readMigrations(),
      /must contain -- migrate:up before -- migrate:down/
    );
  });
});

test("readMigrations rejects duplicate migration ids", async () => {
  await withTempCwd(async (tempDir) => {
    await writeMigration(
      tempDir,
      "20260101000000_one.sql",
      "-- migrate:up\n-- migrate:down\n"
    );
    await writeMigration(
      tempDir,
      "20260101000000_two.sql",
      "-- migrate:up\n-- migrate:down\n"
    );
    const migrations = loadMigrationsModule();
    await assert.rejects(migrations.readMigrations(), /Duplicate migration id/);
  });
});

test("readMigrations rethrows filesystem errors other than ENOENT", async () => {
  await withTempCwd(async (tempDir) => {
    // Create a plain file where the migrations directory is expected, so
    // fs.readdir fails with ENOTDIR instead of ENOENT.
    await fs.writeFile(path.join(tempDir, "migrations"), "not a directory");
    const migrations = loadMigrationsModule();
    await assert.rejects(migrations.readMigrations(), (err: NodeJS.ErrnoException) => {
      assert.equal(err.code, "ENOTDIR");
      return true;
    });
  });
});

test("getMigrationStatuses reports applied and pending migrations", async () => {
  await withTempCwd(async (tempDir) => {
    await writeMigration(
      tempDir,
      "20260101000000_applied.sql",
      "-- migrate:up\nCREATE TABLE applied_table (id INTEGER);\n-- migrate:down\nDROP TABLE applied_table;\n"
    );
    await writeMigration(
      tempDir,
      "20260102000000_pending.sql",
      "-- migrate:up\nCREATE TABLE pending_table (id INTEGER);\n-- migrate:down\nDROP TABLE pending_table;\n"
    );

    const migrations = loadMigrationsModule();
    const db = await openTempDb();
    try {
      await db.exec(
        "CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT (datetime('now')))"
      );
      await db.run(
        "INSERT INTO schema_migrations (id, name) VALUES (?, ?)",
        ["20260101000000", "applied"]
      );

      const statuses = await migrations.getMigrationStatuses(db);
      assert.equal(statuses.length, 2);
      assert.ok(statuses[0].appliedAt);
      assert.equal(statuses[1].appliedAt, null);
    } finally {
      await db.close();
    }
  });
});

test("runPendingMigrations applies pending migrations, skips empty up sections, and records them", async () => {
  await withTempCwd(async (tempDir) => {
    await writeMigration(
      tempDir,
      "20260101000000_creates_table.sql",
      "-- migrate:up\nCREATE TABLE widgets (id INTEGER);\n-- migrate:down\nDROP TABLE widgets;\n"
    );
    await writeMigration(
      tempDir,
      "20260102000000_noop.sql",
      "-- migrate:up\n-- migrate:down\n"
    );

    const migrations = loadMigrationsModule();
    const db = await openTempDb();
    try {
      const applied = await migrations.runPendingMigrations(db);
      assert.equal(applied.length, 2);

      const tables = await db.all<{ name: string }[]>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'widgets'"
      );
      assert.equal(tables.length, 1);

      const recorded = await db.all("SELECT id FROM schema_migrations ORDER BY id");
      assert.deepEqual(
        recorded.map((r: { id: string }) => r.id),
        ["20260101000000", "20260102000000"]
      );

      // Running again should find nothing pending.
      const secondRun = await migrations.runPendingMigrations(db);
      assert.equal(secondRun.length, 0);
    } finally {
      await db.close();
    }
  });
});

test("runPendingMigrations rolls back and rethrows when a migration's SQL fails", async () => {
  await withTempCwd(async (tempDir) => {
    await writeMigration(
      tempDir,
      "20260101000000_broken.sql",
      "-- migrate:up\nCREATE TABLE this is not valid sql;\n-- migrate:down\n"
    );

    const migrations = loadMigrationsModule();
    const db = await openTempDb();
    try {
      await assert.rejects(migrations.runPendingMigrations(db));

      const recorded = await db.all("SELECT id FROM schema_migrations");
      assert.equal(recorded.length, 0);
    } finally {
      await db.close();
    }
  });
});

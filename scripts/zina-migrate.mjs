#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "logs.db");
const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");
const BACKUPS_DIR = path.join(path.dirname(DB_PATH), "backups");

function printUsage() {
  console.log(`Usage:
  npm run zina:make-migration -- <name>
  npm run zina:migrate
  npm run zina:migrate:down -- [steps]
  npm run zina:migrate:drop
  npm run zina:migrate:status
  npm run zina:migrate:restore -- [backup-filename]
`);
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function parseMigrationId(filename) {
  const match = filename.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) {
    throw new Error(
      `Invalid migration filename "${filename}". Expected YYYYMMDDHHMMSS_name.sql`
    );
  }

  return { id: match[1], name: match[2] };
}

function parseMigrationSql(filename, sql) {
  const upMarker = "-- migrate:up";
  const downMarker = "-- migrate:down";
  const upIndex = sql.indexOf(upMarker);
  const downIndex = sql.indexOf(downMarker);

  if (upIndex === -1 || downIndex === -1 || downIndex < upIndex) {
    throw new Error(
      `Migration "${filename}" must contain ${upMarker} before ${downMarker}`
    );
  }

  return {
    upSql: sql.slice(upIndex + upMarker.length, downIndex).trim(),
    downSql: sql.slice(downIndex + downMarker.length).trim(),
  };
}

async function openDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const database = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  return database;
}

async function ensureMigrationsTable(database) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at DATETIME DEFAULT (datetime('now'))
    );
  `);
}

async function readMigrations() {
  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
  const entries = await fs.readdir(MIGRATIONS_DIR);
  const migrations = [];
  const seen = new Set();

  for (const filename of entries
    .filter((entry) => entry.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right))) {
    const { id, name } = parseMigrationId(filename);
    if (seen.has(id)) {
      throw new Error(`Duplicate migration id "${id}"`);
    }
    seen.add(id);

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), "utf8");
    migrations.push({
      id,
      name,
      filename,
      ...parseMigrationSql(filename, sql),
    });
  }

  return migrations;
}

async function appliedMap(database) {
  await ensureMigrationsTable(database);
  const rows = await database.all(
    "SELECT id, name, applied_at FROM schema_migrations ORDER BY id"
  );
  return new Map(rows.map((row) => [row.id, row]));
}

async function makeMigration(args) {
  const name = slugify(args.join(" "));
  if (!name) {
    throw new Error("Migration name is required.");
  }

  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
  const filename = `${timestamp()}_${name}.sql`;
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const template = `-- migrate:up
-- migrate:down
`;

  await fs.writeFile(filePath, template, { flag: "wx" });
  console.log(`Created ${path.relative(process.cwd(), filePath)}`);
}

async function migrateUp() {
  const database = await openDb();
  try {
    const migrations = await readMigrations();
    const applied = await appliedMap(database);
    const pending = migrations.filter(
      (migration) => !applied.has(migration.id)
    );

    for (const migration of pending) {
      await database.exec("BEGIN IMMEDIATE");
      try {
        if (migration.upSql.length > 0) {
          await database.exec(migration.upSql);
        }
        await database.run(
          "INSERT INTO schema_migrations (id, name) VALUES (?, ?)",
          [migration.id, migration.name]
        );
        await database.exec("COMMIT");
        console.log(`Applied ${migration.filename}`);
      } catch (error) {
        await database.exec("ROLLBACK");
        throw error;
      }
    }

    if (pending.length === 0) {
      console.log("No pending migrations.");
    }
  } finally {
    await database.close();
  }
}

async function migrateDown(args) {
  const steps = args[0] === undefined ? 1 : Number.parseInt(args[0], 10);
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error("Rollback steps must be a positive integer.");
  }

  const database = await openDb();
  try {
    const migrations = await readMigrations();
    const byId = new Map(
      migrations.map((migration) => [migration.id, migration])
    );
    const appliedRows = await database.all(
      "SELECT id, name FROM schema_migrations ORDER BY id DESC LIMIT ?",
      [steps]
    );

    for (const row of appliedRows) {
      const migration = byId.get(row.id);
      if (!migration) {
        throw new Error(
          `Applied migration ${row.id} is missing from migrations/`
        );
      }
      if (migration.downSql.length === 0) {
        throw new Error(`Migration ${migration.filename} has no down SQL.`);
      }

      await database.exec("BEGIN IMMEDIATE");
      try {
        await database.exec(migration.downSql);
        await database.run("DELETE FROM schema_migrations WHERE id = ?", [
          migration.id,
        ]);
        await database.exec("COMMIT");
        console.log(`Rolled back ${migration.filename}`);
      } catch (error) {
        await database.exec("ROLLBACK");
        throw error;
      }
    }

    if (appliedRows.length === 0) {
      console.log("No applied migrations to roll back.");
    }
  } finally {
    await database.close();
  }
}

async function migrateDrop() {
  const database = await openDb();
  try {
    await ensureMigrationsTable(database);
    const appliedRows = await database.all(
      "SELECT COUNT(*) AS count FROM schema_migrations"
    );
    const count = appliedRows[0]?.count ?? 0;
    if (count === 0) {
      console.log("No applied migrations to roll back.");
      return;
    }
  } finally {
    await database.close();
  }

  await migrateDown([String(Number.MAX_SAFE_INTEGER)]);
}

async function status() {
  const database = await openDb();
  try {
    const migrations = await readMigrations();
    const applied = await appliedMap(database);

    if (migrations.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const migration of migrations) {
      const row = applied.get(migration.id);
      const state = row ? `applied ${row.applied_at}` : "pending";
      console.log(`${migration.filename}  ${state}`);
    }
  } finally {
    await database.close();
  }
}

async function listBackups() {
  let entries;
  try {
    entries = await fs.readdir(BACKUPS_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.endsWith(".bak"))
    .sort()
    .reverse();
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function restore(args) {
  const backups = await listBackups();

  if (args.length === 0) {
    if (backups.length === 0) {
      console.log(`No backups found in ${BACKUPS_DIR}`);
      return;
    }

    console.log("Available backups (most recent first):");
    for (const name of backups) {
      console.log(`  ${name}`);
    }
    console.log(
      `\nRestore one with:\n  npm run zina:migrate:restore -- ${backups[0]}`
    );
    return;
  }

  const requested = args[0];
  const backupPath = path.isAbsolute(requested)
    ? requested
    : path.join(BACKUPS_DIR, requested);

  if (!(await fileExists(backupPath))) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  // Stop is on the operator: this overwrites the live database file, so it
  // should only be run while the app is not running against DB_PATH.
  if (await fileExists(DB_PATH)) {
    await fs.mkdir(BACKUPS_DIR, { recursive: true });
    const preRestorePath = path.join(
      BACKUPS_DIR,
      `${path.basename(DB_PATH)}.pre-restore-${timestamp()}.bak`
    );
    await fs.copyFile(DB_PATH, preRestorePath);
    console.log(
      `Backed up the current database to ${preRestorePath} before restoring.`
    );
  }

  await fs.copyFile(backupPath, DB_PATH);

  // Drop any stale WAL/SHM files so SQLite doesn't try to replay old WAL
  // frames against the restored file on next open.
  for (const suffix of ["-wal", "-shm"]) {
    await fs.rm(`${DB_PATH}${suffix}`, { force: true });
  }

  console.log(`Restored ${DB_PATH} from ${backupPath}.`);
  console.log(
    "Restart the app for the restored database to take effect. Note: any " +
      "migrations applied after this backup was taken will run again on " +
      "the next startup, since the restored file predates them."
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "make":
      await makeMigration(args);
      break;
    case "up":
      await migrateUp();
      break;
    case "down":
      await migrateDown(args);
      break;
    case "drop":
      await migrateDrop();
      break;
    case "status":
      await status();
      break;
    case "restore":
      await restore(args);
      break;
    default:
      printUsage();
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

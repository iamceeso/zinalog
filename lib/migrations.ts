import { readdir, readFile, copyFile, mkdir } from "fs/promises";
import { basename, dirname, join } from "path";
import type { Database as SqliteDatabase } from "sqlite";

export interface Migration {
  id: string;
  name: string;
  filename: string;
  upSql: string;
  downSql: string;
}

export interface MigrationStatus extends Migration {
  appliedAt: string | null;
}

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

function parseMigrationId(filename: string): { id: string; name: string } {
  const match = filename.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) {
    throw new Error(
      `Invalid migration filename "${filename}". Expected YYYYMMDDHHMMSS_name.sql`
    );
  }

  return { id: match[1], name: match[2] };
}

function parseMigrationSql(
  filename: string,
  sql: string
): {
  upSql: string;
  downSql: string;
} {
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

async function ensureMigrationsTable(database: SqliteDatabase): Promise<void> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at DATETIME DEFAULT (datetime('now'))
    );
  `);
}

export async function readMigrations(): Promise<Migration[]> {
  let entries: string[];

  try {
    entries = await readdir(MIGRATIONS_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const migrations = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".sql"))
      .sort((left, right) => left.localeCompare(right))
      .map(async (filename) => {
        const { id, name } = parseMigrationId(filename);
        const sql = await readFile(join(MIGRATIONS_DIR, filename), {
          encoding: "utf8",
        });
        const { upSql, downSql } = parseMigrationSql(filename, sql);

        return { id, name, filename, upSql, downSql };
      })
  );

  const seen = new Set<string>();
  for (const migration of migrations) {
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate migration id "${migration.id}"`);
    }
    seen.add(migration.id);
  }

  return migrations;
}

export async function getMigrationStatuses(
  database: SqliteDatabase
): Promise<MigrationStatus[]> {
  await ensureMigrationsTable(database);

  const appliedRows = (await database.all<
    {
      id: string;
      applied_at: string;
    }[]
  >("SELECT id, applied_at FROM schema_migrations")) as Array<{
    id: string;
    applied_at: string;
  }>;
  const applied = new Map(
    appliedRows.map((row) => [row.id, row.applied_at] as const)
  );

  return (await readMigrations()).map((migration) => ({
    ...migration,
    appliedAt: applied.get(migration.id) ?? null,
  }));
}

// Create a backup before applying pending migrations. Returns null for
// in-memory or anonymous databases, which have nothing to back up.
async function backupDatabaseFile(
  database: SqliteDatabase
): Promise<string | null> {
  const dbFilename = database.config.filename;
  if (!dbFilename || dbFilename === ":memory:") {
    return null;
  }

  // Flush WAL contents into the main file so the copy below is a complete,
  // self-contained snapshot that doesn't need companion -wal/-shm files.
  await database.exec("PRAGMA wal_checkpoint(TRUNCATE)");

  const backupDir = join(dirname(dbFilename), "backups");
  await mkdir(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(
    backupDir,
    `${basename(dbFilename)}.pre-migrate-${stamp}.bak`
  );
  await copyFile(dbFilename, backupPath);

  return backupPath;
}

export async function runPendingMigrations(
  database: SqliteDatabase
): Promise<Migration[]> {
  await ensureMigrationsTable(database);

  const statuses = await getMigrationStatuses(database);
  const pending = statuses.filter((migration) => migration.appliedAt === null);

  if (pending.length > 0) {
    const backupPath = await backupDatabaseFile(database);
    if (backupPath) {
      console.log(
        `[migrations] Backed up database to ${backupPath} before applying ` +
          `${pending.length} pending migration(s).`
      );
    }
  }

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
    } catch (error) {
      await database.exec("ROLLBACK");
      throw error;
    }
  }

  return pending;
}

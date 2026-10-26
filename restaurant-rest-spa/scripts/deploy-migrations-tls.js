require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { getSslOptions, normalizeConnectionString } = require('../server/src/lib/postgres-adapter');

const migrationsDirectory = path.join(__dirname, '..', 'prisma', 'migrations');
const migrationsTableSql = `CREATE TABLE "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
)`;

function listMigrations() {
  return fs.readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_[a-z0-9_-]+$/i.test(entry.name))
    .map((entry) => {
      const filePath = path.join(migrationsDirectory, entry.name, 'migration.sql');
      if (!fs.existsSync(filePath)) throw new Error(`Missing migration.sql in ${entry.name}.`);
      const contents = fs.readFileSync(filePath);
      return { name: entry.name, filePath, contents, checksum: crypto.createHash('sha256').update(contents).digest('hex') };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function deployMigrations() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set DIRECT_URL (preferred) or DATABASE_URL before deploying migrations.');

  const migrations = listMigrations();
  const client = new Client({
    connectionString: normalizeConnectionString(connectionString),
    ssl: getSslOptions(),
    connectionTimeoutMillis: 8000
  });
  await client.connect();

  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('bep-hoi-prisma-migrations'))");
    locked = true;

    let tableExists = (await client.query(`SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS present`)).rows[0].present;
    if (!tableExists) {
      const existingTables = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      if (existingTables.rows.length) {
        throw new Error('The database has tables but no Prisma migration history. Inspect and baseline it before deployment.');
      }
    }

    let applied = [];
    if (tableExists) {
      applied = (await client.query(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`)).rows;
      const localNames = new Set(migrations.map((migration) => migration.name));
      const unknown = applied.find((row) => !localNames.has(row.migration_name));
      if (unknown) throw new Error(`Database migration ${unknown.migration_name} has no matching local migration file.`);
    }

    for (const migration of migrations) {
      const existing = applied.find((row) => row.migration_name === migration.name);
      if (existing) {
        if (existing.checksum !== migration.checksum) throw new Error(`Checksum mismatch for ${migration.name}; refusing to continue.`);
        if (!existing.finished_at || existing.rolled_back_at) throw new Error(`Migration ${migration.name} is not in a finished state; inspect it before retrying.`);
        console.log(`Already applied: ${migration.name}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        if (!tableExists) {
          await client.query(migrationsTableSql);
          tableExists = true;
        }
        await client.query(migration.contents.toString('utf8'));
        await client.query(`
          INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
          VALUES ($1, $2, now(), $3, now(), 1)
        `, [crypto.randomUUID(), migration.checksum, migration.name]);
        await client.query('COMMIT');
        applied.push({ migration_name: migration.name, checksum: migration.checksum, finished_at: new Date(), rolled_back_at: null });
        console.log(`Applied: ${migration.name}`);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      }
    }
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('bep-hoi-prisma-migrations'))").catch(() => {});
    await client.end();
  }
}

deployMigrations().catch((error) => {
  console.error(`Migration deployment failed: ${error.code || error.message}`);
  process.exitCode = 1;
});

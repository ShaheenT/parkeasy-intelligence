import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5_000,
  ...(process.env.DATABASE_SSL === 'true'
    ? { ssl: { rejectUnauthorized: true } }
    : {})
});

const lockKey = 'parkeasy-intelligence-schema-migrations';

try {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const directory = new URL('../migrations/', import.meta.url);
    const files = (await readdir(directory))
      .filter(file => /^\\d+_[a-z0-9_-]+\\.sql$/i.test(file))
      .sort();

    for (const file of files) {
      const sql = await readFile(new URL(file, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [file]
      );

      if (existing.rowCount) {
        if (existing.rows[0]!.checksum !== checksum) {
          throw new Error(`Applied migration ${file} has changed. Create a new migration instead.`);
        }
        console.log(`Migration ${file} already applied.`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [file, checksum]
        );
        await client.query('COMMIT');
        console.log(`Migration ${file} applied successfully.`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}

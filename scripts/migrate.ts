import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const sql = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Migration 001 applied successfully.');
} finally {
  await pool.end();
}

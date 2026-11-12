/**
 * Aplica migrations SQL pendentes (packages/core/migrations/*.sql) e sincroniza a
 * taxonomia de técnicas. Uso: DATABASE_URL=... npm run db:migrate
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool, withTransaction } from './db.ts';
import { TECHNIQUES } from './techniques.ts';

const dir = fileURLToPath(new URL('../migrations/', import.meta.url));

async function main() {
  const pool = getPool();
  await pool.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await pool.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await withTransaction(async (c) => {
      await c.query(sql);
      await c.query('insert into schema_migrations(name) values ($1)', [file]);
    });
    console.log(`✔ migration aplicada: ${file}`);
  }

  for (const t of TECHNIQUES) {
    await pool.query(
      `insert into techniques (slug, name_pt, name_en, category, aliases) values ($1,$2,$3,$4,$5)
       on conflict (slug) do update set name_pt = excluded.name_pt, name_en = excluded.name_en,
         category = excluded.category, aliases = excluded.aliases`,
      [t.slug, t.namePt, t.nameEn, t.category, t.aliases.map((a) => a.replace(/^~/, ''))],
    );
  }
  console.log(`✔ ${TECHNIQUES.length} técnicas sincronizadas`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

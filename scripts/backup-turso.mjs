import { createClient } from '@libsql/client';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const url = process.env.TURSO_DATABASE_URL,
  authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) throw new Error('Configure database URL');
const directory = process.env.REPOR_BACKUP_DIR;
if (!directory)
  throw new Error(
    'Set REPOR_BACKUP_DIR to a private directory outside the repository',
  );
mkdirSync(directory, { recursive: true });
const path = resolve(directory, `repor-${Date.now()}.sqlite`);
const client = createClient({ url, authToken });
const tx = await client.transaction('read');
const local = new DatabaseSync(path);
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const counts = {};
try {
  const schema = await tx.execute(
    "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END",
  );
  local.exec('PRAGMA foreign_keys=OFF; BEGIN');
  for (const row of schema.rows.filter((r) => r.type === 'table')) {
    local.exec(row.sql);
    const data = await tx.execute(`SELECT * FROM ${quote(row.name)}`);
    if (data.rows.length) {
      const insert = local.prepare(
        `INSERT INTO ${quote(row.name)} (${data.columns.map(quote).join(',')}) VALUES (${data.columns.map(() => '?').join(',')})`,
      );
      for (const item of data.rows)
        insert.run(
          ...data.columns.map((c) =>
            item[c] instanceof ArrayBuffer ? new Uint8Array(item[c]) : item[c],
          ),
        );
    }
    counts[row.name] = data.rows.length;
    if (
      local.prepare(`SELECT COUNT(*) n FROM ${quote(row.name)}`).get().n !==
      counts[row.name]
    )
      throw new Error('Row count mismatch');
  }
  for (const row of schema.rows.filter((r) => r.type !== 'table'))
    local.exec(row.sql);
  local.exec('COMMIT');
  if (local.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
    throw new Error('Backup integrity check failed');
  if (local.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('Backup foreign key check failed');
  await tx.commit();
} finally {
  local.close();
  tx.close();
  client.close();
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const manifest = {
  createdAt: new Date().toISOString(),
  databaseFingerprint: sha(url),
  sha256: sha(readFileSync(path)),
  counts,
  integrity: 'ok',
  file: path,
};
writeFileSync(path + '.json', JSON.stringify(manifest, null, 2), {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    backup: path,
    manifest: path + '.json',
    integrity: 'ok',
    tables: Object.keys(counts).length,
  }),
);

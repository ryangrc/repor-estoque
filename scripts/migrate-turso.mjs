import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;
if (!url || !authToken) throw new Error('Configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before migrating');
const client = createClient({ url, authToken });
try {
  await client.execute('CREATE TABLE IF NOT EXISTS _repor_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
  for (const name of readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) {
    const source = readFileSync(`drizzle/${name}`, 'utf8');
    const checksum = createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
    const previous = await client.execute({ sql: 'SELECT checksum FROM _repor_migrations WHERE name=?', args: [name] });
    if (previous.rows.length) {
      if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    const statements = source.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    await client.batch([...statements, { sql: 'INSERT INTO _repor_migrations (name,checksum) VALUES (?,?)', args: [name, checksum] }], 'write');
    console.log(`Applied ${name}`);
  }
} finally { client.close(); }

// Initialize the first administrator before the new installation becomes public.
// The value is provided as a deployment secret and never included in source.
const bootstrap = process.env.REPOR_BOOTSTRAP_ADMIN;
const initialClient = createClient({ url, authToken });
try {
  const configured = await initialClient.execute('SELECT id FROM setup LIMIT 1');
  if (!configured.rows.length) {
    if (!bootstrap) throw new Error('REP0R bootstrap administrator is required for the first deployment');
    const admin = JSON.parse(bootstrap);
    if (!admin.id || !admin.email || !admin.name || !/^\$2[aby]\$\d\d\$/.test(admin.passwordHash)) throw new Error('Invalid bootstrap administrator');
    const date = new Date().toISOString();
    await initialClient.batch([
      "INSERT OR IGNORE INTO roles (name) VALUES ('admin')",
      "INSERT OR IGNORE INTO roles (name) VALUES ('collaborator')",
      {sql:'INSERT INTO users (id,name,email,passwordHash,role,createdAt) VALUES (?,?,?,?,?,?)',args:[admin.id,admin.name,admin.email,admin.passwordHash,'admin',date]},
      {sql:'INSERT INTO setup (id,userId) VALUES (1,?)',args:[admin.id]},
      ...['Embalagens','Insumos','Ingredientes','Limpeza','Organização','Bebidas','Outros'].map(name => ({sql:'INSERT INTO categories (id,name) VALUES (?,?)',args:[crypto.randomUUID(),name]})),
      {sql:'INSERT INTO shoppingLists (id,status,createdAt) VALUES (?,?,?)',args:[crypto.randomUUID(),'open',date]},
    ], 'write');
    console.log('Initial administrator configured.');
  }
} finally { initialClient.close(); }

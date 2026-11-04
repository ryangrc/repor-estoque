import { createClient, type Client, type InValue } from '@libsql/client';
import type { Database, Statement } from './database';
export function createTursoDatabase(client: Client): Database {
  class Prepared implements Statement {
    constructor(readonly sql: string, readonly args: InValue[] = []) {}
    bind(...values: unknown[]) { return new Prepared(this.sql, values as InValue[]); }
    async first<T>() { return ((await client.execute(this)).rows[0] ?? null) as T | null; }
    async all<T>() { return { results: (await client.execute(this)).rows as unknown as T[] }; }
    async run() { return client.execute(this); }
  }
  return {
    prepare: (sql) => new Prepared(sql),
    async batch(statements) {
      return client.batch(statements.map((statement) => {
        if (!(statement instanceof Prepared)) throw new Error('Invalid database statement');
        return { sql: statement.sql, args: statement.args };
      }), 'write');
    },
  };
}
let database: Database | undefined;
export function getDatabase(): Database {
  if (!database) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) throw new Error('Turso database configuration is missing');
    database = createTursoDatabase(createClient({ url, authToken }));
  }
  return database;
}

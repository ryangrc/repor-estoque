import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { Database, Statement } from '../server/database';
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${f}`, 'utf8'));
  class Prepared implements Statement {
    constructor(
      public sql: string,
      public values: SQLInputValue[] = [],
    ) {}
    bind(...values: unknown[]) {
      return new Prepared(this.sql, values as SQLInputValue[]);
    }
    first<T>() {
      return Promise.resolve(
        (sqlite.prepare(this.sql).get(...this.values) || null) as T | null,
      );
    }
    all<T>() {
      return Promise.resolve({
        results: sqlite.prepare(this.sql).all(...this.values) as T[],
      });
    }
    run() {
      return Promise.resolve(sqlite.prepare(this.sql).run(...this.values));
    }
  }
  const db: Database = {
    prepare: (sql) => new Prepared(sql),
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((raw) => {
          const s = raw as Prepared;
          return sqlite.prepare(s.sql).run(...s.values);
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db, sqlite };
}

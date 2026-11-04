export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function query(db: Database, sql: string, ...values: unknown[]) {
  return db.prepare(sql).bind(...values);
}
export async function all<T>(db: Database, sql: string, ...values: unknown[]) {
  return (await query(db, sql, ...values).all<T>()).results;
}
export function audit(
  db: Database,
  userId: string | null,
  action: string,
  entity: string,
  before: unknown = null,
  after: unknown = null,
  note = '',
) {
  return query(
    db,
    'INSERT INTO auditLogs (id,userId,action,entity,before,after,note,createdAt) VALUES (?,?,?,?,?,?,?,?)',
    id(),
    userId,
    action,
    entity,
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
    note,
    now(),
  );
}
// A failed guard violates NOT NULL and rolls the whole D1 batch back, including prior writes.
export function guard(db: Database, condition: string, ...values: unknown[]) {
  return query(
    db,
    `INSERT INTO limits (key,count,until) VALUES (?, CASE WHEN (${condition}) THEN 0 ELSE NULL END,0) ON CONFLICT(key) DO UPDATE SET count=excluded.count`,
    'transaction-guard',
    ...values,
  );
}

import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
export const roles = sqliteTable('roles', { name: text().primaryKey() });
export const users = sqliteTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text(),
  role: text()
    .notNull()
    .references(() => roles.name),
  active: integer().notNull().default(1),
  job: text().notNull().default(''),
  phone: text().notNull().default(''),
  canUpdateStock: integer().notNull().default(1),
  createdAt: text().notNull(),
});
export const setup = sqliteTable('setup', {
  id: integer().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id),
});
export const sessions = sqliteTable(
  'sessions',
  {
    hash: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id),
    csrf: text().notNull(),
    expiresAt: integer().notNull(),
  },
  (t) => [index('session_user').on(t.userId)],
);
export const passwordResetTokens = sqliteTable('passwordResetTokens', {
  hash: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id),
  expiresAt: integer().notNull(),
  kind: text().notNull(),
});
export const limits = sqliteTable('limits', {
  key: text().primaryKey(),
  count: integer().notNull(),
  until: integer().notNull(),
});
export const categories = sqliteTable('categories', {
  id: text().primaryKey(),
  name: text().notNull().unique(),
  active: integer().notNull().default(1),
});
export const products = sqliteTable('products', {
  id: text().primaryKey(),
  name: text().notNull().unique(),
  categoryId: text()
    .notNull()
    .references(() => categories.id),
  description: text().notNull().default(''),
  quantity: real().notNull(),
  minimum: real().notNull(),
  ideal: real().notNull(),
  unit: text().notNull(),
  manualStatus: text(),
  note: text().notNull().default(''),
  flagged: integer().notNull().default(0),
  active: integer().notNull().default(1),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
  updatedBy: text()
    .notNull()
    .references(() => users.id),
  revision: integer().notNull().default(0),
});
export const stockMovements = sqliteTable('stockMovements', {
  id: text().primaryKey(),
  productId: text()
    .notNull()
    .references(() => products.id),
  userId: text()
    .notNull()
    .references(() => users.id),
  before: real().notNull(),
  after: real().notNull(),
  difference: real().notNull(),
  reason: text().notNull(),
  note: text().notNull(),
  createdAt: text().notNull(),
});
export const shoppingLists = sqliteTable(
  'shoppingLists',
  {
    id: text().primaryKey(),
    status: text().notNull(),
    createdAt: text().notNull(),
    finalizedAt: text(),
    finalizedBy: text().references(() => users.id),
    note: text().notNull().default(''),
  },
  (t) => [
    uniqueIndex('one_open_list')
      .on(t.status)
      .where(sql`status = 'open'`),
  ],
);
export const shoppingListItems = sqliteTable(
  'shoppingListItems',
  {
    id: text().primaryKey(),
    listId: text()
      .notNull()
      .references(() => shoppingLists.id),
    productId: text()
      .notNull()
      .references(() => products.id),
    quantity: real().notNull(),
    note: text().notNull().default(''),
    purchased: integer().notNull().default(0),
    received: integer().notNull().default(0),
    addedBy: text()
      .notNull()
      .references(() => users.id),
    addedAt: text().notNull(),
    revision: integer().notNull().default(0),
  },
  (t) => [uniqueIndex('list_product').on(t.listId, t.productId)],
);
export const auditLogs = sqliteTable('auditLogs', {
  id: text().primaryKey(),
  userId: text().references(() => users.id),
  action: text().notNull(),
  entity: text().notNull(),
  before: text(),
  after: text(),
  note: text().notNull().default(''),
  createdAt: text().notNull(),
});
import { sql } from 'drizzle-orm';
export const invitations = sqliteTable(
  'invitations',
  {
    hash: text().primaryKey(),
    userId: text()
      .notNull()
      .unique()
      .references(() => users.id),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: text().notNull(),
    expiresAt: integer().notNull(),
    usedAt: text(),
    delivery: text().notNull().default('pending'),
    providerId: text(),
  },
  (t) => [
    check(
      'invitations_delivery',
      sql`${t.delivery} IN ('pending','accepted','failed')`,
    ),
  ],
);

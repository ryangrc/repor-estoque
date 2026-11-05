import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { createTursoDatabase } from '../server/turso';
import { handle } from '../server/api';
import { guard, query } from '../server/database';
import { shoppingAction } from '../server/shopping';

void test('Turso adapter preserves login, session reads and atomic rollback', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    for (const file of readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      await client.batch(
        readFileSync(`drizzle/${file}`, 'utf8')
          .split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter(Boolean),
        'write',
      );
    }
    const db = createTursoDatabase(client);
    const password = crypto.randomUUID() + 'Aa1!';
    const request = (body: unknown, cookie = '') =>
      new Request('https://repor.test/api', {
        method: 'POST',
        headers: {
          origin: 'https://repor.test',
          'content-type': 'application/json',
          cookie,
        },
        body: JSON.stringify(body),
      });
    const setup = await handle(
      request({
        action: 'setup',
        name: 'Admin Teste',
        email: 'admin@example.test',
        password,
        confirm: password,
      }),
      db,
      {},
    );
    assert.equal(setup.status, 200);
    const login = await handle(
      request({ action: 'login', email: 'admin@example.test', password }),
      db,
      {},
    );
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const state = await handle(
      new Request('https://repor.test/api', { headers: { cookie } }),
      db,
      {},
    );
    const data = await state.json();
    assert.equal(data.user.email, 'admin@example.test');
    assert.equal(data.user.passwordHash, undefined);
    await assert.rejects(
      db.batch([
        query(
          db,
          'INSERT INTO categories (id,name) VALUES (?,?)',
          'rollback-test',
          'Rollback test',
        ),
        guard(db, '0=1'),
      ]),
    );
    assert.equal(
      await query(
        db,
        'SELECT id FROM categories WHERE id=?',
        'rollback-test',
      ).first(),
      null,
    );
    const wrongOrigin = await handle(
      new Request('https://repor.test/api', {
        method: 'POST',
        headers: {
          origin: 'https://evil.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'login',
          email: 'admin@example.test',
          password,
        }),
      }),
      db,
      {},
    );
    assert.equal(wrongOrigin.status, 403);
    const category = (await client.execute('SELECT id FROM categories LIMIT 1'))
      .rows[0].id;
    const listId = (
      await client.execute("SELECT id FROM shoppingLists WHERE status='open'")
    ).rows[0].id as string;
    for (const [id, quantity] of [
      ['bought', 4],
      ['pending', 2],
    ] as const) {
      await client.execute({
        sql: 'INSERT INTO products (id,name,categoryId,quantity,minimum,ideal,unit,createdAt,updatedAt,updatedBy) VALUES (?,?,?,?,?,?,?,?,?,?)',
        args: [
          id,
          id,
          category,
          quantity,
          1,
          10,
          'un',
          '2026-11-04',
          '2026-11-04',
          data.user.id,
        ],
      });
      await client.execute({
        sql: 'INSERT INTO shoppingListItems (id,listId,productId,quantity,purchased,note,addedBy,addedAt) VALUES (?,?,?,?,?,?,?,?)',
        args: [
          id,
          listId,
          id,
          3,
          id === 'bought' ? 1 : 0,
          '',
          data.user.id,
          '2026-11-04',
        ],
      });
    }
    // A stock edit racing confirmation must roll back the entire purchase.
    const racingDb = {
      ...db,
      async batch(statements: Parameters<typeof db.batch>[0]) {
        await client.execute(
          "UPDATE products SET revision=revision+1 WHERE id='bought'",
        );
        return db.batch(statements);
      },
    };
    await assert.rejects(
      shoppingAction(racingDb, data.user, 'shopping.finish', {
        listId,
        date: '2026-11-04',
        note: '',
      }),
    );
    assert.equal(
      (await client.execute("SELECT quantity FROM products WHERE id='bought'"))
        .rows[0].quantity,
      4,
    );
    assert.equal(
      (
        await client.execute({
          sql: 'SELECT status FROM shoppingLists WHERE id=?',
          args: [listId],
        })
      ).rows[0].status,
      'open',
    );
    await shoppingAction(db, data.user, 'shopping.finish', {
      listId,
      date: '2026-11-04',
      note: '',
    });
    assert.equal(
      (await client.execute("SELECT quantity FROM products WHERE id='bought'"))
        .rows[0].quantity,
      7,
    );
    assert.equal(
      (await client.execute("SELECT quantity FROM products WHERE id='pending'"))
        .rows[0].quantity,
      2,
    );
    assert.equal(
      (
        await client.execute(
          "SELECT received FROM shoppingListItems WHERE id='bought'",
        )
      ).rows[0].received,
      1,
    );
    assert.notEqual(
      (
        await client.execute(
          "SELECT listId FROM shoppingListItems WHERE id='pending'",
        )
      ).rows[0].listId,
      listId,
    );
    await assert.rejects(
      shoppingAction(db, data.user, 'shopping.finish', {
        listId,
        date: '2026-11-04',
        note: '',
      }),
    );
    await assert.rejects(
      shoppingAction(db, data.user, 'shopping.receive', { id: 'bought' }),
    );
    assert.equal(
      (
        await client.execute(
          "SELECT COUNT(*) AS n FROM stockMovements WHERE productId='bought'",
        )
      ).rows[0].n,
      1,
    );
    // Purchases completed before the update still support manual receipt.
    await client.execute(
      "INSERT INTO shoppingLists (id,status,createdAt) VALUES ('legacy','completed','2026-11-03')",
    );
    await client.execute({
      sql: 'INSERT INTO shoppingListItems (id,listId,productId,quantity,purchased,note,addedBy,addedAt) VALUES (?,?,?,?,?,?,?,?)',
      args: [
        'legacy-item',
        'legacy',
        'pending',
        3,
        1,
        '',
        data.user.id,
        '2026-11-03',
      ],
    });
    await shoppingAction(db, data.user, 'shopping.receive', {
      id: 'legacy-item',
    });
    await assert.rejects(
      shoppingAction(db, data.user, 'shopping.receive', { id: 'legacy-item' }),
    );
    assert.equal(
      (await client.execute("SELECT quantity FROM products WHERE id='pending'"))
        .rows[0].quantity,
      5,
    );
  } finally {
    client.close();
  }
});

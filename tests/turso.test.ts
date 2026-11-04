import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { createTursoDatabase } from '../server/turso';
import { handle } from '../server/api';
import { guard, query } from '../server/database';

test('Turso adapter preserves login, session reads and atomic rollback', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
      await client.batch(readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean), 'write');
    }
    const db = createTursoDatabase(client);
    const password = crypto.randomUUID() + 'Aa1!';
    const request = (body: unknown, cookie = '') => new Request('https://repor.test/api', {
      method: 'POST', headers: {origin:'https://repor.test','content-type':'application/json',cookie}, body: JSON.stringify(body),
    });
    const setup = await handle(request({ action:'setup',name:'Admin Teste',email:'admin@example.test',password,confirm:password }), db, {});
    assert.equal(setup.status, 200);
    const login = await handle(request({action:'login',email:'admin@example.test',password}), db, {});
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const state = await handle(new Request('https://repor.test/api', {headers:{cookie}}), db, {});
    const data = await state.json();
    assert.equal(data.user.email, 'admin@example.test');
    assert.equal(data.user.passwordHash, undefined);
    await assert.rejects(db.batch([
      query(db, 'INSERT INTO categories (id,name) VALUES (?,?)', 'rollback-test', 'Rollback test'),
      guard(db, '0=1'),
    ]));
    assert.equal(await query(db, 'SELECT id FROM categories WHERE id=?', 'rollback-test').first(), null);
    const wrongOrigin = await handle(new Request('https://repor.test/api', {method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify({action:'login',email:'admin@example.test',password})}),db,{});
    assert.equal(wrongOrigin.status,403);
  } finally { client.close(); }
});

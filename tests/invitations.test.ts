import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import type { User } from '../lib/domain';
import { handle } from '../server/api';
import { createTursoDatabase } from '../server/turso';
import { query } from '../server/database';
import { digest, newSession } from '../server/security';
import { sendAccountMail, type Config } from '../server/mail';

void test('isolated libsql: pending users, activation, expiry, resend, permissions, blocking and preserved credentials', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    for (const f of readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await client.batch(
        readFileSync(`drizzle/${f}`, 'utf8')
          .split('--> statement-breakpoint')
          .filter((s) => s.trim()),
        'write',
      );
    const db = createTursoDatabase(client),
      sent: { to: string; link: string }[] = [];
    const config: Config = {
      APP_URL: 'https://preview.example.test',
      EMAIL_TEST_MODE: 'true',
      EMAIL_TEST_RECIPIENT: 'invite@example.test',
      sendMail: async (to, link) => {
        sent.push({ to, link });
      },
    };
    let cookie = '',
      csrf = '';
    async function req(action?: string, b: Record<string, unknown> = {}) {
      const response = await handle(
        new Request('https://preview.example.test/api', {
          method: action ? 'POST' : 'GET',
          headers: {
            origin: 'https://preview.example.test',
            'content-type': 'application/json',
            cookie,
            'x-csrf-token': csrf,
          },
          body: action ? JSON.stringify({ action, ...b }) : undefined,
        }),
        db,
        config,
      );
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const originalPassword = crypto.randomUUID() + 'Aa1!';
    const setup = await req('setup', {
      name: 'Original admin',
      email: 'owner@example.test',
      password: originalPassword,
      confirm: originalPassword,
    });
    assert.equal(setup.status, 200);
    cookie = setup.cookie!;
    csrf = setup.body.csrf;
    const ownerCookie = cookie,
      ownerCsrf = csrf;
    const owner = await query(
      db,
      'SELECT * FROM users WHERE email=?',
      'owner@example.test',
    ).first();
    const input = {
      name: 'Invited operator',
      email: 'invite@example.test',
      phone: '+55 (11) 99999-9999',
      role: 'collaborator',
    };
    assert.equal(
      (await req('user.create', { ...input, password: 'Forbidden' })).status,
      400,
    );
    assert.equal((await req('user.create', input)).status, 200);
    const pending = (await req()).body.users.find(
      (u: User) => u.email === input.email,
    );
    assert.equal(pending.status, 'pending');
    assert.equal(sent.length, 1);
    const pendingSession = await newSession(db, pending.id, true);
    cookie = pendingSession.cookie.split(';')[0];
    csrf = pendingSession.csrf;
    assert.equal((await req()).body.login, true); // Even a forged/preexisting session cannot admit pending users.
    cookie = ownerCookie;
    csrf = ownerCsrf;
    const token = (index: number) =>
      new URLSearchParams(new URL(sent[index].link).hash.slice(1)).get(
        'activate',
      )!;
    const first = token(0);
    const stored = await query(
      db,
      'SELECT * FROM invitations WHERE userId=?',
      pending.id,
    ).first();
    assert.equal(stored?.hash, await digest(first));
    assert.notEqual(stored?.hash, first);
    assert.equal(
      (await req('login', { email: input.email, password: originalPassword }))
        .status,
      401,
    );
    assert.equal(
      (
        await req('reset', {
          token: first,
          password: originalPassword,
          confirm: originalPassword,
        })
      ).status,
      400,
    );
    assert.equal((await req('activation.check', { token: first })).status, 200);
    await query(
      db,
      'UPDATE invitations SET expiresAt=0 WHERE userId=?',
      pending.id,
    ).run();
    assert.equal((await req('activation.check', { token: first })).status, 400);
    assert.equal((await req('user.resend', { id: pending.id })).status, 200);
    const second = token(1);
    assert.notEqual(second, first);
    assert.equal((await req('activation.check', { token: first })).status, 400);
    assert.equal(
      (
        await req('activate', {
          token: second,
          password: 'weak',
          confirm: 'weak',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req('activate', {
          token: second,
          password: originalPassword,
          confirm: 'different',
        })
      ).status,
      400,
    );
    const password = crypto.randomUUID() + 'Aa1!';
    const results = await Promise.all([
      req('activate', { token: second, password, confirm: password }),
      req('activate', { token: second, password, confirm: password }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(
      (await req('activate', { token: second, password, confirm: password }))
        .status,
      400,
    );
    assert.equal((await req('user.resend', { id: pending.id })).status, 409);
    const login = await req('login', { email: input.email, password });
    assert.equal(login.status, 200);
    cookie = login.cookie!;
    csrf = login.body.csrf;
    assert.equal((await req()).body.user.status, 'active');
    assert.equal(
      (
        await req('user.update', {
          ...pending,
          role: 'admin',
          active: true,
          canUpdateStock: true,
        })
      ).status,
      403,
    );
    assert.equal(
      (await req('user.create', { ...input, email: 'other@example.test' }))
        .status,
      403,
    );
    assert.deepEqual((await req()).body.users, []);
    cookie = ownerCookie;
    csrf = ownerCsrf;
    const change = { ...pending, active: false, canUpdateStock: true };
    assert.equal((await req('user.update', change)).status, 200);
    assert.equal(
      (await req('login', { email: input.email, password })).status,
      401,
    );
    cookie = login.cookie!;
    csrf = login.body.csrf;
    assert.equal((await req()).body.login, true);
    cookie = ownerCookie;
    csrf = ownerCsrf;
    assert.equal(
      (await req('user.update', { ...change, active: true, role: 'admin' }))
        .status,
      200,
    );
    assert.equal(
      (await req('login', { email: input.email, password })).status,
      200,
    );
    assert.equal(
      (
        await req('user.update', {
          ...change,
          active: true,
          email: 'takeover@example.test',
        })
      ).status,
      400,
    );
    assert.equal(
      (await req('user.update', { ...change, password, confirm: password }))
        .status,
      400,
    );
    assert.equal(
      (
        await req('user.create', {
          ...input,
          email: 'not-allowed@example.test',
        })
      ).status,
      200,
    );
    assert.equal(sent.length, 2);
    const failed = (await req()).body.users.find(
      (u: User) => u.email === 'not-allowed@example.test',
    );
    assert.equal(failed.status, 'pending');
    assert.equal(
      (
        await query(
          db,
          'SELECT delivery,expiresAt FROM invitations WHERE userId=?',
          failed.id,
        ).first()
      )?.delivery,
      'failed',
    );
    // Existing account collisions never overwrite names, roles or hashes.
    assert.equal(
      (await req('user.create', { ...input, email: 'owner@example.test' }))
        .status,
      409,
    );
    assert.deepEqual(
      await query(db, 'SELECT * FROM users WHERE id=?', owner!.id).first(),
      owner,
    );
    const audits = JSON.stringify(
      (await client.execute('SELECT * FROM auditLogs')).rows,
    );
    for (const secret of [
      first,
      second,
      password,
      originalPassword,
      owner!.passwordHash,
    ])
      assert.ok(!audits.includes(String(secret)));
  } finally {
    client.close();
  }
});

void test('mail restriction is enforced before sending and production validates verified domain', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      data: [{ id: 'd', name: 'example.test', status: 'pending' }],
    });
  };
  try {
    const config: Config = {
      APP_URL: 'https://app.example.test',
      EMAIL_API_KEY: 'unit-test-placeholder',
      EMAIL_TEST_RECIPIENT: 'owner@example.test',
    };
    await assert.rejects(
      sendAccountMail(config, 'other@example.test', 'a'.repeat(64), 'activate'),
      /autorizado/,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      sendAccountMail(
        {
          ...config,
          EMAIL_TEST_MODE: 'false',
          EMAIL_FROM: 'PJ <invite@example.test>',
        },
        'other@example.test',
        'a'.repeat(64),
        'activate',
      ),
      /verificado/,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async (_url, options) => {
      calls++;
      const body = JSON.parse(options?.body as string);
      assert.equal(body.from, 'PJ Estoque <onboarding@resend.dev>');
      assert.deepEqual(body.to, ['owner@example.test']);
      return Response.json({ id: 'simulated-provider-id' });
    };
    assert.equal(
      await sendAccountMail(
        config,
        'owner@example.test',
        'a'.repeat(64),
        'activate',
      ),
      'simulated-provider-id',
    );
    globalThis.fetch = async () =>
      Response.json({ message: 'secret-provider-error' }, { status: 403 });
    await assert.rejects(
      sendAccountMail(config, 'owner@example.test', 'a'.repeat(64), 'activate'),
      (e) =>
        e instanceof Error &&
        !e.message.includes('secret-provider-error') &&
        /recusou/.test(e.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

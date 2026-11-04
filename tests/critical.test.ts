import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classify,
  suggested,
  validateTransfer,
  exportList,
  strongPassword,
  type State,
  type ShoppingItem,
} from '../lib/domain';
import { handle } from '../server/api';
import { testDatabase } from './database';
import { digest } from '../server/security';
import { downloadList } from '../server/export';
const password = () => `${crypto.randomUUID()}Aa1!`;
void test('admin creates and resets credentials without email; secrets stay private and collaborators are denied', async () => {
  const { db, sqlite } = testDatabase();
  let cookie = '',
    csrf = '';
  async function request(action?: string, data: Record<string, unknown> = {}) {
    const response = await handle(
      new Request('https://repor.test/api', {
        method: action ? 'POST' : 'GET',
        headers: {
          origin: 'https://repor.test',
          'content-type': 'application/json',
          cookie,
          'x-csrf-token': csrf,
        },
        body: action ? JSON.stringify({ action, ...data }) : undefined,
      }),
      db,
      {},
    );
    return {
      response,
      body: (await response.json()) as Record<string, unknown>,
    };
  }
  try {
    const initial = password();
    const setup = await request('setup', {
      name: 'Admin',
      email: 'owner@example.test',
      password: initial,
      confirm: initial,
    });
    cookie = setup.response.headers.get('set-cookie')!.split(';')[0];
    csrf = setup.body.csrf as string;
    const adminCookie = cookie,
      adminCsrf = csrf;
    for (const role of ['admin', 'collaborator']) {
      const secret = password();
      const data = {
        name: role,
        email: `${role}@example.test`,
        job: '',
        role,
        password: secret,
        confirm: secret,
      };
      assert.equal(
        (
          await request('user.create', {
            ...data,
            password: 'weak',
            confirm: 'weak',
          })
        ).response.status,
        400,
      );
      assert.equal(
        (await request('user.create', { ...data, confirm: 'mismatch' }))
          .response.status,
        400,
      );
      assert.equal((await request('user.create', data)).response.status, 200);
      const state = (await request()).body as unknown as State;
      const target = state.users.find((u) => u.email === data.email)!;
      const encoded = sqlite
        .prepare('SELECT passwordHash FROM users WHERE id=?')
        .get(target.id)!.passwordHash;
      assert.notEqual(encoded, secret);
      assert.equal(JSON.stringify(state).includes(secret), false);
      assert.equal(JSON.stringify(state).includes(String(encoded)), false);
      const edit = {
        ...target,
        active: true,
        canUpdateStock: true,
        password: '',
        confirm: '',
      };
      assert.equal((await request('user.update', edit)).response.status, 200);
      assert.equal(
        sqlite
          .prepare('SELECT passwordHash FROM users WHERE id=?')
          .get(target.id)!.passwordHash,
        encoded,
      );
      const login = await request('login', {
        email: data.email,
        password: secret,
      });
      assert.equal(login.response.status, 200);
      const targetCookie = login.response.headers
        .get('set-cookie')!
        .split(';')[0];
      if (role === 'collaborator') {
        cookie = targetCookie;
        csrf = login.body.csrf as string;
        assert.equal(
          (
            await request('user.create', {
              ...data,
              email: 'denied@example.test',
            })
          ).response.status,
          403,
        );
        assert.equal(
          (
            await request('user.update', {
              ...edit,
              password: secret,
              confirm: secret,
            })
          ).response.status,
          403,
        );
        assert.deepEqual(
          ((await request()).body as unknown as State).users,
          [],
        );
        cookie = adminCookie;
        csrf = adminCsrf;
      }
      // Also covers accounts previously saved without a password.
      sqlite
        .prepare('UPDATE users SET passwordHash=NULL WHERE id=?')
        .run(target.id);
      sqlite
        .prepare(
          'INSERT INTO passwordResetTokens (hash,userId,expiresAt,kind) VALUES (?,?,?,?)',
        )
        .run(await digest(secret), target.id, Date.now() + 60000, 'invite');
      const next = password();
      assert.equal(
        (
          await request('user.update', {
            ...edit,
            password: next,
            confirm: next,
          })
        ).response.status,
        200,
      );
      assert.equal(
        sqlite
          .prepare('SELECT COUNT(*) n FROM sessions WHERE userId=?')
          .get(target.id)!.n,
        0,
      );
      assert.equal(
        sqlite
          .prepare('SELECT COUNT(*) n FROM passwordResetTokens WHERE userId=?')
          .get(target.id)!.n,
        0,
      );
      assert.equal(
        (await request('login', { email: data.email, password: secret }))
          .response.status,
        401,
      );
      assert.equal(
        (await request('login', { email: data.email, password: next })).response
          .status,
        200,
      );
      const audits = JSON.stringify(
        sqlite.prepare('SELECT * FROM auditLogs').all(),
      );
      assert.equal(audits.includes(secret), false);
      assert.equal(audits.includes(next), false);
      assert.equal(audits.includes(String(encoded)), false);
    }
  } finally {
    sqlite.close();
  }
});
void test('classification boundaries, manual overrides and non-negative purchase suggestions', () => {
  const p = { quantity: 2, minimum: 2, ideal: 5, manualStatus: null };
  assert.equal(classify(p), 'critical');
  assert.equal(classify({ ...p, quantity: 2.001 }), 'warning');
  assert.equal(classify({ ...p, quantity: 5 }), 'ok');
  assert.equal(classify({ ...p, manualStatus: 'ok' }), 'ok');
  assert.equal(suggested(9, 3), 0);
  assert.equal(suggested(1.2, 3), 1.8);
});
void test('transfer validates every field, version, duplicates, finite numbers and whitelist export', () => {
  const data = {
    app: 'repor',
    version: 1,
    generatedAt: new Date().toISOString(),
    list: [
      {
        name: 'Teste',
        category: 'Outros',
        unit: 'kg',
        quantity: 4,
        current: 1,
        suggested: 4,
        note: '<script>literal</script>',
      },
    ],
  };
  assert.equal(validateTransfer(data).list[0].quantity, 4);
  for (const bad of [
    { ...data, version: 2 },
    { ...data, list: [...data.list, ...data.list] },
    { ...data, list: [{ ...data.list[0], quantity: -1 }] },
    { ...data, list: [{ ...data.list[0], quantity: Infinity }] },
    { ...data, list: [{ ...data.list[0], note: { code: 'evil' } }] },
  ])
    assert.throws(() => validateTransfer(bad));
  const result = exportList([
    {
      ...data.list[0],
      passwordHash: 'must-not-export',
      token: 'must-not-export',
      purchased: 0,
    } as unknown as ShoppingItem,
  ]);
  assert.equal('passwordHash' in result.list[0], false);
  assert.equal('token' in result.list[0], false);
  assert.equal(result.version, 1);
  assert.throws(() => strongPassword(crypto.randomUUID().slice(0, 3)));
  assert.doesNotThrow(() => strongPassword(password()));
});
void test('real backend: setup, CSRF, RBAC, audit, concurrency, shopping, imports, recovery and logout', async () => {
  const { db, sqlite } = testDatabase();
  const delivered: { to: string; link: string }[] = [];
  const config = {
    APP_URL: 'https://repor.test',
    sendMail: async (to: string, link: string) => {
      delivered.push({ to, link });
    },
  };
  let cookie = '',
    csrf = '';
  async function request(
    action?: string,
    data: Record<string, unknown> = {},
    extra: Record<string, string> = {},
  ) {
    const response = await handle(
      new Request('https://repor.test/api', {
        method: action ? 'POST' : 'GET',
        headers: {
          origin: 'https://repor.test',
          'content-type': 'application/json',
          cookie,
          'x-csrf-token': csrf,
          ...extra,
        },
        body: action ? JSON.stringify({ action, ...data }) : undefined,
      }),
      db,
      config,
    );
    const body = (await response.json()) as Record<string, unknown>;
    return { response, body };
  }
  assert.equal((await request()).body.setup, true);
  const adminPassword = password(),
    adminEmail = `${crypto.randomUUID()}@example.test`;
  let r = await request('setup', {
    name: 'Administrador de teste',
    email: adminEmail,
    password: adminPassword,
    confirm: adminPassword,
  });
  assert.equal(r.response.status, 200);
  cookie = r.response.headers.get('set-cookie')!.split(';')[0];
  csrf = r.body.csrf as string;
  assert.match(
    r.response.headers.get('set-cookie')!,
    /HttpOnly; SameSite=Strict.*Secure/,
  );
  assert.equal(
    (
      await request('setup', {
        name: 'Outro',
        email: 'another@example.test',
        password: password(),
      })
    ).response.status,
    409,
  );
  assert.equal(
    (await request('demo', {}, { 'x-csrf-token': 'invalid' })).response.status,
    403,
  );
  assert.equal(
    (await request('demo', {}, { origin: 'https://attacker.test' })).response
      .status,
    403,
  );
  assert.equal((await request('demo')).response.status, 200);
  let state = (await request()).body as unknown as State;
  assert.equal(state.products.length, 10);
  let p = state.products[0];
  assert.equal(
    (
      await request('stock.update', {
        id: p.id,
        revision: p.revision,
        quantity: -1,
        reason: 'contagem',
        note: '',
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await request('stock.update', {
        id: p.id,
        revision: p.revision,
        quantity: 7,
        reason: 'Conferência',
        note: 'Teste',
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await request('stock.update', {
        id: p.id,
        revision: p.revision,
        quantity: 8,
        reason: 'Conferência',
        note: '',
      })
    ).response.status,
    409,
  );
  const movement = sqlite
    .prepare('SELECT * FROM stockMovements WHERE productId=?')
    .get(p.id);
  assert.equal(movement?.before, p.quantity);
  assert.equal(movement?.after, 7);
  assert.equal((await request('shopping.suggest')).response.status, 200);
  state = (await request()).body as unknown as State;
  const list = state.lists.find((l) => l.status === 'open')!;
  assert.ok(list.items.length > 0);
  const item = list.items[0];
  p = state.products.find((p) => p.id === item.productId)!;
  const stockBefore = p.quantity;
  assert.equal(
    (
      await request('shopping.update', {
        id: item.id,
        revision: item.revision,
        quantity: 3,
        note: 'Receber depois',
        purchased: true,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await request('shopping.finish', {
        date: '2026-09-08',
        note: 'Teste de finalização',
      })
    ).response.status,
    200,
  );
  state = (await request()).body as unknown as State;
  assert.equal(
    state.products.find((p) => p.id === item.productId)!.quantity,
    stockBefore,
  );
  assert.equal(
    (await request('shopping.receive', { id: item.id })).response.status,
    200,
  );
  assert.equal(
    (await request('shopping.receive', { id: item.id })).response.status,
    409,
  );
  state = (await request()).body as unknown as State;
  assert.equal(
    state.products.find((p) => p.id === item.productId)!.quantity,
    stockBefore + 3,
  );
  const transfer = {
    app: 'repor',
    version: 1,
    generatedAt: new Date().toISOString(),
    list: [
      {
        name: "Produto ' <script>alert(1)</script>",
        category: 'Categoria importada',
        unit: 'kg',
        quantity: 4,
        current: 999,
        suggested: 4,
        note: 'Observação literal',
      },
    ],
  };
  assert.equal(
    (await request('import.preview', { file: transfer })).response.status,
    200,
  );
  assert.equal(
    (await request('import.commit', { file: transfer, policy: 'skip' }))
      .response.status,
    200,
  );
  state = (await request()).body as unknown as State;
  assert.equal(
    state.products.find((p) => p.name === transfer.list[0].name)!.quantity,
    0,
  );
  assert.equal(
    (await request('import.commit', { file: transfer, policy: 'skip' }))
      .response.status,
    200,
  );
  assert.equal(
    (
      await request('import.commit', {
        file: { ...transfer, list: [{ ...transfer.list[0], unit: 'litro' }] },
        policy: 'replace',
      })
    ).response.status,
    400,
  );
  r = await request('shopping.export');
  const download = await downloadList(
    new Request('https://repor.test/api/export', { headers: { cookie } }),
    db,
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition')!, /^attachment;/);
  assert.equal(((await download.json()) as { app: string }).app, 'repor');
  assert.equal(
    (await downloadList(new Request('https://repor.test/api/export'), db))
      .status,
    401,
  );
  assert.equal(r.body.app, 'repor');
  assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
  const userEmail = `${crypto.randomUUID()}@example.test`;
  assert.equal(
    (
      await request('user.invite', {
        name: 'Colaborador de teste',
        email: userEmail,
        job: 'Equipe',
        role: 'collaborator',
      })
    ).response.status,
    200,
  );
  assert.equal(delivered.length, 1);
  const inviteToken = new URL(delivered[0].link).hash.slice(7);
  const collaboratorPassword = password();
  assert.equal(
    (
      await request('reset', {
        token: inviteToken,
        password: collaboratorPassword,
        confirm: collaboratorPassword,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await request('reset', {
        token: inviteToken,
        password: collaboratorPassword,
        confirm: collaboratorPassword,
      })
    ).response.status,
    400,
  );
  const adminCookie = cookie,
    adminCsrf = csrf;
  r = await request('login', {
    email: userEmail,
    password: collaboratorPassword,
  });
  assert.equal(r.response.status, 200);
  cookie = r.response.headers.get('set-cookie')!.split(';')[0];
  csrf = r.body.csrf as string;
  for (const action of [
    'demo',
    'category.save',
    'product.save',
    'product.delete',
    'user.invite',
    'import.commit',
    'shopping.finish',
  ])
    assert.equal(
      (await request(action, { id: p.id })).response.status,
      403,
      action,
    );
  state = (await request()).body as unknown as State;
  assert.deepEqual(state.users, []);
  p = state.products[0];
  assert.equal(
    (
      await request('stock.update', {
        id: p.id,
        revision: p.revision,
        quantity: 8,
        reason: 'Conferência colaborador',
        note: 'feito pela equipe',
        userId: state.products[0].updatedBy,
      })
    ).response.status,
    200,
  );
  const last = sqlite
    .prepare('SELECT userId FROM stockMovements WHERE reason=?')
    .get('Conferência colaborador');
  assert.equal(last?.userId, state.user.id);
  const collaborator = state.user;
  cookie = adminCookie;
  csrf = adminCsrf;
  assert.equal(
    (
      await request('user.update', {
        ...collaborator,
        active: true,
        canUpdateStock: false,
      })
    ).response.status,
    200,
  );
  r = await request('login', {
    email: userEmail,
    password: collaboratorPassword,
  });
  cookie = r.response.headers.get('set-cookie')!.split(';')[0];
  csrf = r.body.csrf as string;
  state = (await request()).body as unknown as State;
  p = state.products[0];
  assert.equal(
    (
      await request('stock.update', {
        id: p.id,
        revision: p.revision,
        quantity: 9,
        reason: 'Sem permissão',
        note: '',
      })
    ).response.status,
    403,
  );
  const unknown = await request('forgot', { email: 'missing@example.test' });
  const known = await request('forgot', { email: userEmail });
  assert.deepEqual(known.body, unknown.body);
  const resetToken = new URL(delivered.at(-1)!.link).hash.slice(7);
  assert.ok(
    sqlite
      .prepare('SELECT hash FROM passwordResetTokens WHERE hash=?')
      .get(await digest(resetToken)),
  );
  assert.equal(
    sqlite
      .prepare('SELECT hash FROM passwordResetTokens WHERE hash=?')
      .get(resetToken),
    undefined,
  );
  const newPassword = password();
  assert.equal(
    (
      await request('reset', {
        token: resetToken,
        password: newPassword,
        confirm: newPassword,
      })
    ).response.status,
    200,
  );
  assert.equal((await request()).body.login, true);
  assert.equal(
    (
      await request('reset', {
        token: resetToken,
        password: newPassword,
        confirm: newPassword,
      })
    ).response.status,
    400,
  );
  r = await request('login', { email: userEmail, password: newPassword });
  cookie = r.response.headers.get('set-cookie')!.split(';')[0];
  csrf = r.body.csrf as string;
  assert.equal((await request('logout')).response.status, 200);
  assert.equal((await request()).body.login, true);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await request('login', { email: userEmail, password: password() }))
        .response.status,
      401,
    );
  assert.equal(
    (await request('login', { email: userEmail, password: newPassword }))
      .response.status,
    429,
  );
  sqlite
    .prepare('UPDATE limits SET until=0 WHERE key=?')
    .run(`login:${await digest(userEmail)}`);
  assert.equal(
    (await request('login', { email: userEmail, password: newPassword }))
      .response.status,
    200,
  );
  await request('forgot', { email: adminEmail });
  const expiredToken = new URL(delivered.at(-1)!.link).hash.slice(7);
  sqlite
    .prepare('UPDATE passwordResetTokens SET expiresAt=0 WHERE hash=?')
    .run(await digest(expiredToken));
  assert.equal(
    (
      await request('reset', {
        token: expiredToken,
        password: newPassword,
        confirm: newPassword,
      })
    ).response.status,
    400,
  );
  sqlite.close();
});

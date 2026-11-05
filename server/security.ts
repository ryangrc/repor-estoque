import { hash, compare } from 'bcryptjs';

import { ensure, type User } from '../lib/domain';

import { query, type Database } from './database';

import { mailConfigured, sendAccountMail, type Config } from './mail';

export { mailConfigured, type Config } from './mail';

export const publicUser =
  "id,name,email,role,active,job,phone,canUpdateStock,createdAt,CASE WHEN active=0 THEN 'blocked' WHEN passwordHash IS NULL THEN 'pending' ELSE 'active' END AS status";

export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),

    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}

export const passwordHash = (value: string) => hash(value, 12);

export const passwordMatches = (value: string, encoded: string) =>
  compare(value, encoded);

export async function throttle(
  db: Database,

  key: string,

  maximum: number,

  minutes = 15,
) {
  const time = Date.now();

  await query(
    db,
    'INSERT INTO limits (key,count,until) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END, until=CASE WHEN until<=? THEN ? ELSE until END',
    key,
    time + minutes * 60000,
    time,
    time,
    time + minutes * 60000,
  ).run();

  const row = await query(
    db,
    'SELECT count FROM limits WHERE key=?',
    key,
  ).first<{ count: number }>();

  ensure(
    row && row.count <= maximum,
    'Muitas tentativas. Aguarde 15 minutos ou recupere sua senha.',
    429,
  );
}

export async function authenticate(db: Database, req: Request) {
  const cookie = req.headers

    .get('cookie')

    ?.split(';')

    .map((v) => v.trim())

    .find((v) => v.startsWith('repor_session='))

    ?.slice(14);

  ensure(cookie, 'Entre para continuar.', 401);

  const session = await query(
    db,
    'SELECT userId,csrf FROM sessions WHERE hash=? AND expiresAt>?',
    await digest(cookie),
    Date.now(),
  ).first<{ userId: string; csrf: string }>();

  ensure(session, 'Sua sessão expirou. Entre novamente.', 401);

  const user = await query(
    db,
    `SELECT ${publicUser} FROM users WHERE id=? AND active=1 AND passwordHash IS NOT NULL`,
    session.userId,
  ).first<User>();

  ensure(user, 'Entre para continuar.', 401);

  if (req.method !== 'GET')
    ensure(
      req.headers.get('x-csrf-token') === session.csrf,
      'Recarregue a página e tente novamente.',
      403,
    );

  return { user, csrf: session.csrf, hash: await digest(cookie) };
}

export async function newSession(
  db: Database,

  userId: string,

  secure: boolean,
) {
  const token = randomToken(),
    csrf = randomToken();

  await query(
    db,
    'INSERT INTO sessions (hash,userId,csrf,expiresAt) VALUES (?,?,?,?)',
    await digest(token),
    userId,
    csrf,
    Date.now() + 8 * 3600000,
  ).run();

  return {
    csrf,

    cookie: `repor_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure ? '; Secure' : ''}`,
  };
}

export async function issueToken(
  db: Database,
  config: Config,
  user: User,
  kind: string,
) {
  ensure(kind === 'reset', 'Use o fluxo de ativação para convites.');

  ensure(mailConfigured(config), 'Configure o serviço de e-mail.', 503);

  const token = randomToken(),
    tokenHash = await digest(token);

  await db.batch([
    query(db, 'DELETE FROM passwordResetTokens WHERE userId=?', user.id),

    query(
      db,
      'INSERT INTO passwordResetTokens (hash,userId,expiresAt,kind) VALUES (?,?,?,?)',
      tokenHash,
      user.id,
      Date.now() + 1800000,
      'reset',
    ),
  ]);

  try {
    await sendAccountMail(config, user.email, token, 'reset');
  } catch (error) {
    await query(
      db,
      'DELETE FROM passwordResetTokens WHERE hash=?',
      tokenHash,
    ).run();

    throw error;
  }
}

export async function cleanExpired(db: Database) {
  await db.batch([
    query(db, 'DELETE FROM sessions WHERE expiresAt<?', Date.now()),

    query(db, 'DELETE FROM passwordResetTokens WHERE expiresAt<?', Date.now()),

    query(
      db,
      'DELETE FROM limits WHERE until<? AND key<>?',
      Date.now(),
      'transaction-guard',
    ),
  ]);
}

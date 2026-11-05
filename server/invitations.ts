import { ensure, strongPassword, text, type User } from '../lib/domain';

import { audit, guard, now, query, type Database } from './database';

import { digest, passwordHash, randomToken, throttle } from './security';

import { sendAccountMail, type Config } from './mail';

export async function invite(db: Database, c: Config, user: User, actor: User) {
  ensure(
    user.active && user.status === 'pending',
    'Somente contas pendentes e desbloqueadas podem receber convites.',
    409,
  );

  await throttle(db, `invite:${user.id}`, 3);

  const token = randomToken(),
    hash = await digest(token);

  await db.batch([
    guard(
      db,
      'EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND passwordHash IS NULL AND email=?)',
      user.id,
      user.email,
    ),

    query(db, 'DELETE FROM invitations WHERE userId=?', user.id),

    query(
      db,
      'INSERT INTO invitations(hash,userId,createdBy,createdAt,expiresAt) VALUES (?,?,?,?,?)',
      hash,
      user.id,
      actor.id,
      now(),
      Date.now() + 86400000,
    ),

    audit(db, actor.id, 'Convite gerado', user.id),
  ]);

  try {
    const providerId = await sendAccountMail(c, user.email, token, 'activate');

    await db.batch([
      query(
        db,
        "UPDATE invitations SET delivery='accepted',providerId=? WHERE hash=?",
        providerId,
        hash,
      ),

      audit(db, actor.id, 'Convite aceito pelo serviço de e-mail', user.id),
    ]);

    return {
      ok: true,
      message:
        'Conta pendente. Convite aceito pelo serviço de e-mail; confira a caixa de entrada.',
    };
  } catch (error) {
    await db.batch([
      query(
        db,
        "UPDATE invitations SET delivery='failed',expiresAt=0 WHERE hash=?",
        hash,
      ),

      audit(db, actor.id, 'Falha no envio de convite', user.id),
    ]);

    // Never expose provider response bodies, API keys or invitation tokens.

    const { AppError } = await import('../lib/domain');

    return {
      ok: true,
      message: `Conta pendente de ativação. ${error instanceof AppError ? error.message : 'Falha no envio. Tente reenviar.'}`,
    };
  }
}

export async function activation(
  db: Database,
  action: string,
  b: Record<string, unknown>,
) {
  const token = text(b.token, 'Convite', 64);

  ensure(
    /^[a-f0-9]{64}$/.test(token),
    'Convite inválido ou expirado. Solicite um novo.',
  );

  const hash = await digest(token);

  const condition =
    "EXISTS(SELECT 1 FROM invitations i JOIN users u ON u.id=i.userId WHERE i.hash=? AND i.usedAt IS NULL AND i.expiresAt>? AND i.delivery='accepted' AND u.active=1 AND u.passwordHash IS NULL)";

  const row = await query(
    db,
    `SELECT userId FROM invitations WHERE hash=? AND ${condition}`,
    hash,
    hash,
    Date.now(),
  ).first<{ userId: string }>();

  ensure(
    row,
    'Convite inválido, expirado ou já utilizado. Solicite um novo.',
    400,
  );

  if (action === 'activation.check') return { body: { ok: true } };

  const password = strongPassword(b.password);

  ensure(password === b.confirm, 'As senhas não coincidem.');

  const encoded = await passwordHash(password);

  await db.batch([
    guard(db, condition, hash, Date.now()),

    query(
      db,
      'UPDATE users SET passwordHash=? WHERE id=?',
      encoded,
      row.userId,
    ),

    query(db, 'UPDATE invitations SET usedAt=? WHERE hash=?', now(), hash),

    query(db, 'DELETE FROM passwordResetTokens WHERE userId=?', row.userId),

    query(db, 'DELETE FROM sessions WHERE userId=?', row.userId),

    audit(db, row.userId, 'Conta ativada', 'Conta'),
  ]);

  return {
    body: {
      message: 'Conta ativada. Entre com seu e-mail e a senha que você criou.',
    },
  };
}

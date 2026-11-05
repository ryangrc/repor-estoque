import { admin, email, ensure, text, type User } from '../lib/domain';

import { audit, guard, id, now, query, type Database } from './database';

import { publicUser, type Config } from './security';

import { invite } from './invitations';

export async function usersAction(
  db: Database,
  c: Config,
  user: User,
  action: string,
  b: Record<string, unknown>,
) {
  if (!action.startsWith('user.')) return false;

  admin(user);

  ensure(
    ['user.create', 'user.invite', 'user.update', 'user.resend'].includes(
      action,
    ),
    'Ação inválida.',
  );

  ensure(
    !b.password && !b.confirm,
    'A senha deve ser definida pelo próprio usuário no convite.',
  );

  if (action === 'user.create' || action === 'user.invite') {
    const name = text(b.name, 'Nome completo', 100),
      address = email(b.email),
      phone = text(b.phone, 'Telefone', 30);

    ensure(/^[+()\d\s.-]{7,30}$/.test(phone), 'Informe um telefone válido.');

    ensure(b.role === 'admin' || b.role === 'collaborator', 'Perfil inválido.');

    const uid = id();

    await db.batch([
      query(
        db,
        'INSERT INTO users(id,name,email,phone,role,job,createdAt) VALUES (?,?,?,?,?,?,?)',
        uid,
        name,
        address,
        phone,
        b.role,
        text(b.job ?? '', 'Cargo', 100, true),
        now(),
      ),

      audit(db, user.id, 'Conta pendente cadastrada', uid, null, {
        role: b.role,
      }),
    ]);

    const target = await query(
      db,
      `SELECT ${publicUser} FROM users WHERE id=?`,
      uid,
    ).first<User>();

    return invite(db, c, target!, user);
  }

  const target = await query(
    db,
    `SELECT ${publicUser} FROM users WHERE id=?`,
    text(b.id, 'Usuário'),
  ).first<User>();

  ensure(target, 'Usuário não encontrado.', 404);

  if (action === 'user.resend') return invite(db, c, target, user);

  ensure(target.id !== user.id, 'Altere sua própria conta em Configurações.');

  ensure(b.role === 'admin' || b.role === 'collaborator', 'Perfil inválido.');

  ensure(
    typeof b.active === 'boolean' && typeof b.canUpdateStock === 'boolean',
    'Permissões inválidas.',
  );

  const name = text(b.name, 'Nome', 100),
    phone = text(b.phone ?? target.phone, 'Telefone', 30, true),
    job = text(b.job ?? '', 'Cargo', 100, true);

  // An administrator cannot take over an activated account by changing its email.

  ensure(
    email(b.email) === target.email,
    'O e-mail de acesso não pode ser alterado nesta tela.',
  );

  await db.batch([
    query(
      db,
      'UPDATE users SET name=?,phone=?,job=?,role=?,active=?,canUpdateStock=? WHERE id=?',
      name,
      phone,
      job,
      b.role,
      b.active ? 1 : 0,
      b.canUpdateStock ? 1 : 0,
      target.id,
    ),

    guard(
      db,
      "EXISTS(SELECT 1 FROM users WHERE role='admin' AND active=1 AND passwordHash IS NOT NULL)",
    ),

    query(db, 'DELETE FROM sessions WHERE userId=?', target.id),

    query(db, 'DELETE FROM passwordResetTokens WHERE userId=?', target.id),

    query(
      db,
      'UPDATE invitations SET expiresAt=0 WHERE userId=? AND usedAt IS NULL',
      target.id,
    ),

    audit(
      db,
      user.id,
      'Acesso do usuário atualizado',
      target.id,
      { role: target.role, active: target.active },
      { role: b.role, active: b.active },
    ),
  ]);

  return {
    ok: true,
    message: 'Usuário atualizado. Se estava pendente, reenvie o convite.',
  };
}

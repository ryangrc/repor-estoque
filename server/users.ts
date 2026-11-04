import {
  admin,
  email,
  ensure,
  strongPassword,
  text,
  type User,
} from '../lib/domain';
import { audit, guard, id, now, query, type Database } from './database';
import {
  issueToken,
  mailConfigured,
  publicUser,
  passwordHash,
  digest,
  type Config,
} from './security';
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
  if (action === 'user.invite' || action === 'user.create') {
    const direct = action === 'user.create';
    let encoded: string | null = null;
    if (direct) {
      const password = strongPassword(b.password);
      ensure(password === b.confirm, 'As senhas não coincidem.');
      encoded = await passwordHash(password);
    } else
      ensure(
        mailConfigured(c),
        'Configure o serviço de e-mail antes de convidar usuários.',
        503,
      );
    const address = email(b.email),
      name = text(b.name, 'Nome', 100),
      job = text(b.job, 'Cargo', 100, true);
    ensure(b.role === 'admin' || b.role === 'collaborator', 'Função inválida.');
    const uid = id();
    await db.batch([
      query(
        db,
        'INSERT INTO users (id,name,email,role,job,createdAt,passwordHash) VALUES (?,?,?,?,?,?,?)',
        uid,
        name,
        address,
        b.role,
        job,
        now(),
        encoded,
      ),
      audit(
        db,
        user.id,
        direct ? 'Usuário criado' : 'Usuário convidado',
        name,
        null,
        { role: b.role },
      ),
    ]);
    if (direct) return true;
    const invited = await query(
      db,
      `SELECT ${publicUser} FROM users WHERE id=?`,
      uid,
    ).first<User>();
    await issueToken(db, c, invited!, 'invite');
    return true;
  }
  const target = await query(
    db,
    `SELECT ${publicUser} FROM users WHERE id=?`,
    text(b.id, 'Usuário'),
  ).first<User>();
  ensure(target, 'Usuário não encontrado.', 404);
  if (action === 'user.resend') {
    ensure(target.active, 'Reative a conta antes de convidar.');
    await issueToken(db, c, target, 'invite');
    await audit(db, user.id, 'Convite reenviado', target.name).run();
    return true;
  }
  ensure(target.id !== user.id, 'Altere sua própria conta em Configurações.');
  ensure(b.role === 'admin' || b.role === 'collaborator', 'Função inválida.');
  ensure(
    typeof b.active === 'boolean' && typeof b.canUpdateStock === 'boolean',
    'Permissões inválidas.',
  );
  const name = text(b.name, 'Nome', 100),
    address = email(b.email),
    job = text(b.job, 'Cargo', 100, true);
  let encoded: string | null = null;
  if (b.password !== undefined && b.password !== '') {
    const password = strongPassword(b.password);
    ensure(password === b.confirm, 'As senhas não coincidem.');
    encoded = await passwordHash(password);
  } else ensure(!b.confirm, 'Preencha a nova senha.');
  await db.batch([
    query(
      db,
      'UPDATE users SET name=?,email=?,job=?,role=?,active=?,canUpdateStock=?,passwordHash=COALESCE(?,passwordHash) WHERE id=?',
      name,
      address,
      job,
      b.role,
      b.active ? 1 : 0,
      b.canUpdateStock ? 1 : 0,
      encoded,
      target.id,
    ),
    guard(db, "EXISTS(SELECT 1 FROM users WHERE role='admin' AND active=1)"),
    query(db, 'DELETE FROM sessions WHERE userId=?', target.id),
    query(db, 'DELETE FROM passwordResetTokens WHERE userId=?', target.id),
    ...(encoded
      ? [
          query(
            db,
            'DELETE FROM limits WHERE key IN (?,?)',
            `login:${await digest(target.email)}`,
            `login:${await digest(address)}`,
          ),
          audit(
            db,
            user.id,
            'Senha redefinida pelo administrador',
            target.name,
          ),
        ]
      : []),
    audit(db, user.id, 'Usuário atualizado', target.name, target, {
      name,
      email: address,
      job,
      role: b.role,
      active: b.active,
      canUpdateStock: b.canUpdateStock,
    }),
  ]);
  return true;
}

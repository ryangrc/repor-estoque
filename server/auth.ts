import { activation } from './invitations';
import { email, strongPassword, text, ensure, type User } from '../lib/domain';
import { audit, guard, id, now, query, type Database } from './database';
import {
  digest,
  issueToken,
  mailConfigured,
  newSession,
  passwordHash,
  passwordMatches,
  publicUser,
  throttle,
  type Config,
} from './security';
export async function authAction(
  db: Database,
  config: Config,
  req: Request,
  action: string,
  b: Record<string, unknown>,
) {
  const secure = new URL(req.url).protocol === 'https:';
  const ip = await digest(req.headers.get('cf-connecting-ip') || 'local');
  await throttle(db, `auth:${ip}`, 60);
  if (action === 'activate' || action === 'activation.check')
    return activation(db, action, b);
  if (action === 'setup') {
    ensure(
      !(await query(db, 'SELECT id FROM setup LIMIT 1').first()),
      'A configuração inicial já foi concluída.',
      409,
    );
    const name = text(b.name, 'Nome', 100),
      address = email(b.email),
      password = strongPassword(b.password);
    ensure(password === b.confirm, 'As senhas não coincidem.');
    const userId = id(),
      encoded = await passwordHash(password);
    await db.batch([
      query(db, "INSERT OR IGNORE INTO roles (name) VALUES ('admin')"),
      query(db, "INSERT OR IGNORE INTO roles (name) VALUES ('collaborator')"),
      query(
        db,
        "INSERT INTO users (id,name,email,passwordHash,role,createdAt) VALUES (?,?,?,?,'admin',?)",
        userId,
        name,
        address,
        encoded,
        now(),
      ),
      query(db, 'INSERT INTO setup (id,userId) VALUES (1,?)', userId),
      ...[
        'Embalagens',
        'Insumos',
        'Ingredientes',
        'Limpeza',
        'Organização',
        'Bebidas',
        'Outros',
      ].map((name) =>
        query(db, 'INSERT INTO categories (id,name) VALUES (?,?)', id(), name),
      ),
      query(
        db,
        "INSERT INTO shoppingLists (id,status,createdAt) VALUES (?,'open',?)",
        id(),
        now(),
      ),
      audit(db, userId, 'Configuração inicial', name),
    ]);
    const session = await newSession(db, userId, secure);
    return { body: { ok: true, csrf: session.csrf }, cookie: session.cookie };
  }
  if (action === 'login') {
    const address = email(b.email);
    ensure(
      typeof b.password === 'string' && b.password.length <= 200,
      'E-mail ou senha inválidos.',
      401,
    );
    const key = `login:${await digest(address)}`;
    // Count before verification, so concurrent guesses cannot bypass the five-attempt limit.
    await throttle(db, key, 5);
    const user = await query(
      db,
      'SELECT * FROM users WHERE email=? AND active=1 AND passwordHash IS NOT NULL',
      address,
    ).first<User & { passwordHash: string }>();
    const dummy = await passwordHash('a' + ip + 'Z!');
    const valid = await passwordMatches(
      b.password,
      user?.passwordHash || dummy,
    );
    if (!user?.passwordHash || !valid) {
      await audit(
        db,
        user?.id || null,
        'Tentativa de login inválida',
        'Autenticação',
      ).run();
      ensure(
        false,
        'E-mail ou senha inválidos. Você pode recuperar sua senha.',
        401,
      );
    }
    await query(db, 'DELETE FROM limits WHERE key=?', key).run();
    const session = await newSession(db, user.id, secure);
    return { body: { ok: true, csrf: session.csrf }, cookie: session.cookie };
  }
  if (action === 'forgot') {
    const address = email(b.email);
    await throttle(db, `reset:${await digest(address)}`, 3);
    const user = await query(
      db,
      `SELECT ${publicUser} FROM users WHERE email=? AND active=1 AND passwordHash IS NOT NULL`,
      address,
    ).first<User>();
    if (user && mailConfigured(config)) {
      try {
        await issueToken(db, config, user, 'reset');
      } catch {
        await audit(db, null, 'Falha no envio de recuperação', 'E-mail').run();
      }
    }
    return {
      body: {
        message:
          'Se houver uma conta associada a esse e-mail, enviaremos as instruções de recuperação.',
      },
    };
  }
  if (action === 'reset') {
    const password = strongPassword(b.password);
    ensure(password === b.confirm, 'As senhas não coincidem.');
    const token = text(b.token, 'Token', 64);
    const tokenHash = await digest(token);
    const row = await query(
      db,
      `SELECT t.userId,u.email FROM passwordResetTokens t JOIN users u ON u.id=t.userId WHERE t.hash=? AND t.expiresAt>? AND t.kind='reset' AND u.active=1 AND u.passwordHash IS NOT NULL`,
      tokenHash,
      Date.now(),
    ).first<{ userId: string; email: string }>();
    ensure(row, 'Link inválido ou expirado. Solicite um novo.', 400);
    const encoded = await passwordHash(password);
    await db.batch([
      guard(
        db,
        `EXISTS(SELECT 1 FROM passwordResetTokens t JOIN users u ON u.id=t.userId WHERE t.hash=? AND t.expiresAt>? AND t.kind='reset' AND u.active=1 AND u.passwordHash IS NOT NULL)`,
        tokenHash,
        Date.now(),
      ),
      query(
        db,
        'UPDATE users SET passwordHash=? WHERE id=?',
        encoded,
        row.userId,
      ),
      query(db, 'DELETE FROM passwordResetTokens WHERE userId=?', row.userId),
      query(db, 'DELETE FROM sessions WHERE userId=?', row.userId),
      query(
        db,
        'DELETE FROM limits WHERE key=?',
        `login:${await digest(row.email)}`,
      ),
      audit(db, row.userId, 'Senha redefinida', 'Conta'),
    ]);
    return { body: { message: 'Senha redefinida. Entre com a nova senha.' } };
  }
  return null;
}

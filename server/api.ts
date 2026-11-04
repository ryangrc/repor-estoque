import { AppError, ensure, object, text, type Product } from '../lib/domain';
import { all, audit, query, type Database } from './database';
import {
  authenticate,
  mailConfigured,
  publicUser,
  type Config,
} from './security';
import { authAction } from './auth';
import { inventoryAction } from './inventory';
import { listItems, shoppingAction } from './shopping';
import { usersAction } from './users';
export async function handle(req: Request, db: Database, c: Config) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  try {
    if (req.method === 'GET') {
      const initialized = !!(await query(
        db,
        'SELECT id FROM setup LIMIT 1',
      ).first());
      if (!initialized) return respond({ setup: true });
      let auth;
      try {
        auth = await authenticate(db, req);
      } catch (error) {
        if (error instanceof AppError && error.status === 401)
          return respond({ login: true });
        throw error;
      }
      const products = await all<Product>(
        db,
        'SELECT p.*,c.name category,u.name updater FROM products p JOIN categories c ON c.id=p.categoryId JOIN users u ON u.id=p.updatedBy WHERE p.active=1 ORDER BY p.name',
      );
      const lists = await all<{ id: string }>(
        db,
        'SELECT l.*,u.name responsible FROM shoppingLists l LEFT JOIN users u ON u.id=l.finalizedBy ORDER BY l.createdAt DESC',
      );
      return respond({
        csrf: auth.csrf,
        user: auth.user,
        products,
        categories: await all(
          db,
          'SELECT id,name FROM categories WHERE active=1 ORDER BY name',
        ),
        lists: await Promise.all(
          lists.map(async (l) => ({ ...l, items: await listItems(db, l.id) })),
        ),
        audits: await all(
          db,
          "SELECT a.*,COALESCE(u.name,'Sistema') userName FROM auditLogs a LEFT JOIN users u ON u.id=a.userId ORDER BY a.createdAt DESC LIMIT 200",
        ),
        users:
          auth.user.role === 'admin'
            ? await all(db, `SELECT ${publicUser} FROM users ORDER BY name`)
            : [],
        emailConfigured: auth.user.role === 'admin' ? mailConfigured(c) : false,
      });
    }
    ensure(req.method === 'POST', 'Método não permitido.', 405);
    const origin = new URL(req.url).origin;
    ensure(req.headers.get('origin') === origin, 'Origem não autorizada.', 403);
    ensure(
      req.headers.get('content-type')?.startsWith('application/json'),
      'Use JSON.',
      415,
    );
    ensure(
      Number(req.headers.get('content-length') || 0) <= 512000,
      'Arquivo muito grande.',
      413,
    );
    const raw = await boundedBody(req);
    let decoded;
    try {
      decoded = JSON.parse(raw);
    } catch {
      throw new AppError(400, 'JSON inválido.');
    }
    const b = object(decoded);
    const action = text(b.action, 'Ação', 60);
    if (['setup', 'login', 'forgot', 'reset'].includes(action)) {
      const result = await authAction(db, c, req, action, b);
      if (result) {
        if (result.cookie) headers['Set-Cookie'] = result.cookie;
        return respond(result.body);
      }
    }
    const { user, hash } = await authenticate(db, req);
    if (action === 'logout') {
      await query(db, 'DELETE FROM sessions WHERE hash=?', hash).run();
      headers['Set-Cookie'] =
        'repor_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
      return respond({ ok: true });
    }
    if (action === 'profile') {
      const name = text(b.name, 'Nome', 100);
      await db.batch([
        query(db, 'UPDATE users SET name=? WHERE id=?', name, user.id),
        audit(
          db,
          user.id,
          'Perfil atualizado',
          user.name,
          { name: user.name },
          { name },
        ),
      ]);
      return respond({ ok: true });
    }
    if (await inventoryAction(db, user, action, b))
      return respond({ ok: true });
    const shopping = await shoppingAction(db, user, action, b);
    if (shopping) return respond(shopping);
    if (await usersAction(db, c, user, action, b)) return respond({ ok: true });
    throw new AppError(404, 'Ação não encontrada.');
  } catch (error) {
    if (error instanceof AppError)
      return respond({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE|NOT NULL|constraint/i.test(message))
      return respond(
        {
          error:
            'Os dados já existem ou foram alterados por outra pessoa. Recarregue e confira antes de salvar.',
        },
        409,
      );
    return respond({ error: 'Não foi possível concluir esta operação.' }, 500);
  }
}

async function boundedBody(req: Request) {
  ensure(req.body, 'Corpo JSON obrigatório.');
  const reader = req.body.getReader(),
    decoder = new TextDecoder();
  let total = 0,
    raw = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 512000) {
        await reader.cancel();
        throw new AppError(413, 'Arquivo muito grande.');
      }
      raw += decoder.decode(value, { stream: true });
    }
    return raw + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

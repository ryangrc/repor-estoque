import {
  admin,
  ensure,
  text,
  number,
  suggested,
  classify,
  validateTransfer,
  exportList,
  type User,
  type ShoppingItem,
  type Product,
  type Transfer,
} from '../lib/domain';
import {
  all,
  audit,
  guard,
  id,
  now,
  query,
  type Database,
  type Statement,
} from './database';
import { findProduct, movement } from './inventory';
export async function openList(db: Database) {
  const row = await query(
    db,
    "SELECT id FROM shoppingLists WHERE status='open'",
  ).first<{ id: string }>();
  ensure(row, 'Lista aberta não encontrada.', 409);
  return row.id;
}
export async function listItems(db: Database, listId: string) {
  return all<ShoppingItem>(
    db,
    'SELECT i.*,p.name,c.name category,p.unit,p.quantity current,MAX(0,p.ideal-p.quantity) suggested,u.name addedBy FROM shoppingListItems i JOIN products p ON p.id=i.productId JOIN categories c ON c.id=p.categoryId JOIN users u ON u.id=i.addedBy WHERE i.listId=? ORDER BY c.name,p.name',
    listId,
  );
}
export async function importPreview(db: Database, transfer: Transfer) {
  const products = await all<Product>(db, 'SELECT * FROM products');
  const existing = await listItems(db, await openList(db));
  return transfer.list.map((item) => {
    const product = products.find(
      (p) =>
        p.name.toLocaleLowerCase('pt-BR') ===
        item.name.toLocaleLowerCase('pt-BR'),
    );
    return {
      ...item,
      productId: product?.id,
      status: !product
        ? 'new'
        : !product.active
          ? 'inactive'
          : product.unit !== item.unit
            ? 'unit-conflict'
            : existing.some((i) => i.productId === product.id)
              ? 'conflict'
              : 'existing',
    };
  });
}
export async function shoppingAction(
  db: Database,
  user: User,
  action: string,
  b: Record<string, unknown>,
) {
  if (!action.startsWith('shopping.') && !action.startsWith('import.'))
    return null;
  const listId = await openList(db);
  if (action === 'shopping.add') {
    const p = await findProduct(db, b.productId);
    const quantity = number(b.quantity, 'Compra');
    ensure(quantity > 0, 'A quantidade de compra deve ser positiva.');
    await db.batch([
      guard(
        db,
        "EXISTS(SELECT 1 FROM shoppingLists WHERE id=? AND status='open')",
        listId,
      ),
      query(
        db,
        'INSERT INTO shoppingListItems (id,listId,productId,quantity,note,addedBy,addedAt) VALUES (?,?,?,?,?,?,?)',
        id(),
        listId,
        p.id,
        quantity,
        text(b.note, 'Observação', 1000, true),
        user.id,
        now(),
      ),
      audit(db, user.id, 'Item adicionado à lista', p.name, null, { quantity }),
    ]);
    return { ok: true };
  }
  if (action === 'shopping.suggest') {
    const products = await all<Product>(
      db,
      'SELECT * FROM products WHERE active=1',
    );
    const existing = await listItems(db, listId);
    const selected = products.filter(
      (p) =>
        (classify(p) === 'critical' || p.flagged) &&
        !existing.some((i) => i.productId === p.id),
    );
    await db.batch([
      guard(
        db,
        "EXISTS(SELECT 1 FROM shoppingLists WHERE id=? AND status='open')",
        listId,
      ),
      ...selected.map((p) =>
        query(
          db,
          'INSERT OR IGNORE INTO shoppingListItems (id,listId,productId,quantity,note,addedBy,addedAt) VALUES (?,?,?,?,?,?,?)',
          id(),
          listId,
          p.id,
          Math.max(suggested(p.quantity, p.ideal), 1),
          p.note,
          user.id,
          now(),
        ),
      ),
      audit(db, user.id, 'Reposição sugerida', 'Lista de compras', null, {
        items: selected.length,
      }),
    ]);
    return { ok: true };
  }
  if (action === 'shopping.export') {
    return exportList(await listItems(db, listId));
  }
  if (action === 'import.preview') {
    admin(user);
    const transfer = validateTransfer(b.file);
    return { items: await importPreview(db, transfer) };
  }
  if (action === 'import.commit') {
    admin(user);
    const transfer = validateTransfer(b.file);
    ensure(
      b.policy === 'skip' || b.policy === 'replace',
      'Escolha como tratar conflitos.',
    );
    const preview = await importPreview(db, transfer);
    ensure(
      !preview.some(
        (i) => i.status === 'unit-conflict' || i.status === 'inactive',
      ),
      'Há unidades incompatíveis ou produtos arquivados. Corrija o cadastro ou o arquivo.',
    );
    const statements: Statement[] = [
      guard(
        db,
        "EXISTS(SELECT 1 FROM shoppingLists WHERE id=? AND status='open')",
        listId,
      ),
    ];
    const cats = await all<{ id: string; name: string; active: number }>(
      db,
      'SELECT * FROM categories',
    );
    for (const item of preview) {
      if (item.status === 'conflict' && b.policy === 'skip') continue;
      let productId = item.productId;
      if (!productId) {
        let cat = cats.find(
          (c) =>
            c.name.toLocaleLowerCase('pt-BR') ===
            item.category.toLocaleLowerCase('pt-BR'),
        );
        ensure(!cat || cat.active, 'Categoria do arquivo está arquivada.');
        if (!cat) {
          cat = { id: id(), name: item.category, active: 1 };
          cats.push(cat);
          statements.push(
            query(
              db,
              'INSERT INTO categories (id,name) VALUES (?,?)',
              cat.id,
              cat.name,
            ),
          );
        }
        productId = id();
        statements.push(
          query(
            db,
            'INSERT INTO products (id,name,categoryId,quantity,minimum,ideal,unit,note,createdAt,updatedAt,updatedBy) VALUES (?,?,?,0,0,?,?,?,?,?,?)',
            productId,
            item.name,
            cat.id,
            item.quantity,
            item.unit,
            item.note,
            now(),
            now(),
            user.id,
          ),
        );
      }
      if (item.status === 'conflict') {
        const previous = await query(
          db,
          'SELECT id,revision,quantity,note FROM shoppingListItems WHERE listId=? AND productId=?',
          listId,
          productId,
        ).first<{
          id: string;
          revision: number;
          quantity: number;
          note: string;
        }>();
        ensure(previous, 'A lista mudou. Refaça a prévia.', 409);
        statements.push(
          guard(
            db,
            'EXISTS(SELECT 1 FROM shoppingListItems WHERE id=? AND revision=?)',
            previous.id,
            previous.revision,
          ),
          query(
            db,
            'UPDATE shoppingListItems SET quantity=?,note=?,purchased=0,revision=revision+1 WHERE id=?',
            item.quantity,
            item.note,
            previous.id,
          ),
          audit(
            db,
            user.id,
            'Conflito de importação resolvido',
            item.name,
            previous,
            { quantity: item.quantity, note: item.note },
          ),
        );
      } else
        statements.push(
          query(
            db,
            'INSERT INTO shoppingListItems (id,listId,productId,quantity,note,addedBy,addedAt) VALUES (?,?,?,?,?,?,?)',
            id(),
            listId,
            productId,
            item.quantity,
            item.note,
            user.id,
            now(),
          ),
        );
    }
    statements.push(
      audit(db, user.id, 'Lista importada', 'Lista de compras', null, {
        items: preview.length,
        policy: b.policy,
      }),
    );
    await db.batch(statements);
    return { ok: true };
  }
  if (action === 'shopping.finish') {
    admin(user);
    const items = await listItems(db, listId);
    ensure(
      items.some((i) => i.purchased),
      'Marque pelo menos um item como comprado.',
    );
    const date = text(b.date, 'Data', 30);
    ensure(
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)),
      'Data inválida.',
    );
    const newId = id();
    await db.batch([
      guard(
        db,
        "EXISTS(SELECT 1 FROM shoppingLists WHERE id=? AND status='open')",
        listId,
      ),
      query(
        db,
        "UPDATE shoppingLists SET status='completed',finalizedAt=?,finalizedBy=?,note=? WHERE id=?",
        date,
        user.id,
        text(b.note, 'Observação', 1000, true),
        listId,
      ),
      query(
        db,
        "INSERT INTO shoppingLists (id,status,createdAt) VALUES (?,'open',?)",
        newId,
        now(),
      ),
      query(
        db,
        'UPDATE shoppingListItems SET listId=? WHERE listId=? AND purchased=0',
        newId,
        listId,
      ),
      audit(db, user.id, 'Compra finalizada', listId, null, {
        date,
        items: items
          .filter((i) => i.purchased)
          .map((i) => ({ name: i.name, quantity: i.quantity })),
      }),
    ]);
    return { ok: true };
  }
  if (action === 'shopping.clear') {
    admin(user);
    await db.batch([
      query(
        db,
        'DELETE FROM shoppingListItems WHERE listId=? AND purchased=1',
        listId,
      ),
      audit(db, user.id, 'Itens comprados removidos', listId),
    ]);
    return { ok: true };
  }
  const item = await query(
    db,
    'SELECT * FROM shoppingListItems WHERE id=?',
    text(b.id, 'Item'),
  ).first<ShoppingItem & { listId: string }>();
  ensure(item, 'Item não encontrado.', 404);
  if (action === 'shopping.receive') {
    admin(user);
    ensure(
      item.purchased && !item.received,
      'Entrada já registrada ou item não comprado.',
      409,
    );
    ensure(
      await query(
        db,
        "SELECT id FROM shoppingLists WHERE id=? AND status='completed'",
        item.listId,
      ).first(),
      'Finalize a compra antes de registrar a entrada.',
    );
    const p = await findProduct(db, item.productId);
    const q = number(p.quantity + item.quantity, 'Novo estoque');
    await db.batch([
      guard(
        db,
        'EXISTS(SELECT 1 FROM shoppingListItems WHERE id=? AND received=0 AND purchased=1)',
        item.id,
      ),
      guard(
        db,
        'EXISTS(SELECT 1 FROM products WHERE id=? AND revision=?)',
        p.id,
        p.revision,
      ),
      ...movement(db, user, p, q, 'Entrada de compra', item.note),
      query(
        db,
        'UPDATE shoppingListItems SET received=1,revision=revision+1 WHERE id=?',
        item.id,
      ),
    ]);
    return { ok: true };
  }
  ensure(item.listId === listId, 'Esta compra já foi finalizada.', 409);
  ensure(
    item.revision === b.revision,
    'O item mudou. Recarregue antes de salvar.',
    409,
  );
  const checks = [
    guard(
      db,
      'EXISTS(SELECT 1 FROM shoppingListItems WHERE id=? AND revision=?)',
      item.id,
      item.revision,
    ),
    guard(
      db,
      "EXISTS(SELECT 1 FROM shoppingLists WHERE id=? AND status='open')",
      listId,
    ),
  ];
  if (action === 'shopping.remove')
    await db.batch([
      ...checks,
      query(db, 'DELETE FROM shoppingListItems WHERE id=?', item.id),
      audit(
        db,
        user.id,
        'Item removido da lista',
        item.productId,
        { quantity: item.quantity },
        null,
      ),
    ]);
  else if (action === 'shopping.update') {
    const quantity = number(b.quantity, 'Compra');
    ensure(quantity > 0, 'Informe uma quantidade positiva.');
    ensure(typeof b.purchased === 'boolean', 'Situação de compra inválida.');
    const note = text(b.note, 'Observação', 1000, true);
    await db.batch([
      ...checks,
      query(
        db,
        'UPDATE shoppingListItems SET quantity=?,note=?,purchased=?,revision=revision+1 WHERE id=?',
        quantity,
        note,
        b.purchased ? 1 : 0,
        item.id,
      ),
      audit(
        db,
        user.id,
        'Item de compra atualizado',
        item.productId,
        { quantity: item.quantity, note: item.note, purchased: item.purchased },
        { quantity, note, purchased: b.purchased },
      ),
    ]);
  } else ensure(false, 'Ação desconhecida.', 404);
  return { ok: true };
}

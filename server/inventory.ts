import {
  admin,
  ensure,
  text,
  number,
  stockPermission,
  type User,
  type Product,
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
export async function findProduct(db: Database, value: unknown) {
  const p = await query(
    db,
    'SELECT * FROM products WHERE id=? AND active=1',
    text(value, 'Produto'),
  ).first<Product>();
  ensure(p, 'Produto não encontrado.', 404);
  return p;
}
export function revision(db: Database, p: Product, supplied: unknown) {
  ensure(
    supplied === p.revision,
    'Este produto foi alterado. Recarregue antes de salvar.',
    409,
  );
  return guard(
    db,
    'EXISTS(SELECT 1 FROM products WHERE id=? AND revision=? AND active=1)',
    p.id,
    p.revision,
  );
}
export function movement(
  db: Database,
  user: User,
  p: Product,
  quantity: number,
  reason: string,
  note: string,
): Statement[] {
  return [
    query(
      db,
      'UPDATE products SET quantity=?,note=?,updatedAt=?,updatedBy=?,revision=revision+1 WHERE id=?',
      quantity,
      note,
      now(),
      user.id,
      p.id,
    ),
    query(
      db,
      'INSERT INTO stockMovements (id,productId,userId,before,after,difference,reason,note,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      id(),
      p.id,
      user.id,
      p.quantity,
      quantity,
      Math.round((quantity - p.quantity) * 1000) / 1000,
      reason,
      note,
      now(),
    ),
    audit(
      db,
      user.id,
      reason,
      p.name,
      { quantity: p.quantity, unit: p.unit },
      { quantity, unit: p.unit },
      note,
    ),
  ];
}
export async function inventoryAction(
  db: Database,
  user: User,
  action: string,
  b: Record<string, unknown>,
) {
  if (action === 'product.save') {
    admin(user);
    const old = b.id ? await findProduct(db, b.id) : null;
    const name = text(b.name, 'Nome', 120),
      categoryId = text(b.categoryId, 'Categoria'),
      description = text(b.description, 'Descrição', 1000, true),
      note = text(b.note, 'Observação', 1000, true),
      unit = text(b.unit, 'Unidade', 30);
    const quantity = number(b.quantity, 'Quantidade'),
      minimum = number(b.minimum, 'Mínimo'),
      ideal = number(b.ideal, 'Ideal');
    ensure(
      ideal >= minimum,
      'O estoque ideal deve ser maior ou igual ao mínimo.',
    );
    ensure(
      await query(
        db,
        'SELECT id FROM categories WHERE id=? AND active=1',
        categoryId,
      ).first(),
      'Categoria inválida.',
    );
    const status = b.manualStatus || null;
    ensure(
      status === null ||
        (typeof status === 'string' &&
          ['critical', 'warning', 'ok'].includes(status)),
      'Classificação inválida.',
    );
    if (old)
      await db.batch([
        revision(db, old, b.revision),
        ...movement(db, user, old, quantity, 'Produto editado', note),
        query(
          db,
          'UPDATE products SET name=?,categoryId=?,description=?,minimum=?,ideal=?,unit=?,manualStatus=? WHERE id=?',
          name,
          categoryId,
          description,
          minimum,
          ideal,
          unit,
          status,
          old.id,
        ),
        audit(
          db,
          user.id,
          'Configuração do produto alterada',
          name,
          {
            name: old.name,
            minimum: old.minimum,
            ideal: old.ideal,
            manualStatus: old.manualStatus,
            unit: old.unit,
            categoryId: old.categoryId,
          },
          { name, minimum, ideal, manualStatus: status, unit, categoryId },
        ),
      ]);
    else
      await db.batch([
        query(
          db,
          'INSERT INTO products (id,name,categoryId,description,quantity,minimum,ideal,unit,manualStatus,note,createdAt,updatedAt,updatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          id(),
          name,
          categoryId,
          description,
          quantity,
          minimum,
          ideal,
          unit,
          status,
          note,
          now(),
          now(),
          user.id,
        ),
        audit(db, user.id, 'Produto criado', name, null, {
          quantity,
          minimum,
          ideal,
          unit,
        }),
      ]);
    return true;
  }
  if (action === 'stock.update') {
    stockPermission(user);
    const p = await findProduct(db, b.id);
    const quantity = number(b.quantity, 'Quantidade');
    const reason = text(b.reason, 'Motivo', 150),
      note = text(b.note, 'Observação', 1000, true);
    await db.batch([
      revision(db, p, b.revision),
      ...movement(db, user, p, quantity, reason, note),
    ]);
    return true;
  }
  if (action === 'product.flag') {
    const p = await findProduct(db, b.id);
    const note = text(b.note, 'Observação', 1000, true);
    ensure(typeof b.flagged === 'boolean', 'Sinalização inválida.');
    await db.batch([
      revision(db, p, b.revision),
      query(
        db,
        'UPDATE products SET flagged=?,note=?,updatedAt=?,updatedBy=?,revision=revision+1 WHERE id=?',
        b.flagged ? 1 : 0,
        note,
        now(),
        user.id,
        p.id,
      ),
      audit(
        db,
        user.id,
        'Sinalização de compra',
        p.name,
        { flagged: p.flagged },
        { flagged: b.flagged },
        note,
      ),
    ]);
    return true;
  }
  if (action === 'product.delete') {
    admin(user);
    const p = await findProduct(db, b.id);
    ensure(
      !(await query(
        db,
        "SELECT i.id FROM shoppingListItems i JOIN shoppingLists l ON l.id=i.listId WHERE i.productId=? AND (l.status='open' OR (i.purchased=1 AND i.received=0))",
        p.id,
      ).first()),
      'Remova o produto da lista aberta e registre as entradas pendentes antes de arquivar.',
    );
    await db.batch([
      revision(db, p, b.revision),
      query(
        db,
        'UPDATE products SET active=0,revision=revision+1,updatedAt=?,updatedBy=? WHERE id=?',
        now(),
        user.id,
        p.id,
      ),
      audit(db, user.id, 'Produto arquivado', p.name),
    ]);
    return true;
  }
  if (action.startsWith('category.')) {
    admin(user);
    const categoryId = b.id ? text(b.id, 'Categoria') : id();
    if (action === 'category.delete') {
      ensure(
        !(await query(
          db,
          'SELECT id FROM products WHERE categoryId=? AND active=1',
          categoryId,
        ).first()),
        'Esta categoria tem produtos ativos. Mova-os antes de excluir.',
      );
      await db.batch([
        query(db, 'UPDATE categories SET active=0 WHERE id=?', categoryId),
        audit(db, user.id, 'Categoria arquivada', categoryId),
      ]);
    } else {
      const name = text(b.name, 'Nome', 80);
      const old = await query(
        db,
        'SELECT name FROM categories WHERE id=?',
        categoryId,
      ).first();
      await db.batch([
        b.id
          ? query(
              db,
              'UPDATE categories SET name=? WHERE id=? AND active=1',
              name,
              categoryId,
            )
          : query(
              db,
              'INSERT INTO categories (id,name) VALUES (?,?)',
              categoryId,
              name,
            ),
        audit(
          db,
          user.id,
          old ? 'Categoria editada' : 'Categoria criada',
          name,
          old,
          { name },
        ),
      ]);
    }
    return true;
  }
  if (action === 'demo') {
    admin(user);
    ensure(
      !(await query(db, 'SELECT id FROM products LIMIT 1').first()),
      'Os exemplos só podem ser adicionados a um estoque vazio.',
      409,
    );
    const cats = await all<{ id: string; name: string }>(
      db,
      'SELECT id,name FROM categories WHERE active=1',
    );
    const examples: [string, string, number, number, number, string][] = [
      ['Pão de hambúrguer', 'Ingredientes', 12, 20, 100, 'unidade'],
      ['Blend bovino', 'Ingredientes', 3, 4, 15, 'kg'],
      ['Queijo cheddar', 'Ingredientes', 2, 1, 5, 'kg'],
      ['Bacon fatiado', 'Ingredientes', 1.5, 1, 5, 'kg'],
      ['Caixa para hambúrguer', 'Embalagens', 18, 30, 200, 'unidade'],
      ['Batata congelada', 'Insumos', 12, 3, 10, 'kg'],
      ['Refrigerante lata', 'Bebidas', 48, 12, 48, 'unidade'],
      ['Detergente neutro', 'Limpeza', 4, 1, 4, 'litro'],
      ['Guardanapo', 'Embalagens', 3, 4, 12, 'pacote'],
      ['Molho da casa', 'Ingredientes', 2, 1, 6, 'litro'],
    ];
    await db.batch([
      guard(db, 'NOT EXISTS(SELECT 1 FROM products)'),
      ...examples.map(([name, category, q, min, ideal, unit]) =>
        query(
          db,
          'INSERT INTO products (id,name,categoryId,quantity,minimum,ideal,unit,createdAt,updatedAt,updatedBy) VALUES (?,?,?,?,?,?,?,?,?,?)',
          id(),
          name,
          cats.find((c) => c.name === category)?.id || cats[0]?.id,
          q,
          min,
          ideal,
          unit,
          now(),
          now(),
          user.id,
        ),
      ),
      audit(db, user.id, 'Produtos fictícios adicionados', 'Estoque'),
    ]);
    return true;
  }
  return false;
}

export type Status = 'critical' | 'warning' | 'ok';
export type Role = 'admin' | 'collaborator';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: number;
  job: string;
  phone: string;
  status: 'pending' | 'active' | 'blocked';
  canUpdateStock: number;
  createdAt: string;
}
export interface Category {
  id: string;
  name: string;
}
export interface Product {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  description: string;
  quantity: number;
  minimum: number;
  ideal: number;
  unit: string;
  manualStatus: Status | null;
  note: string;
  flagged: number;
  active: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  updater: string;
  revision: number;
}
export interface ShoppingItem {
  id: string;
  productId: string;
  name: string;
  category: string;
  unit: string;
  current: number;
  suggested: number;
  quantity: number;
  note: string;
  purchased: number;
  received: number;
  addedBy: string;
  addedAt: string;
  revision: number;
}
export interface ShoppingList {
  id: string;
  status: string;
  createdAt: string;
  finalizedAt: string | null;
  note: string;
  responsible: string;
  items: ShoppingItem[];
}
export interface Audit {
  id: string;
  userName: string;
  action: string;
  entity: string;
  before: string | null;
  after: string | null;
  note: string;
  createdAt: string;
}
export interface State {
  user: User;
  products: Product[];
  categories: Category[];
  lists: ShoppingList[];
  audits: Audit[];
  users: User[];
  emailConfigured: boolean;
  emailTestMode?: boolean;
  emailTestRecipient?: string;
}
export const statusLabels = {
  critical: 'Crítico',
  warning: 'Atenção',
  ok: 'Estoque OK',
};
export const units = [
  'unidade',
  'pacote',
  'caixa',
  'kg',
  'g',
  'litro',
  'ml',
  'bandeja',
  'fardo',
];
export function classify(
  p: Pick<Product, 'quantity' | 'minimum' | 'ideal' | 'manualStatus'>,
): Status {
  if (p.manualStatus) return p.manualStatus;
  if (p.quantity <= p.minimum) return 'critical';
  return p.quantity < p.ideal ? 'warning' : 'ok';
}
export function suggested(quantity: number, ideal: number) {
  return Math.max(0, Math.round((ideal - quantity) * 1000) / 1000);
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  value: unknown,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new AppError(status, message);
}
export function object(value: unknown): Record<string, unknown> {
  ensure(
    value && typeof value === 'object' && !Array.isArray(value),
    'Dados inválidos.',
  );
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  label: string,
  max = 200,
  optional = false,
) {
  ensure(typeof value === 'string', `${label}: texto inválido.`);
  const v = value.trim();
  ensure(
    (optional || v.length > 0) && v.length <= max,
    `${label}: preencha até ${max} caracteres.`,
  );
  return v;
}
export function number(value: unknown, label: string) {
  ensure(
    typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1000000,
    `${label}: informe um número entre 0 e 1.000.000.`,
  );
  return Math.round(value * 1000) / 1000;
}
export function email(value: unknown) {
  const v = text(value, 'E-mail', 254).toLowerCase();
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Informe um e-mail válido.');
  return v;
}
export function strongPassword(value: unknown) {
  ensure(
    typeof value === 'string' &&
      value.length >= 10 &&
      new TextEncoder().encode(value).length <= 72 &&
      /[A-Z]/.test(value) &&
      /[a-z]/.test(value) &&
      /[0-9]/.test(value) &&
      /[^A-Za-z0-9]/.test(value),
    'Use de 10 a 72 bytes, com maiúscula, minúscula, número e símbolo.',
  );
  return value;
}
export function admin(user: User) {
  ensure(user.role === 'admin', 'Acesso exclusivo de administradores.', 403);
}
export function stockPermission(user: User) {
  ensure(
    user.role === 'admin' || user.canUpdateStock === 1,
    'Você pode sinalizar compras. A contagem precisa de autorização do administrador.',
    403,
  );
}
export interface TransferItem {
  name: string;
  category: string;
  unit: string;
  quantity: number;
  current: number;
  suggested: number;
  note: string;
}
export interface Transfer {
  app: 'repor';
  version: 1;
  generatedAt: string;
  list: TransferItem[];
}
export function validateTransfer(value: unknown): Transfer {
  const v = object(value);
  ensure(
    v.app === 'repor' && v.version === 1,
    'Arquivo ou versão não suportada. Use uma exportação Repor v1.',
  );
  ensure(
    typeof v.generatedAt === 'string' &&
      Number.isFinite(Date.parse(v.generatedAt)),
    'Data de exportação inválida.',
  );
  ensure(
    Array.isArray(v.list) && v.list.length > 0 && v.list.length <= 500,
    'A lista precisa conter de 1 a 500 itens.',
  );
  const seen = new Set<string>();
  const list = v.list.map((raw) => {
    const i = object(raw);
    const name = text(i.name, 'Produto', 120);
    const key = name.toLocaleLowerCase('pt-BR');
    ensure(!seen.has(key), 'Há produtos duplicados no arquivo.');
    seen.add(key);
    return {
      name,
      category: text(i.category, 'Categoria', 80),
      unit: text(i.unit, 'Unidade', 30),
      quantity: number(i.quantity, 'Compra'),
      current: number(i.current, 'Estoque'),
      suggested: number(i.suggested, 'Sugestão'),
      note: text(i.note, 'Observação', 1000, true),
    };
  });
  return { app: 'repor', version: 1, generatedAt: v.generatedAt, list };
}
export function exportList(items: ShoppingItem[]): Transfer {
  return {
    app: 'repor',
    version: 1,
    generatedAt: new Date().toISOString(),
    list: items
      .filter((i) => !i.purchased)
      .map((i) => ({
        name: i.name,
        category: i.category,
        unit: i.unit,
        quantity: i.quantity,
        current: i.current,
        suggested: i.suggested,
        note: i.note,
      })),
  };
}

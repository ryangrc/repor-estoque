'use client';
import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  Flag,
  History,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge, Empty, Pick, fmt, date } from './ui';
import {
  classify,
  suggested,
  statusLabels,
  type State,
  type Product,
  type Status,
} from '@/lib/domain';
import type { Actions, Page } from './app';
function Products({
  products,
  state,
  actions,
  compact = false,
}: {
  products: Product[];
  state: State;
  actions: Actions;
  compact?: boolean;
}) {
  const items = state.lists.find((l) => l.status === 'open')?.items || [],
    admin = state.user.role === 'admin';
  const buttons = (p: Product) => (
    <div className="row-actions">
      {(admin || !!state.user.canUpdateStock) && (
        <button
          title="Conferir estoque"
          aria-label={`Conferir ${p.name}`}
          onClick={() => actions.count(p)}
        >
          <SlidersHorizontal size={17} />
        </button>
      )}
      <button
        title="Sinalizar compra"
        aria-label={`Sinalizar ${p.name}`}
        className={p.flagged ? 'flagged' : ''}
        onClick={() => actions.flag(p)}
      >
        <Flag size={17} />
      </button>
      {items.some((i) => i.productId === p.id) ? (
        <span className="in-list" title="Na lista de compras">
          <Check size={17} />
        </span>
      ) : (
        <button
          title="Adicionar à lista"
          aria-label={`Comprar ${p.name}`}
          onClick={() => actions.add(p)}
        >
          <ShoppingBasket size={17} />
        </button>
      )}
      {admin && !compact && (
        <>
          <button
            title="Editar produto"
            aria-label={`Editar ${p.name}`}
            onClick={() => actions.edit(p)}
          >
            <Pencil size={16} />
          </button>
          <button
            title="Arquivar produto"
            aria-label={`Arquivar ${p.name}`}
            onClick={() => actions.archive(p)}
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
  return (
    <>
      <div className="desktop-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Em estoque</TableHead>
              {!compact && <TableHead>Mín. / ideal</TableHead>}
              <TableHead>Situação</TableHead>
              <TableHead>
                {compact ? 'Reposição' : 'Última alteração'}
              </TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="product-name">
                    <span className="product-icon">
                      <Package size={19} />
                    </span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {p.category}
                        {!!p.flagged && ' · Sinalizado'}
                      </small>
                      {!compact && p.note && (
                        <small className="product-note">{p.note}</small>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <strong>{fmt(p.quantity)}</strong>{' '}
                  <span className="muted">{p.unit}</span>
                </TableCell>
                {!compact && (
                  <TableCell>
                    {fmt(p.minimum)} / {fmt(p.ideal)}
                  </TableCell>
                )}
                <TableCell>
                  <Badge status={classify(p)} />
                </TableCell>
                <TableCell>
                  {compact ? (
                    <span>
                      {fmt(suggested(p.quantity, p.ideal))} {p.unit}
                    </span>
                  ) : (
                    <div className="metadata">
                      {p.updater}
                      <small>{date(p.updatedAt)}</small>
                    </div>
                  )}
                </TableCell>
                <TableCell>{buttons(p)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="product-cards">
        {products.map((p) => (
          <article key={p.id} className={`product-card ${classify(p)}`}>
            <div className="flex-between">
              <div>
                <h3>{p.name}</h3>
                <span className="muted">{p.category}</span>
              </div>
              <Badge status={classify(p)} />
            </div>
            <div className="card-quantities">
              <div>
                <small>Em estoque</small>
                <strong>
                  {fmt(p.quantity)} <span>{p.unit}</span>
                </strong>
              </div>
              <div>
                <small>Mínimo / ideal</small>
                <span>
                  {fmt(p.minimum)} / {fmt(p.ideal)}
                </span>
              </div>
            </div>
            {p.note && <p className="helper">{p.note}</p>}
            <div className="flex-between">
              <small>{p.updater}</small>
              {buttons(p)}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
export function Inventory({
  state,
  actions,
  initialStatus,
}: {
  state: State;
  actions: Actions;
  initialStatus: string;
}) {
  const [q, setQ] = useState(''),
    [status, setStatus] = useState(initialStatus),
    [category, setCategory] = useState('all'),
    [flagged, setFlagged] = useState(false);
  const filtered = state.products.filter(
    (p) =>
      `${p.name} ${p.note}`.toLowerCase().includes(q.toLowerCase()) &&
      (status === 'all' || classify(p) === status) &&
      (category === 'all' || p.categoryId === category) &&
      (!flagged || p.flagged),
  );
  return (
    <section className="panel">
      <div className="filters">
        <label className="search">
          <Search size={18} />
          <input
            placeholder="Buscar produto ou observação…"
            aria-label="Buscar produto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <Pick
          label="Filtrar categoria"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'Todas as categorias' },
            ...state.categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Pick
          label="Filtrar situação"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Todas as situações' },
            ...Object.entries(statusLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <label className="check-label">
          <Checkbox checked={flagged} onCheckedChange={setFlagged} />
          Sinalizados
        </label>
      </div>
      {filtered.length ? (
        <Products products={filtered} state={state} actions={actions} />
      ) : (
        <Empty
          title="Nenhum produto encontrado"
          description="Ajuste os filtros ou cadastre um novo produto."
        />
      )}
      <div className="panel-foot">
        {filtered.length} de {state.products.length} produtos{' '}
        <span>Classificação automática ou ajustada pelo administrador</span>
      </div>
    </section>
  );
}
export function Dashboard({
  state,
  actions,
  go,
  demo,
  busy,
}: {
  state: State;
  actions: Actions;
  go: (p: Page, s?: string) => void;
  demo: () => void;
  busy: boolean;
}) {
  const counts = { critical: 0, warning: 0, ok: 0 };
  state.products.forEach((p) => counts[classify(p)]++);
  const items = state.lists.find((l) => l.status === 'open')?.items || [];
  return (
    <>
      <section className="stat-grid">
        <button className="stat-card total" onClick={() => go('Estoque')}>
          <div>
            <span>Total de produtos</span>
            <Boxes size={20} />
          </div>
          <strong>{state.products.length.toString().padStart(2, '0')}</strong>
          <p>
            Produtos ativos <ArrowUpRight size={16} />
          </p>
        </button>
        {(['critical', 'warning', 'ok'] as Status[]).map((s) => (
          <button
            className={`stat-card ${s}`}
            key={s}
            onClick={() => go('Estoque', s)}
          >
            <div>
              <span>
                {s === 'critical' ? 'Comprar agora' : statusLabels[s]}
              </span>
              {s === 'ok' ? (
                <CircleCheck size={20} />
              ) : s === 'warning' ? (
                <Clock3 size={20} />
              ) : (
                <CircleAlert size={20} />
              )}
            </div>
            <strong>{counts[s].toString().padStart(2, '0')}</strong>
            <p>
              {s === 'critical'
                ? 'Reposição necessária'
                : s === 'warning'
                  ? 'Abaixo do estoque ideal'
                  : 'Quantidade suficiente'}
              <ArrowUpRight size={16} />
            </p>
          </button>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel priority-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">PRIORIDADES</span>
              <h2>
                De olho na reposição{' '}
                <span className="count-pill">
                  {counts.critical + counts.warning}
                </span>
              </h2>
            </div>
            <button className="text-button" onClick={() => go('Estoque')}>
              Ver estoque
              <ArrowRight size={16} />
            </button>
          </div>
          {state.products.length ? (
            <Products
              products={state.products
                .filter((p) => classify(p) !== 'ok')
                .sort(
                  (a, b) =>
                    Number(classify(b) === 'critical') -
                    Number(classify(a) === 'critical'),
                )
                .slice(0, 5)}
              state={state}
              actions={actions}
              compact
            />
          ) : (
            <Empty
              title="Um bom controle começa aqui"
              description="Cadastre seu primeiro produto e acompanhe a reposição em tempo real."
            >
              {state.user.role === 'admin' && (
                <div className="empty-actions">
                  <button
                    className="btn primary"
                    onClick={() => actions.edit()}
                  >
                    <Plus size={17} />
                    Cadastrar produto
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={demo}
                  >
                    Experimentar com produtos fictícios
                  </button>
                </div>
              )}
            </Empty>
          )}
          {state.products.length > 0 &&
            counts.critical + counts.warning === 0 && (
              <Empty
                title="Tudo em dia"
                description="Todos os produtos estão com quantidade suficiente."
              />
            )}
        </section>
        <section className="shopping-summary">
          <div className="shopping-summary-top">
            <span>
              <ShoppingBasket size={25} />
            </span>
            <span>LISTA DE COMPRAS</span>
          </div>
          <h2>
            Sua próxima
            <br />
            reposição começa aqui.
          </h2>
          <div className="shopping-number">
            {items
              .filter((i) => !i.purchased)
              .length.toString()
              .padStart(2, '0')}
            <span>itens para comprar</span>
          </div>
          <p>Organize a lista e leve com você, em qualquer dispositivo.</p>
          <button className="btn" onClick={() => go('Lista de compras')}>
            Abrir lista de compras
            <ArrowRight size={17} />
          </button>
          <small>
            <Check size={14} />
            Exportação e importação em JSON
          </small>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-title">
            <h2>Últimas atualizações</h2>
            <button className="text-button" onClick={() => go('Histórico')}>
              Ver histórico
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="activity-list">
            {state.audits.slice(0, 4).map((a) => (
              <div className="activity" key={a.id}>
                <span className="activity-icon">
                  <History size={17} />
                </span>
                <div>
                  <strong>{a.action}</strong>
                  <p>
                    {a.userName} <span>· {a.entity}</span>
                  </p>
                </div>
                <time>{date(a.createdAt)}</time>
              </div>
            ))}
          </div>
        </section>
        <section className="panel health">
          <h2>Saúde do estoque</h2>
          <div className="health-value">
            {state.products.length
              ? Math.round((counts.ok / state.products.length) * 100)
              : 0}
            <span>%</span>
            <CircleCheck size={25} />
          </div>
          <p>dos produtos com estoque suficiente</p>
          <div className="health-track">
            {(['ok', 'warning', 'critical'] as Status[]).map((s) => (
              <span
                className={s}
                key={s}
                style={{
                  width: `${state.products.length ? (counts[s] / state.products.length) * 100 : 0}%`,
                }}
              />
            ))}
          </div>
          <div className="health-legend">
            <span>
              <i className="ok" />
              OK
            </span>
            <span>
              <i className="warning" />
              Atenção
            </span>
            <span>
              <i className="critical" />
              Crítico
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

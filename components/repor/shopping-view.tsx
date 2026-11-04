'use client';
import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRight,
  Check,
  CheckCheck,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Trash2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, Field, Pick, fmt, date } from './ui';
import { Form } from './forms';
import type { State, ShoppingItem, Transfer } from '@/lib/domain';
import type { OpenModal, Ask, Page } from './app';
export type Mutate = (
  action: string,
  data?: Record<string, unknown>,
  message?: string,
) => Promise<void>;
export function ShoppingView({
  state,
  busy,
  quick,
  mutate,
  editItem,
  open,
  close,
  ask,
  go,
  exportFile,
  importFile,
}: {
  state: State;
  busy: boolean;
  quick: Mutate;
  mutate: Mutate;
  editItem: (i: ShoppingItem) => void;
  open: OpenModal;
  close: () => void;
  ask: Ask;
  go: (p: Page) => void;
  exportFile: () => void;
  importFile: (f: File) => void;
}) {
  const [q, setQ] = useState('');
  const items = state.lists.find((l) => l.status === 'open')?.items || [],
    completed = state.lists.filter((l) => l.status === 'completed'),
    admin = state.user.role === 'admin';
  return (
    <>
      <div className="shopping-toolbar">
        <button
          className="btn"
          disabled={!items.some((i) => !i.purchased)}
          onClick={exportFile}
        >
          <ArrowUpFromLine size={17} />
          Exportar lista
        </button>
        {admin && (
          <label className="btn primary import-button">
            <ArrowDownToLine size={17} />
            Importar lista
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <section className="list-overview">
        <div>
          <ShoppingBasket size={23} />
          <strong>{items.length}</strong>
          <span>itens na lista</span>
        </div>
        <div>
          <CheckCheck size={23} />
          <strong>{items.filter((i) => i.purchased).length}</strong>
          <span>comprados</span>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            quick(
              'shopping.suggest',
              {},
              'Produtos críticos e sinalizados adicionados.',
            )
          }
        >
          <Plus size={17} />
          Adicionar reposições sugeridas
        </button>
      </section>
      <section className="panel">
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              placeholder="Buscar na lista…"
              aria-label="Buscar na lista"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <span className="helper">Organizada por categoria</span>
          {admin && items.some((i) => i.purchased) && (
            <button
              className="text-button"
              onClick={() =>
                ask(
                  'Limpar itens comprados?',
                  'Os itens marcados serão removidos desta lista. Para guardar a compra e registrar a entrada depois, use Finalizar compra.',
                  () => mutate('shopping.clear'),
                )
              }
            >
              <Trash2 size={16} />
              Limpar comprados
            </button>
          )}
        </div>
        {items.length ? (
          <div className="shopping-items">
            {items
              .filter((i) =>
                `${i.name} ${i.category}`
                  .toLowerCase()
                  .includes(q.toLowerCase()),
              )
              .map((i) => (
                <div
                  className={`shopping-row ${i.purchased ? 'purchased' : ''}`}
                  key={i.id}
                >
                  <Checkbox
                    aria-label={`Marcar ${i.name} como comprado`}
                    checked={!!i.purchased}
                    disabled={busy}
                    onCheckedChange={(v) =>
                      quick('shopping.update', {
                        id: i.id,
                        revision: i.revision,
                        quantity: i.quantity,
                        note: i.note,
                        purchased: v,
                      })
                    }
                  />
                  <div className="shopping-product">
                    <span className="category-label">{i.category}</span>
                    <strong>{i.name}</strong>
                    <small>
                      Em estoque: {fmt(i.current)} {i.unit} · Sugestão:{' '}
                      {fmt(i.suggested)} {i.unit}
                    </small>
                    {i.note && <p>{i.note}</p>}
                    <small>
                      Adicionado por {i.addedBy} · {date(i.addedAt)}
                    </small>
                  </div>
                  <div className="buy-quantity">
                    <small>Comprar</small>
                    <strong>
                      {fmt(i.quantity)} <span>{i.unit}</span>
                    </strong>
                  </div>
                  <div className="row-actions">
                    <button
                      aria-label={`Editar compra ${i.name}`}
                      onClick={() => editItem(i)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      aria-label={`Remover ${i.name} da lista`}
                      onClick={() =>
                        ask('Remover da lista?', i.name, () =>
                          mutate('shopping.remove', {
                            id: i.id,
                            revision: i.revision,
                          }),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <Empty
            title="Sua lista está pronta para começar"
            description="Adicione produtos pelo estoque ou use as reposições sugeridas."
          >
            <button className="btn" onClick={() => go('Estoque')}>
              Ver estoque
              <ArrowRight size={17} />
            </button>
          </Empty>
        )}
        <div className="list-footer">
          <p>
            <ShieldCheck size={17} />
            Finalizar a compra não altera o estoque.
          </p>
          {admin && (
            <button
              className="btn primary"
              disabled={!items.some((i) => i.purchased)}
              onClick={() =>
                open(
                  'Finalizar compra',
                  'Os itens não comprados continuarão na próxima lista. A entrada física será registrada separadamente.',
                  <Form
                    label="Finalizar compra"
                    save={async (b) => {
                      await mutate(
                        'shopping.finish',
                        b,
                        'Compra finalizada. Registre a entrada quando os itens chegarem.',
                      );
                      close();
                    }}
                  >
                    <Field label="Data da compra">
                      <input
                        type="date"
                        required
                        name="date"
                        defaultValue={new Date().toLocaleDateString('en-CA')}
                      />
                    </Field>
                    <Field label="Responsável">
                      <input readOnly value={state.user.name} />
                    </Field>
                    <Field label="Observação">
                      <textarea name="note" maxLength={1000} />
                    </Field>
                  </Form>,
                )
              }
            >
              <CheckCheck size={18} />
              Finalizar compra
            </button>
          )}
        </div>
      </section>
      {completed.length > 0 && (
        <section className="panel completed-panel">
          <div className="panel-title">
            <h2>Compras finalizadas</h2>
            <span className="helper">
              Registre a entrada após receber os produtos
            </span>
          </div>
          {completed.map((l) => (
            <details key={l.id}>
              <summary>
                {date(l.finalizedAt!)} · {l.responsible}{' '}
                <span>{l.items.length} itens</span>
              </summary>
              {l.note && <p className="helper">{l.note}</p>}
              {l.items.map((i) => (
                <div className="receipt-row" key={i.id}>
                  <span>
                    {i.name}{' '}
                    <strong>
                      {fmt(i.quantity)} {i.unit}
                    </strong>
                  </span>
                  {i.received ? (
                    <span className="status ok">
                      <Check size={14} />
                      Entrada registrada
                    </span>
                  ) : admin ? (
                    <button
                      disabled={busy}
                      className="btn"
                      onClick={() =>
                        ask(
                          'Registrar entrada no estoque?',
                          `Confirme o recebimento de ${fmt(i.quantity)} ${i.unit} de ${i.name}. Essa quantidade será somada ao estoque.`,
                          () =>
                            mutate(
                              'shopping.receive',
                              { id: i.id },
                              'Entrada registrada no estoque.',
                            ),
                        )
                      }
                    >
                      <Plus size={16} />
                      Registrar entrada
                    </button>
                  ) : (
                    <span className="helper">Aguardando entrada</span>
                  )}
                </div>
              ))}
            </details>
          ))}
        </section>
      )}
    </>
  );
}
export function ImportReview({
  file,
  items,
  save,
}: {
  file: Transfer;
  items: { name: string; quantity: number; unit: string; status: string }[];
  save: (policy: string) => Promise<void>;
}) {
  const [policy, setPolicy] = useState('skip');
  const labels: Record<string, string> = {
    new: 'Novo produto',
    existing: 'Produto existente',
    conflict: 'Já está na lista',
    inactive: 'Produto arquivado',
    'unit-conflict': 'Unidade incompatível',
  };
  return (
    <Form label="Importar lista" save={() => save(policy)}>
      <div className="import-preview">
        {items.map((i) => (
          <div key={i.name}>
            <strong>
              {i.name}
              <small>
                {i.quantity} {i.unit}
              </small>
            </strong>
            <span
              className={`status ${i.status === 'new' ? 'ok' : i.status === 'existing' ? '' : 'warning'}`}
            >
              {labels[i.status]}
            </span>
          </div>
        ))}
      </div>
      <Field label="Itens que já estão na lista">
        <Pick
          label="Tratamento dos conflitos"
          value={policy}
          onChange={setPolicy}
          options={[
            {
              value: 'skip',
              label: 'Manter os itens atuais (ignorar duplicados)',
            },
            {
              value: 'replace',
              label: 'Substituir quantidade e observação da compra',
            },
          ]}
        />
      </Field>
      <p className="helper">
        Produtos novos serão criados com estoque zero para conferência. A
        quantidade do arquivo é apenas referência. {file.list.length} itens
        validados.
      </p>
    </Form>
  );
}

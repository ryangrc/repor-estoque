'use client';
import { useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, Pick, Submit } from './ui';
import {
  units,
  type Product,
  type State,
  type User,
  type ShoppingItem,
} from '@/lib/domain';
export type Post = (
  action: string,
  data?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
export function Form({
  children,
  save,
  label,
}: {
  children: ReactNode;
  save: (b: Record<string, unknown>) => Promise<void>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="edit-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const fields = Object.fromEntries(new FormData(e.currentTarget));
        try {
          await save(fields);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Submit busy={busy} label={label} />
      </div>
    </form>
  );
}
export function ProductForm({
  product: p,
  state,
  save,
}: {
  product?: Product;
  state: State;
  save: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [category, setCategory] = useState(
      p?.categoryId || state.categories[0]?.id || '',
    ),
    [status, setStatus] = useState(p?.manualStatus || 'auto');
  return (
    <Form
      save={(b) =>
        save({
          ...b,
          id: p?.id,
          revision: p?.revision,
          categoryId: category,
          manualStatus: status === 'auto' ? null : status,
          quantity: Number(b.quantity),
          minimum: Number(b.minimum),
          ideal: Number(b.ideal),
        })
      }
    >
      <Field label="Nome do produto">
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={p?.name}
          placeholder="Ex.: Pão de hambúrguer"
        />
      </Field>
      <div className="form-grid">
        <Field label="Categoria">
          <Pick
            label="Categoria"
            value={category}
            onChange={setCategory}
            options={state.categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
        </Field>
        <Field label="Unidade de medida">
          <input
            list="units"
            name="unit"
            required
            maxLength={30}
            defaultValue={p?.unit || 'unidade'}
          />
          <datalist id="units">
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </datalist>
        </Field>
      </div>
      <div className="form-grid three">
        {[
          ['quantity', 'Quantidade atual', p?.quantity],
          ['minimum', 'Estoque mínimo', p?.minimum],
          ['ideal', 'Estoque ideal', p?.ideal],
        ].map(([name, label, value]) => (
          <Field key={String(name)} label={String(label)}>
            <input
              name={String(name)}
              required
              type="number"
              min="0"
              max="1000000"
              step="0.001"
              defaultValue={value ?? 0}
            />
          </Field>
        ))}
      </div>
      <Field label="Classificação">
        <Pick
          label="Classificação"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'auto', label: 'Automática (recomendado)' },
            { value: 'critical', label: 'Crítico' },
            { value: 'warning', label: 'Atenção' },
            { value: 'ok', label: 'Estoque OK' },
          ]}
        />
      </Field>
      <Field label="Descrição (opcional)">
        <textarea
          name="description"
          maxLength={1000}
          defaultValue={p?.description}
        />
      </Field>
      <Field label="Observação">
        <textarea
          name="note"
          maxLength={1000}
          defaultValue={p?.note}
          placeholder="Informações úteis para sua equipe"
        />
      </Field>
    </Form>
  );
}
export function StockForm({
  p,
  save,
}: {
  p: Product;
  save: (b: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <Form
      save={(b) =>
        save({
          ...b,
          id: p.id,
          revision: p.revision,
          quantity: Number(b.quantity),
        })
      }
    >
      <Field label={`Quantidade encontrada (${p.unit})`}>
        <input
          name="quantity"
          type="number"
          min="0"
          max="1000000"
          step="0.001"
          required
          defaultValue={p.quantity}
        />
      </Field>
      <Field label="Motivo">
        <input
          name="reason"
          required
          maxLength={150}
          defaultValue="Conferência de estoque"
        />
      </Field>
      <Field label="Observação">
        <textarea name="note" maxLength={1000} defaultValue={p.note} />
      </Field>
    </Form>
  );
}
export function ShoppingForm({
  item,
  quantity,
  save,
}: {
  item?: ShoppingItem;
  quantity?: number;
  save: (b: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <Form
      save={(b) =>
        save({
          ...b,
          quantity: Number(b.quantity),
          purchased: !!item?.purchased,
          revision: item?.revision,
          id: item?.id,
        })
      }
    >
      <Field label="Quantidade a comprar">
        <input
          name="quantity"
          required
          type="number"
          min="0.001"
          max="1000000"
          step="0.001"
          defaultValue={item?.quantity ?? quantity ?? 1}
        />
      </Field>
      <Field label="Observação">
        <textarea
          name="note"
          maxLength={1000}
          defaultValue={item?.note}
          placeholder="Marca, fornecedor ou detalhe importante"
        />
      </Field>
    </Form>
  );
}
export function UserForm({
  user: u,
  save,
}: {
  user?: User;
  save: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [role, setRole] = useState(u?.role || 'collaborator'),
    [active, setActive] = useState(u ? !!u.active : true),
    [stock, setStock] = useState(u ? !!u.canUpdateStock : true);
  return (
    <Form
      label={u ? 'Salvar alterações' : 'Criar usuário'}
      save={async (b) => {
        await save({ ...b, id: u?.id, role, active, canUpdateStock: stock });
      }}
    >
      <Field label="Nome">
        <input name="name" required maxLength={100} defaultValue={u?.name} />
      </Field>
      <Field label="E-mail">
        <input
          type="email"
          name="email"
          required
          maxLength={254}
          defaultValue={u?.email}
          readOnly={!!u}
        />
      </Field>
      <Field label="Cargo (opcional)">
        <input name="job" maxLength={100} defaultValue={u?.job} />
      </Field>
      <Field label="Telefone">
        <input
          name="phone"
          type="tel"
          required={!u}
          maxLength={30}
          defaultValue={u?.phone}
          autoComplete="tel"
        />
      </Field>
      <p className="helper">
        A pessoa receberá um convite válido por 24 horas e criará a própria
        senha. O administrador não define nem consulta senhas.
      </p>
      <Field label="Nível de acesso">
        <Pick
          value={role}
          onChange={(v) => setRole(v as User['role'])}
          label="Nível de acesso"
          options={[
            { value: 'collaborator', label: 'Operador' },
            { value: 'admin', label: 'Administrador' },
          ]}
        />
      </Field>
      {u && (
        <>
          <label className="check-label">
            <Checkbox checked={active} onCheckedChange={setActive} />
            Acesso desbloqueado (contas pendentes ainda precisam de ativação)
          </label>
          <label className="check-label">
            <Checkbox checked={stock} onCheckedChange={setStock} />
            Pode atualizar contagens de estoque
          </label>
          <p className="helper">Alterar a conta encerra suas sessões ativas.</p>
        </>
      )}
    </Form>
  );
}

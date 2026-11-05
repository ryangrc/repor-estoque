'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CircleAlert,
  Download,
  History,
  Pencil,
  RefreshCw,
  Search,
  Tags,
  Trash2,
} from 'lucide-react';
import { Badge, Field, date } from './ui';
import { Form } from './forms';
import type { State, User } from '@/lib/domain';
import type { Page, OpenModal, Ask } from './app';
import type { Mutate } from './shopping-view';
export function Management({
  page,
  state,
  open,
  close,
  ask,
  mutate,
  quick,
  editUser,
}: {
  page: Page;
  state: State;
  open: OpenModal;
  close: () => void;
  ask: Ask;
  mutate: Mutate;
  quick: Mutate;
  editUser: (u: User) => void;
}) {
  const [q, setQ] = useState(''),
    [install, setInstall] = useState<
      (Event & { prompt: () => Promise<void> }) | null
    >(null);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstall(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  if (page === 'Histórico')
    return (
      <section className="panel">
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Pesquisar histórico"
              placeholder="Buscar produto, pessoa ou ação…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <span className="helper">Últimos 200 registros</span>
        </div>
        <div className="audit-list">
          {state.audits
            .filter((a) =>
              `${a.action} ${a.entity} ${a.userName}`
                .toLowerCase()
                .includes(q.toLowerCase()),
            )
            .map((a) => (
              <article className="audit-entry" key={a.id}>
                <span className="activity-icon">
                  <History size={18} />
                </span>
                <div>
                  <h3>{a.action}</h3>
                  <p>
                    {a.entity} <span className="muted">· {a.userName}</span>
                  </p>
                  {(a.before || a.after) && (
                    <div className="audit-values">
                      {a.before && <span>Antes: {describe(a.before)}</span>}
                      {a.after && <span>Depois: {describe(a.after)}</span>}
                    </div>
                  )}
                  {a.note && <p className="helper">{a.note}</p>}
                </div>
                <time>{date(a.createdAt)}</time>
              </article>
            ))}
        </div>
      </section>
    );
  if (page === 'Categorias')
    return (
      <div className="category-grid">
        {state.categories.map((c) => (
          <section className="panel category-card" key={c.id}>
            <span className="category-icon">
              <Tags size={24} />
            </span>
            <h2>{c.name}</h2>
            <p>
              {state.products.filter((p) => p.categoryId === c.id).length}{' '}
              produtos ativos
            </p>
            <div className="row-actions">
              <button
                aria-label={`Editar categoria ${c.name}`}
                onClick={() =>
                  open(
                    'Editar categoria',
                    c.name,
                    <Form
                      save={async (b) => {
                        await mutate('category.save', { ...b, id: c.id });
                        close();
                      }}
                    >
                      <Field label="Nome">
                        <input
                          required
                          maxLength={80}
                          name="name"
                          defaultValue={c.name}
                        />
                      </Field>
                    </Form>,
                  )
                }
              >
                <Pencil size={17} />
              </button>
              <button
                aria-label={`Excluir categoria ${c.name}`}
                onClick={() =>
                  ask(
                    'Excluir categoria?',
                    `${c.name}. A exclusão só é permitida quando não há produtos ativos nesta categoria.`,
                    () => mutate('category.delete', { id: c.id }),
                  )
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          </section>
        ))}
      </div>
    );
  if (page === 'Usuários')
    return (
      <>
        {!state.emailConfigured && (
          <p className="info">
            <CircleAlert size={18} />
            O envio de e-mails não está configurado. Novas contas ficarão
            pendentes até o envio e a ativação do convite.
          </p>
        )}
        {state.emailTestMode && (
          <p className="info">
            Modo de testes: envios restritos a{' '}
            {state.emailTestRecipient ||
              'um destinatário ainda não configurado'}
            . Esta instalação atende uma única empresa.
          </p>
        )}
        <section className="panel user-list">
          {state.users.map((u) => (
            <div className="user-row" key={u.id}>
              <span className="avatar">{u.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>
                  {u.name}
                  {u.id === state.user.id ? ' (você)' : ''}
                </strong>
                <p>{u.email}</p>
                <small>
                  {u.phone || 'Sem telefone informado'} ·{' '}
                  {u.job || 'Sem cargo informado'} · Cadastro em{' '}
                  {date(u.createdAt)}
                </small>
              </div>
              <span className="role-label">
                {u.role === 'admin' ? 'Administrador' : 'Operador'}
              </span>
              <span
                className={`status ${u.status === 'active' ? 'ok' : u.status === 'pending' ? 'warning' : 'critical'}`}
              >
                {u.status === 'blocked'
                  ? 'Bloqueado'
                  : u.status === 'pending'
                    ? 'Pendente de ativação'
                    : 'Ativo'}
              </span>
              {u.id !== state.user.id && (
                <div className="row-actions">
                  <button
                    aria-label={`Editar usuário ${u.name}`}
                    onClick={() => editUser(u)}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    title="Reenviar convite"
                    disabled={!state.emailConfigured || u.status !== 'pending'}
                    aria-label={`Reenviar convite para ${u.name}`}
                    onClick={() =>
                      quick('user.resend', { id: u.id }, 'Convite reenviado.')
                    }
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      </>
    );
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <h2>Meu perfil</h2>
        <p className="helper">
          Seu nome identifica suas alterações no histórico.
        </p>
        <Form
          save={async (b) => {
            await mutate('profile', b);
          }}
        >
          <Field label="Nome">
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={state.user.name}
            />
          </Field>
          <Field label="E-mail">
            <input readOnly value={state.user.email} />
          </Field>
        </Form>
        <button
          className="text-button"
          onClick={() =>
            quick(
              'forgot',
              { email: state.user.email },
              'Se houver uma conta associada a esse e-mail, enviaremos as instruções de recuperação.',
            )
          }
        >
          Solicitar redefinição de senha
          <ArrowRight size={16} />
        </button>
      </section>
      <section className="panel settings-panel">
        <h2>Como o estoque é classificado</h2>
        <div className="rule">
          <Badge status="critical" />
          <p>Quantidade igual ou abaixo do mínimo.</p>
        </div>
        <div className="rule">
          <Badge status="warning" />
          <p>
            Acima do mínimo, mas abaixo do ideal. A duração em dias depende do
            consumo.
          </p>
        </div>
        <div className="rule">
          <Badge status="ok" />
          <p>Quantidade igual ou acima do ideal.</p>
        </div>
        <p className="helper">
          O administrador pode ajustar situações excepcionais. Todos os ajustes
          ficam no histórico.
        </p>
      </section>
      <section className="panel settings-panel">
        <h2>Repor no seu dispositivo</h2>
        <p>
          Use o navegador ou instale o aplicativo para abrir com mais
          facilidade.
        </p>
        {install ? (
          <button
            className="btn primary"
            onClick={async () => {
              await install.prompt();
              setInstall(null);
            }}
          >
            <Download size={18} />
            Instalar Repor
          </button>
        ) : (
          <p className="helper">
            No navegador, procure “Instalar aplicativo” ou “Adicionar à tela de
            início”. No iPhone, use Compartilhar → Adicionar à Tela de Início.
          </p>
        )}
        <p className="helper">
          Uma conexão é necessária para acessar os dados. As informações da
          empresa não ficam armazenadas offline.
        </p>
      </section>
    </div>
  );
}
function describe(value: string) {
  try {
    const v = JSON.parse(value);
    return Object.entries(v)
      .map(
        ([k, val]) =>
          `${({ quantity: 'Quantidade', minimum: 'Mínimo', ideal: 'Ideal', unit: 'Unidade', name: 'Nome', role: 'Função', active: 'Ativo', manualStatus: 'Classificação', note: 'Observação' } as Record<string, string>)[k] || k}: ${typeof val === 'string' ? val : JSON.stringify(val ?? 'automática')}`,
      )
      .join(' · ');
  } catch {
    return value;
  }
}

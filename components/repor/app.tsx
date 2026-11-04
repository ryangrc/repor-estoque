'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  Boxes,
  Check,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings2,
  ShoppingBasket,
  Tags,
  Users,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Brand, Modal, Confirm, Field } from './ui';
import { AuthScreen } from './auth-screen';
import { Form, ProductForm, StockForm, ShoppingForm, UserForm } from './forms';
import { Dashboard, Inventory } from './inventory-view';
import { ShoppingView, ImportReview } from './shopping-view';
import { Management } from './management';
import {
  classify,
  suggested,
  validateTransfer,
  type State,
  type Product,
  type ShoppingItem,
  type User,
} from '@/lib/domain';
export type Page =
  | 'Dashboard'
  | 'Estoque'
  | 'Lista de compras'
  | 'Histórico'
  | 'Categorias'
  | 'Usuários'
  | 'Configurações';
export type Actions = {
  count: (p: Product) => void;
  edit: (p?: Product) => void;
  add: (p: Product) => void;
  flag: (p: Product) => void;
  archive: (p: Product) => void;
};
export type OpenModal = (
  title: string,
  description: string,
  content: ReactNode,
) => void;
export type Ask = (
  title: string,
  description: string,
  run: () => Promise<void>,
) => void;
const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Estoque', icon: Boxes },
  { name: 'Lista de compras', icon: ShoppingBasket },
  { name: 'Histórico', icon: History },
  { name: 'Categorias', icon: Tags },
  { name: 'Usuários', icon: Users },
  { name: 'Configurações', icon: Settings2 },
] as const;
export default function App() {
  const [state, setState] = useState<State | null>(null),
    [auth, setAuth] = useState<{ setup: boolean } | null>(null),
    [csrf, setCsrf] = useState(''),
    [token, setToken] = useState(''),
    [page, setPage] = useState<Page>('Dashboard'),
    [initialStatus, setInitialStatus] = useState('all'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<{
      title: string;
      description: string;
      content: ReactNode;
    } | null>(null),
    [confirm, setConfirm] = useState<{
      title: string;
      description: string;
      run: () => Promise<void>;
    } | null>(null);
  async function refresh() {
    const r = await fetch('/api', { cache: 'no-store' });
    const data = (await r.json()) as State & {
      csrf?: string;
      setup?: boolean;
      login?: boolean;
      error?: string;
    };
    if (!r.ok) throw new Error(data.error);
    setCsrf(data.csrf || '');
    if (data.setup || data.login) {
      setAuth({ setup: !!data.setup });
      setState(null);
    } else {
      setState(data);
      setAuth(null);
    }
  }
  async function post(action: string, data: Record<string, unknown> = {}) {
    const r = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ action, ...data }),
    });
    const result = (await r.json()) as Record<string, unknown>;
    if (!r.ok) {
      if (r.status === 401) {
        setState(null);
        setAuth({ setup: false });
      }
      throw new Error(
        typeof result.error === 'string'
          ? result.error
          : 'Não foi possível concluir esta operação.',
      );
    }
    return result;
  }
  async function mutate(
    action: string,
    data: Record<string, unknown> = {},
    message = 'Alterações salvas.',
  ) {
    await post(action, data);
    await refresh();
    setNotice(message);
  }
  async function quick(
    action: string,
    data: Record<string, unknown> = {},
    message?: string,
  ) {
    setBusy(true);
    setError('');
    try {
      await mutate(action, data, message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function go(p: Page, s = 'all') {
    setPage(p);
    setInitialStatus(s);
    setError('');
  }
  useEffect(() => {
    const t = new URLSearchParams(location.hash.slice(1)).get('reset');
    if (t) {
      queueMicrotask(() => setToken(t));
      history.replaceState(null, '', location.pathname);
    }
    void Promise.resolve()
      .then(refresh)
      .catch((e) => setError(e.message));
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const close = () => setModal(null);
  const open: OpenModal = (title, description, content) =>
    setModal({ title, description, content });
  const ask: Ask = (title, description, run) =>
    setConfirm({ title, description, run });
  const actions: Actions = {
    edit(p) {
      if (!state) return;
      open(
        p ? 'Editar produto' : 'Novo produto',
        'Defina as quantidades e deixe a reposição mais simples.',
        <ProductForm
          state={state}
          product={p}
          save={async (b) => {
            await mutate('product.save', b, 'Produto salvo com sucesso.');
            close();
          }}
        />,
      );
    },
    count(p) {
      open(
        `Conferir ${p.name}`,
        `Estoque registrado: ${p.quantity} ${p.unit}. A alteração ficará no histórico.`,
        <StockForm
          p={p}
          save={async (b) => {
            await mutate('stock.update', b, 'Estoque atualizado com sucesso.');
            close();
          }}
        />,
      );
    },
    add(p) {
      open(
        `Comprar ${p.name}`,
        `Sugestão: ${suggested(p.quantity, p.ideal)} ${p.unit} para atingir o estoque ideal.`,
        <ShoppingForm
          quantity={suggested(p.quantity, p.ideal) || 1}
          save={async (b) => {
            await mutate(
              'shopping.add',
              { ...b, productId: p.id },
              'Item adicionado à lista.',
            );
            close();
          }}
        />,
      );
    },
    flag(p) {
      open(
        'Sinalizar para compra',
        p.name,
        <Form
          save={async (b) => {
            await mutate('product.flag', {
              ...b,
              id: p.id,
              revision: p.revision,
              flagged: !p.flagged,
            });
            close();
          }}
        >
          <Field label="Observação">
            <textarea name="note" maxLength={1000} defaultValue={p.note} />
          </Field>
          <p className="helper">
            {p.flagged
              ? 'A sinalização será removida.'
              : 'A equipe verá este produto sinalizado para reposição.'}
          </p>
        </Form>,
      );
    },
    archive(p) {
      ask(
        'Arquivar este produto?',
        `${p.name} deixará o estoque ativo. Seu histórico será preservado.`,
        () =>
          mutate(
            'product.delete',
            { id: p.id, revision: p.revision },
            'Produto arquivado.',
          ),
      );
    },
  };
  function editItem(i: ShoppingItem) {
    open(
      i.name,
      `Quantidade em ${i.unit}. Ajuste a compra e deixe uma observação.`,
      <ShoppingForm
        item={i}
        save={async (b) => {
          await mutate('shopping.update', b);
          close();
        }}
      />,
    );
  }
  function editUser(u?: User) {
    open(
      u ? 'Editar usuário' : 'Criar usuário',
      u
        ? 'Gerencie o acesso e os dados da conta.'
        : 'Defina os dados e a senha para a pessoa acessar o sistema.',
      <UserForm
        user={u}
        save={async (b) => {
          await mutate(
            u ? 'user.update' : 'user.create',
            b,
            u
              ? 'Usuário atualizado.'
              : 'Usuário criado. Já pode entrar com a senha definida.',
          );
          close();
        }}
      />,
    );
  }
  function exportFile() {
    const a = document.createElement('a');
    a.href = '/api/export';
    a.download = `repor-compras-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function importFile(file: File) {
    setError('');
    try {
      if (file.size > 500000) throw new Error('O arquivo deve ter até 500 KB.');
      const transfer = validateTransfer(JSON.parse(await file.text()));
      const preview = await post('import.preview', { file: transfer });
      open(
        'Revisar importação',
        `${transfer.list.length} produtos encontrados. Nenhuma quantidade do estoque será substituída.`,
        <ImportReview
          file={transfer}
          items={
            preview.items as {
              name: string;
              quantity: number;
              unit: string;
              status: string;
            }[]
          }
          save={async (policy) => {
            await mutate(
              'import.commit',
              { file: transfer, policy },
              'Lista importada com sucesso.',
            );
            close();
          }}
        />,
      );
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? 'O arquivo não contém JSON válido.'
          : (e as Error).message,
      );
    }
  }
  if (auth || (token && !state))
    return (
      <AuthScreen
        key={`${auth?.setup}-${token}`}
        setup={auth?.setup || false}
        token={token}
        post={post}
        refresh={async () => {
          setToken('');
          await refresh();
        }}
      />
    );
  if (!state)
    return (
      <div className="loading-page">
        <Brand />
        {error ? (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <button
              className="btn"
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <p>
            <RefreshCw className="spin" size={18} />
            Preparando seu espaço…
          </p>
        )}
      </div>
    );
  const isAdmin = state.user.role === 'admin',
    critical = state.products.filter((p) => classify(p) === 'critical').length,
    items = state.lists.find((l) => l.status === 'open')?.items || [];
  return (
    <SidebarProvider>
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <Brand />
          <div className="workspace-label">
            <span>R</span>
            <div>
              Meu negócio<small>Gestão de estoque</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">ESPAÇO DE TRABALHO</div>
          <SidebarMenu>
            {navigation
              .filter(
                (n) => isAdmin || !['Categorias', 'Usuários'].includes(n.name),
              )
              .map((n) => (
                <SidebarMenuItem key={n.name}>
                  <NavigationButton
                    active={page === n.name}
                    onClick={() => go(n.name)}
                  >
                    <n.icon size={19} />
                    <span>{n.name}</span>
                    {n.name === 'Lista de compras' && items.length > 0 && (
                      <b className="nav-count">{items.length}</b>
                    )}
                  </NavigationButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <p>
              Todo movimento conta.
              <span>Alterações registradas com segurança.</span>
            </p>
          </div>
          <button className="logout" onClick={() => quick('logout')}>
            <LogOut size={18} />
            Sair da conta
          </button>
        </SidebarFooter>
      </Sidebar>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Meu negócio</span>
            <span>/</span>
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Intl.DateTimeFormat('pt-BR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }).format(new Date())}
            </span>
            <button
              className="bell"
              title="Ver produtos críticos"
              aria-label="Ver produtos críticos"
              onClick={() => go('Estoque', 'critical')}
            >
              <Bell size={20} />
              {critical > 0 && <i />}
            </button>
            <div className="profile">
              <span className="avatar">
                {state.user.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                {state.user.name}
                <small>{isAdmin ? 'Administrador' : 'Colaborador'}</small>
              </span>
            </div>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'Dashboard' ? 'SEU NEGÓCIO, EM DIA' : 'MEU NEGÓCIO'}
              </span>
              <h1>{page === 'Dashboard' ? 'Visão geral' : page}</h1>
              <p>
                {page === 'Dashboard'
                  ? `Olá, ${state.user.name.split(' ')[0]}. Confira o que precisa da sua atenção.`
                  : page === 'Estoque'
                    ? 'Cada produto no seu lugar. Cada quantidade atualizada.'
                    : page === 'Lista de compras'
                      ? 'Da conferência à reposição, sem esquecer de nada.'
                      : page === 'Histórico'
                        ? 'Transparência em cada alteração do seu negócio.'
                        : page === 'Usuários'
                          ? 'As pessoas que mantêm seu estoque em dia.'
                          : page === 'Categorias'
                            ? 'Organize os produtos do jeito que seu negócio precisa.'
                            : 'Seu perfil e as preferências do sistema.'}
              </p>
            </div>
            <div className="heading-actions">
              {(page === 'Dashboard' || page === 'Estoque') && isAdmin && (
                <button className="btn primary" onClick={() => actions.edit()}>
                  <Plus size={18} />
                  Novo produto
                </button>
              )}
              {page === 'Usuários' && (
                <button className="btn primary" onClick={() => editUser()}>
                  <Plus size={17} />
                  Criar usuário
                </button>
              )}
              {page === 'Categorias' && (
                <button
                  className="btn primary"
                  onClick={() =>
                    open(
                      'Nova categoria',
                      'Crie um grupo para organizar seus produtos.',
                      <Form
                        save={async (b) => {
                          await mutate('category.save', b);
                          close();
                        }}
                      >
                        <Field label="Nome">
                          <input name="name" required maxLength={80} />
                        </Field>
                      </Form>,
                    )
                  }
                >
                  <Plus size={17} />
                  Nova categoria
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button aria-label="Fechar erro" onClick={() => setError('')}>
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <output className="success banner">
              <Check size={18} />
              {notice}
              <button aria-label="Fechar aviso" onClick={() => setNotice('')}>
                <X size={17} />
              </button>
            </output>
          )}
          {page === 'Dashboard' && (
            <Dashboard
              state={state}
              actions={actions}
              go={go}
              demo={() =>
                quick(
                  'demo',
                  {},
                  'Exemplos adicionados. São produtos fictícios.',
                )
              }
              busy={busy}
            />
          )}
          {page === 'Estoque' && (
            <Inventory
              key={initialStatus}
              state={state}
              actions={actions}
              initialStatus={initialStatus}
            />
          )}
          {page === 'Lista de compras' && (
            <ShoppingView
              state={state}
              busy={busy}
              quick={quick}
              mutate={mutate}
              editItem={editItem}
              open={open}
              close={close}
              ask={ask}
              go={go}
              exportFile={exportFile}
              importFile={importFile}
            />
          )}
          {['Categorias', 'Usuários', 'Histórico', 'Configurações'].includes(
            page,
          ) && (
            <Management
              page={page}
              state={state}
              open={open}
              close={close}
              ask={ask}
              mutate={mutate}
              quick={quick}
              editUser={editUser}
            />
          )}
          <footer className="content-footer">
            <span>
              repor. <span>Menos falta. Mais controle.</span>
            </span>
            <span>
              <ShieldCheck size={13} />
              Histórico protegido
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={modal.title}
          description={modal.description}
          close={close}
        >
          {modal.content}
        </Modal>
      )}
      {confirm && <Confirm {...confirm} close={() => setConfirm(null)} />}
    </SidebarProvider>
  );
}

function NavigationButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      className="nav-item"
      isActive={active}
      onClick={() => {
        onClick();
        setOpenMobile(false);
      }}
    >
      {children}
    </SidebarMenuButton>
  );
}

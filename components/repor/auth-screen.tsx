'use client';
import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  Check,
  Boxes,
  ShoppingBasket,
  History,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Brand, Field, Submit } from './ui';
import { strongPassword, ensure } from '@/lib/domain';
export function AuthScreen({
  setup,
  token,
  post,
  refresh,
}: {
  setup: boolean;
  token: string;
  post: (
    action: string,
    data: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
}) {
  const activating = token.startsWith('activate:');
  const rawToken = activating ? token.slice(9) : token;
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState(token ? 'reset' : setup ? 'setup' : 'login'),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [password, setPassword] = useState(''),
    [show, setShow] = useState(false);
  useEffect(() => {
    if (!activating) return;
    void post('activation.check', { token: rawToken })
      .then(() => setChecked(true))
      .catch((e) => setError(e.message));
  }, [activating, rawToken, post]);
  const rules = [
    password.length >= 10,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = rules.filter(Boolean).length;
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-copy">
          <span className="eyebrow">MENOS IMPREVISTOS. MAIS CONTROLE.</span>
          <h1>
            Seu estoque
            <br />
            no ponto certo<span>.</span>
          </h1>
          <p>Saiba o que tem, o que está acabando e o que precisa comprar.</p>
          <div className="auth-features">
            <div>
              <Boxes />
              <span>
                Estoque organizado<strong>Cada insumo, em um só lugar.</strong>
              </span>
            </div>
            <div>
              <ShoppingBasket />
              <span>
                Reposição sem adivinhação
                <strong>Uma lista pronta para ir com você.</strong>
              </span>
            </div>
            <div>
              <History />
              <span>
                Sua equipe, em sintonia
                <strong>Saiba quem atualizou cada item.</strong>
              </span>
            </div>
          </div>
        </div>
        <footer>
          ESTOQUE + REPOSIÇÃO + COMPRAS{' '}
          <span>Repor © {new Date().getFullYear()}</span>
        </footer>
      </section>
      <section className="auth-form-side">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="auth-form">
          <div className="auth-kicker">
            <ShieldCheck size={17} />
            {mode === 'setup' ? 'PRIMEIRO ACESSO' : 'ACESSO SEGURO'}
          </div>
          <h2>
            {mode === 'setup'
              ? 'Vamos organizar seu estoque.'
              : mode === 'forgot'
                ? 'Esqueceu sua senha?'
                : mode === 'reset'
                  ? activating
                    ? 'Ative sua conta no PJ Estoque.'
                    : 'Defina sua nova senha.'
                  : 'Bom ter você de volta.'}
          </h2>
          <p>
            {mode === 'setup'
              ? 'Crie sua conta de administrador para começar.'
              : mode === 'forgot'
                ? 'Informe seu e-mail para receber as instruções.'
                : mode === 'reset'
                  ? 'Escolha uma senha forte para proteger sua conta.'
                  : 'Entre para acompanhar seu estoque e suas compras.'}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setMessage('');
              const data = Object.fromEntries(new FormData(e.currentTarget));
              try {
                if (mode === 'setup' || mode === 'reset') {
                  strongPassword(data.password);
                  ensure(
                    data.password === data.confirm,
                    'As senhas não coincidem.',
                  );
                }
                const result = await post(
                  mode === 'reset' && activating ? 'activate' : mode,
                  { ...data, token: rawToken },
                );
                if (mode === 'login' || mode === 'setup') await refresh();
                else {
                  setMessage(
                    typeof result.message === 'string'
                      ? result.message
                      : 'Solicitação recebida.',
                  );
                  if (mode === 'reset') setMode('login');
                }
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === 'setup' && (
              <Field label="Seu nome">
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  placeholder="Como podemos chamar você?"
                />
              </Field>
            )}
            {mode !== 'reset' && (
              <Field label="E-mail">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="seu@email.com"
                />
              </Field>
            )}
            {mode !== 'forgot' && (
              <Field label="Senha">
                <div className="password-input">
                  <input
                    name="password"
                    type={show ? 'text' : 'password'}
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    minLength={mode === 'login' ? undefined : 10}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === 'login'
                        ? 'Digite sua senha'
                        : 'Maiúscula, minúscula, número e símbolo'
                    }
                  />
                  <button
                    type="button"
                    aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
            )}
            {(mode === 'setup' || mode === 'reset') && (
              <>
                <div className="strength">
                  <div>
                    {rules.map((_, i) => (
                      <span
                        key={i}
                        className={
                          i < strength
                            ? strength === 5
                              ? 'strong'
                              : 'medium'
                            : ''
                        }
                      />
                    ))}
                  </div>
                  <span>
                    {strength === 5
                      ? 'Forte'
                      : strength > 2
                        ? 'Média'
                        : 'Fraca'}{' '}
                    · mínimo de 10 caracteres
                  </span>
                </div>
                <Field label="Confirmar senha">
                  <input
                    type={show ? 'text' : 'password'}
                    name="confirm"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    placeholder="Digite a senha novamente"
                  />
                </Field>
              </>
            )}
            {mode === 'login' && (
              <button
                className="text-button forgot"
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError('');
                }}
              >
                Esqueci minha senha
              </button>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <output className="success">
                <Check size={17} />
                {message}
              </output>
            )}
            <Submit
              busy={busy}
              disabled={mode === 'reset' && activating && !checked}
              label={
                mode === 'setup'
                  ? 'Criar conta e começar'
                  : mode === 'forgot'
                    ? 'Enviar instruções'
                    : mode === 'reset'
                      ? activating
                        ? 'Ativar conta'
                        : 'Redefinir senha'
                      : 'Entrar'
              }
            />
            {(mode === 'forgot' || mode === 'reset') && (
              <button
                type="button"
                className="text-button back"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                <ArrowLeft size={16} />
                Voltar ao login
              </button>
            )}
          </form>
          <div className="auth-security">
            <ShieldCheck size={17} />
            <span>
              {mode === 'setup'
                ? 'Você será o primeiro administrador. Depois, poderá convidar sua equipe.'
                : 'Sua sessão é protegida e expira automaticamente.'}
            </span>
          </div>
        </div>
        <div className="auth-bottom">
          Feito para a rotina de pequenos negócios.
        </div>
      </section>
    </main>
  );
}

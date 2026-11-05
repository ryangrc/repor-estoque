import { AppError, ensure } from '../lib/domain';

export interface Config {
  APP_URL?: string;

  EMAIL_API_KEY?: string;

  EMAIL_FROM?: string;

  EMAIL_TEST_MODE?: string;

  EMAIL_TEST_RECIPIENT?: string;

  sendMail?: (to: string, link: string) => Promise<void>;
}

export const testMode = (c: Config) => c.EMAIL_TEST_MODE !== 'false';

export function mailConfigured(c: Config) {
  return (
    !!c.sendMail ||
    !!(
      c.EMAIL_API_KEY &&
      c.APP_URL &&
      (testMode(c) ? c.EMAIL_TEST_RECIPIENT : c.EMAIL_FROM)
    )
  );
}

export function checkRecipient(c: Config, to: string) {
  ensure(
    mailConfigured(c),
    'E-mail não configurado. A conta permanece pendente; configure o Resend e reenvie o convite.',
    503,
  );

  if (testMode(c))
    ensure(
      to.toLowerCase() === c.EMAIL_TEST_RECIPIENT?.trim().toLowerCase(),
      'Modo de testes: o Resend permite envio somente ao endereço autorizado da conta. Nenhum e-mail foi enviado.',
      403,
    );
}

export async function sendAccountMail(
  c: Config,
  to: string,
  token: string,
  kind: 'reset' | 'activate',
) {
  checkRecipient(c, to);

  let base: URL;

  try {
    base = new URL(c.APP_URL!);
  } catch {
    throw new AppError(
      503,
      'Configure APP_BASE_URL com o endereço desta instalação.',
    );
  }

  ensure(
    base.protocol === 'https:' ||
      (base.protocol === 'http:' && base.hostname === 'localhost'),
    'APP_BASE_URL deve usar HTTPS.',
    503,
  );

  ensure(
    !base.username &&
      !base.password &&
      base.pathname === '/' &&
      !base.search &&
      !base.hash,
    'APP_BASE_URL deve conter apenas a origem do sistema.',
    503,
  );

  const link = `${base.origin}/#${kind}=${token}`;

  if (c.sendMail) {
    await c.sendMail(to, link);
    return null;
  }

  const headers = {
    Authorization: `Bearer ${c.EMAIL_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const from = testMode(c)
    ? 'PJ Estoque <onboarding@resend.dev>'
    : c.EMAIL_FROM!;

  if (!testMode(c)) {
    const address = from.match(/<([^<>]+)>$/)?.[1] || from;

    const domain = address.split('@')[1]?.toLowerCase();

    ensure(
      domain && domain !== 'resend.dev',
      'Configure um remetente de domínio próprio verificado.',
      503,
    );

    // Fail closed: validate on the provider before allowing production recipients.

    let after = '';

    let verified = false;

    do {
      const response = await fetch(
        `https://api.resend.com/domains?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );

      ensure(
        response.ok,
        'Não foi possível validar o domínio no Resend. Confira as permissões da chave.',
        503,
      );

      const page = (await response.json()) as {
        data: { id: string; name: string; status: string }[];
        has_more?: boolean;
      };

      verified = page.data.some(
        (d) => d.name.toLowerCase() === domain && d.status === 'verified',
      );

      after = !verified && page.has_more ? page.data.at(-1)?.id || '' : '';
    } while (after);

    ensure(
      verified,
      'O domínio do remetente ainda não está verificado no Resend.',
      503,
    );
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(15000),

      body: JSON.stringify({
        from,
        to: [to],
        subject:
          kind === 'activate'
            ? 'Ative sua conta — PJ Estoque'
            : 'Recupere sua senha — PJ Estoque',
        text: `${kind === 'activate' ? 'Você foi convidado para o PJ Estoque. Crie sua senha' : 'Redefina sua senha'}: ${link}\nLink individual de uso único. Validade: ${kind === 'activate' ? '24 horas' : '30 minutos'}. Se não esperava esta mensagem, ignore-a.`,
      }),
    });

    if (!response.ok)
      throw new AppError(
        503,
        response.status === 403
          ? 'Resend recusou o envio. Confira o destinatário autorizado no modo de testes ou o domínio verificado.'
          : 'Resend não aceitou o envio. Confira a configuração e tente reenviar.',
      );

    const result = (await response.json()) as { id?: string };

    ensure(result.id, 'Resend não confirmou o envio.', 503);

    return result.id;
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw new AppError(
      503,
      'Serviço de e-mail indisponível. Tente reenviar o convite.',
    );
  }
}

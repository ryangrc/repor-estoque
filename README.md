# Repor — Estoque e compras

Sistema de estoque, reposição e compras, com administradores e colaboradores.

## Hospedagem

Esta versão usa Next.js 16 na Vercel e SQLite remoto no Turso. O código está no GitHub; publicar somente pelo GitHub Pages não executa a API ou o banco.

- Node.js 24, React 19, TypeScript e Tailwind.
- API com sessões HttpOnly, bcrypt, CSRF, permissões e auditoria.
- Turso com consultas parametrizadas e lotes transacionais (rollback integral em falhas).
- As credenciais do banco ficam nas variáveis protegidas da Vercel, nunca no Git.

## Instalação

1. Importe este repositório na Vercel usando o preset Next.js e Node 24.
2. Conecte um banco Turso pelo Marketplace. Configure `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.
3. Na primeira publicação, configure o segredo temporário `REPOR_BOOTSTRAP_ADMIN` com um JSON contendo `id`, `name`, `email` e `passwordHash` bcrypt. Ele inicializa o administrador antes de abrir a aplicação. Não use senha em texto nesse campo.
4. Antes de publicar, execute o backup verificável e a migração explícita conforme [o guia de convites](docs/convites-resend.md). O build somente compila: nunca migra bancos. Migrations aplicadas são verificadas por checksum; não edite arquivos já aplicados.
5. Remova `REPOR_BOOTSTRAP_ADMIN` após a primeira publicação. As próximas usam o cadastro persistido.

Esta instalação tem banco separado da antiga hospedagem Sites. Os produtos e movimentações antigos não são importados automaticamente. O administrador inicial pode manter o cadastro existente por transferência segura do hash, sem expor a senha.

## Desenvolvimento e verificação

Configure um banco de desenvolvimento separado em `.env.local` (veja `.env.example`).

```sh
npm ci
npm run db:migrate
npm run dev
npm test
npm run typecheck
npm run build
```

Os testes usam bancos temporários e não alteram o banco online. Cobrem autenticação, permissões, CSRF, estoque, compras, exportação/importação, recuperação e transações do adaptador Turso.

O administrador cadastra contas pendentes; cada pessoa define sua própria senha pelo convite. Veja [configuração do Resend, preview isolado e migrações](docs/convites-resend.md). Sem e-mail configurado, o cadastro permanece pendente e o sistema informa a falha de envio.

## Acesso

## Confirmação de compra

Marque os itens comprados e use **Finalizar compra** após conferir o recebimento. A confirmação soma as quantidades ao estoque, registra as movimentações e marca a entrada na mesma transação. Itens não comprados passam para a próxima lista. Repetir a confirmação não duplica a entrada. Compras antigas finalizadas sem entrada continuam com **Registrar entrada**.

## Acesso

Use o endereço de produção gerado pela Vercel. O domínio personalizado é opcional. Os planos gratuitos possuem cotas; ultrapassá-las pode interromper o serviço.

Nunca publique `.env*`, tokens, senhas ou cópias do banco. Compartilhar o código não compartilha automaticamente o acesso ao estoque.

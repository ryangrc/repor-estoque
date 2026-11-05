# Contas e convites — PJ Estoque

## Arquitetura e limites

Esta aplicação atende **uma única empresa por instalação/banco**. Não há tabela de empresas, memberships ou tenantId nos dados existentes. Não cadastre clientes de empresas distintas no mesmo banco: administradores desta instalação gerenciam todos os seus usuários. Liberar SaaS multiempresa exige modelar empresas/memberships, vincular produtos, compras, movimentos, convites, sessões e auditorias à empresa e validar o escopo em todas as consultas, índices únicos, exportações e ações. Apenas adicionar uma coluna ao convite não isola o estoque. Use instalações e bancos separados até essa evolução.

`users.active=0` significa bloqueado; `active=1` e `passwordHash IS NULL` significa pendente; hash preenchido significa ativo. A migração não altera hashes ou usuários. O telefone é adicionado sem obrigar registros legados a fornecer um valor. O perfil interno `collaborator` é exibido como Operador para manter compatibilidade com permissões existentes.

Administradores não definem senhas e não mudam o e-mail de outra conta por esta tela. Isso evita tomar posse de uma conta pela recuperação de senha. O próprio usuário recupera sua senha pelo e-mail. Bloquear ou alterar permissões encerra sessões e invalida convites pendentes; ao desbloquear uma conta pendente, reenvie o convite. Contas já ativas não recebem convites de ativação.

## Variáveis protegidas na Vercel

| Variável | Uso |
| --- | --- |
| RESEND_API_KEY | Chave real de envio, armazenada como Secret. Nunca NEXT_PUBLIC. |
| RESEND_FROM_EMAIL | No futuro, remetente com domínio próprio verificado. |
| APP_BASE_URL | Origem HTTPS exata desta instalação, sem caminho ou fragmento. |
| EMAIL_TEST_MODE | `true` para testes (também é o padrão quando ausente). `false` somente depois de validar domínio. |
| EMAIL_TEST_RECIPIENT | E-mail associado à conta Resend, confirmado no painel. |
| TURSO_DATABASE_URL / TURSO_AUTH_TOKEN | Banco de produção. |
| TURSO_PREVIEW_DATABASE_URL / TURSO_PREVIEW_AUTH_TOKEN | Banco separado e vazio para preview. Nunca igual ao banco de produção. |

Aliases antigos APP_URL, EMAIL_API_KEY e EMAIL_FROM são aceitos. EMAIL_API_URL foi removida: credenciais Resend são enviadas exclusivamente à API oficial HTTPS.

O remetente de testes é fixo: `PJ Estoque <onboarding@resend.dev>`. O destinatário precisa coincidir com EMAIL_TEST_RECIPIENT; nunca há redirecionamento de convites de terceiros para a caixa de teste. A restrição local não substitui a verificação do Resend. Uma resposta de aceitação da API não comprova entrega: confira o evento Delivered no painel e a caixa de entrada.

## Validação segura em preview

1. Crie banco gratuito separado. Não conecte a variável de produção ao preview.
2. Faça backup do banco vazio e aplique a migração explicitamente, inicializando um administrador de homologação com hash bcrypt e senha aleatória privada. Não copie usuários/senhas de produção para o preview.
3. Configure as variáveis acima no escopo Preview da branch `codex/account-invitations`.
4. Publique um preview; use sua origem exata em APP_BASE_URL e publique novamente ao mudar env.
5. Cadastre o destinatário autorizado pelo Resend **nesse banco separado**, receba o convite, ative e entre. Se o mesmo endereço existir na produção, ele continua intacto. Se já existir no preview, não sobrescreva: use a conta pendente ou um novo banco de testes.
6. Verifique expiração, reenvio, invalidação de links anteriores, senha, login, bloqueio/desbloqueio e ausência de mudanças no banco real.
7. Só depois de concluir as validações e revisar a migração publique em produção. Preview pode exigir login Vercel; essa proteção é independente do login do PJ Estoque.

## Backup e migração

Builds não executam DDL. Faça backup antes de cada migração, inclusive em homologação:

```powershell
$env:REPOR_BACKUP_DIR = Join-Path $env:LOCALAPPDATA 'PJEstoque/backups'
node --env-file=.qa/production.env scripts/backup-turso.mjs
# Use o caminho do manifesto retornado, sem publicar o arquivo.
$env:REPOR_BACKUP_MANIFEST = '<caminho-local-do-manifesto>.sqlite.json'
node --env-file=.qa/production.env scripts/migrate-turso.mjs
```

O backup lê uma transação consistente, reconstrói todas as tabelas/índices, confere contagens, integridade SQLite e chaves estrangeiras, e grava um manifesto SHA-256. A migração verifica checksum, banco de origem e idade máxima de uma hora antes de escrever. Guarde os arquivos fora do repositório; eles contêm dados pessoais e hashes. Teste a migração numa cópia local antes de aplicá-la no banco real.

`0001_account_invitations.sql` é aditiva: adiciona `users.phone` e `invitations`. Convites contêm somente hash SHA-256 de token aleatório de 256 bits, validade, autor, usuário, consumo e situação do envio. Tokens têm 24h; recuperação continua com 30min e tabela separada. O token via fragmento não é enviado em URLs/logs HTTP e é removido da barra de endereços. Ativação e consumo ocorrem numa transação com guarda de concorrência. Senhas usam bcrypt custo 12. Reenvio invalida o convite anterior e limita tentativas.

Rollback da aplicação: pode voltar ao deploy anterior sem remover as novas estruturas. **Não restaure o backup sobre uma produção que recebeu novas operações**: isso perderia dados posteriores. Uma restauração completa requer janela de manutenção, teste em novo banco e aprovação.

## Domínio próprio no futuro

1. Adquira um domínio por conta própria quando desejar (não é necessário para hospedar o app).
2. Adicione o domínio/subdomínio no painel Resend e configure os registros DNS indicados pelo provedor, mediante sua autorização.
3. Aguarde status Verified. Configure RESEND_FROM_EMAIL nesse domínio.
4. Para a validação automática de domínio, a chave do backend precisa poder ler a API de domínios (uma chave Sending access pode não permitir essa consulta). Configure a credencial apropriada como Secret, nunca no cliente. A aplicação falha de forma fechada se não puder confirmar o domínio no Resend.
5. Configure EMAIL_TEST_MODE=false apenas depois de testar a configuração; a aplicação consulta o status Verified antes de enviar. Isso não habilita multiempresa.
6. Publique primeiro em preview, teste entrega e recuperação e só então promova. Respeite as cotas do plano; não há envio ilimitado gratuito.

Referências oficiais: [restrições de resend.dev](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [consulta de domínios](https://resend.com/docs/api-reference/domains/list-domains).

## Testes

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
Os testes de transporte em `tests/invitations.test.ts` são simulados e explicitamente não comprovam entrega real. Os testes de negócio usam SQLite/libSQL real em bancos temporários. Testes reais de e-mail devem registrar separadamente aceitação, Delivered e ativação no preview.

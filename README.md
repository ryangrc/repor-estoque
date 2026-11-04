# Repor · Estoque e compras

Aplicação para pequenos negócios controlarem estoque, reposição e compras, com acesso de administrador e colaborador. Os exemplos opcionais são de uma hamburgueria; categorias e unidades são personalizáveis e o domínio não depende desse segmento. O portfólio na pasta acima permanece independente.

## Tecnologia e arquitetura

- React 19, TypeScript, Vinext/Vite e componentes acessíveis Base UI/Shadcn.
- Backend HTTP com validação e autorização em cada operação; sem autenticação simulada.
- SQLite relacional no desenvolvimento, emulado por Cloudflare D1; D1 persistente no Sites publicado.
- Drizzle para schema e migrations; consultas parametrizadas e transações via D1 `batch` nas operações compostas.
- Senhas com bcrypt (custo 12), sessões opacas no banco e tokens de recuperação/convite armazenados apenas como SHA-256.
- E-mail por API HTTPS compatível com Resend; funciona no runtime Workers sem sockets SMTP.

```text
app/                   Página, layout e endpoint /api
components/repor/      Telas, formulários e componentes do produto
components/ui/         Primitivas do gerador (não modificadas)
lib/domain.ts          Tipos, validações, classificação e transferência JSON
server/                Autenticação, segurança, estoque, compras e usuários
db/schema.ts           Modelo relacional
drizzle/               Migrations versionadas
tests/                 Regras e integração real com SQLite temporário
scripts/migrate.mjs    Aplicação das migrations locais
public/                Manifest, ícones e service worker
.openai/hosting.json   Identificação do Sites e binding lógico DB
```

## Instalar e executar

Requer Node.js 24 ou superior e npm. Execute os comandos **dentro desta pasta `estoque`**:

```sh
npm ci
npm run db:migrate
npm run dev -- --host 127.0.0.1 --port 3100
```

Abra `http://localhost:3100`. No primeiro acesso, a interface solicita nome, e-mail, senha e confirmação. Isso cria o primeiro administrador. Não há conta ou senha padrão. A configuração é encerrada de forma permanente após o primeiro cadastro; uma chave única também impede cadastros iniciais simultâneos.

O banco local fica em `.wrangler/state/v3/d1`. Ele não é enviado para a hospedagem e não deve ser incluído no Git. Os produtos fictícios só são adicionados quando o administrador escolhe **Experimentar com produtos fictícios**, em um estoque vazio.

O projeto usa Vinext porque o destino Sites executa Workers. Vinext ainda está em pré-lançamento; mantenha o lockfile e valide atualizações com os testes e o build. Os serviços de domínio são separados do adaptador HTTP, facilitando uma migração futura de runtime.

### Computadores com pouca memória disponível

Evite rodar o servidor de desenvolvimento e o build ao mesmo tempo. No PowerShell, antes de iniciar:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1536'
$env:RAYON_NUM_THREADS='1'
$env:GOMAXPROCS='1'
npm run dev -- --host 127.0.0.1 --port 3100
```

## Variáveis de ambiente e e-mail

`.env.example` contém somente nomes, sem credenciais. No desenvolvimento, copie-o para `.env` ou configure `.dev.vars` conforme o runtime Cloudflare. Ambos são ignorados pelo Git. No Sites, configure os valores pelo gerenciamento de variáveis/segredos da plataforma:

| Variável | Uso |
| --- | --- |
| `APP_URL` | Origem canônica da aplicação, sem barra final; usada para links de recuperação. Em produção, HTTPS. |
| `EMAIL_API_KEY` | Chave secreta do provedor de e-mail. |
| `EMAIL_FROM` | Remetente autorizado/verificado pelo provedor. |
| `EMAIL_API_URL` | Endpoint HTTPS de envio, opcional; o padrão interno é a API Resend. |

Não é necessário `DATABASE_URL`: a conexão usa o binding `DB`. Também não há segredo fixo de assinatura de sessão: são utilizados tokens aleatórios de 256 bits, com hash no banco. Nenhuma variável secreta possui prefixo público nem é lida pelo frontend.

Sem provedor configurado, o sistema continua funcionando, informa ao administrador que os convites estão indisponíveis e mantém a resposta genérica da recuperação. Não imprime links ou tokens em logs e não simula envio. **Entrega real de e-mails depende da configuração e validação do remetente.**

Recuperação: token criptograficamente aleatório, validade de 30 minutos e uso único. Convites: validade de 24 horas. O token vai no fragmento do link, é removido da barra de endereço pela página e enviado somente no corpo JSON. Definir uma nova senha invalida os demais tokens e todas as sessões da conta. O fluxo é testado com um provedor de e-mail em memória, sem enviar mensagens reais.

## Banco e migrations

Entidades: `users`, `roles`, `products`, `categories`, `stockMovements`, `shoppingLists`, `shoppingListItems`, `auditLogs`, `passwordResetTokens`, `sessions`, `limits` e `setup`. Há chaves estrangeiras, unicidade de e-mail/nome de produto, uma única lista aberta e índices para acesso às sessões.

```sh
npm run db:generate
npm run db:migrate
```

Revise a migration gerada antes de aplicar. Não altere migrations já publicadas: gere uma nova. O Sites aplica as migrations durante a publicação, antes de servir a versão. O banco de QA pode ser separado definindo `QA_STATE_DIR=.wrangler/qa` tanto para a migration quanto para o servidor de desenvolvimento. Essa variável é apenas de ferramenta local, não um segredo ou um recurso de autenticação.

Faça backups do D1 pelos recursos da plataforma antes de mudanças destrutivas. A exportação de compras é uma transferência de lista, **não um backup completo** do banco. As exclusões de produtos/categorias são lógicas. Produtos usados em listas abertas ou aguardando entrada não podem ser arquivados.

## Permissões e segurança

Em **Usuários → Criar usuário**, o administrador define uma senha e sua confirmação para outro administrador ou colaborador, com acesso imediato sem depender de e-mail. Em **Editar usuário**, pode definir uma nova senha inclusive para contas antigas sem senha; deixar os dois campos vazios mantém a senha atual. O botão de olho revela somente o que está sendo digitado. Senhas são salvas apenas como hash bcrypt e nunca retornam na API nem no histórico. Redefinir a senha encerra as sessões, invalida os links pendentes e limpa o bloqueio de tentativas de login da conta. Colaboradores não podem gerenciar senhas de outras contas.

A recuperação por e-mail exige configurar o provedor e validar o remetente; comprar o domínio, por si só, não habilita o envio.

Administradores gerenciam produtos, categorias, usuários, mínimos, ideais e ajustes manuais. Colaboradores consultam produtos, participam da lista, deixam observações e sinalizam reposição. Contagens de estoque dependem da permissão `canUpdateStock`, que o administrador pode revogar. Desativar ou alterar uma conta encerra as sessões e invalida tokens pendentes. Alterações não podem remover o último administrador ativo.

O backend identifica o autor pela sessão; IDs enviados pelo cliente não determinam a autoria. Movimentações registram valor anterior, novo valor, diferença, autor, data, motivo e observação. Atualizações usam revisão otimista: dados desatualizados são rejeitados em vez de sobrescrever alterações recentes. Operações compostas usam transações, incluindo guardas que cancelam o lote quando uma condição concorrente deixa de ser válida.

- Cookie de sessão `HttpOnly`, `SameSite=Strict`, `Secure` em HTTPS, duração de oito horas e exclusão no logout.
- Proteção de escrita com validação de origem e token CSRF da sessão; sem CORS aberto.
- Validação de tipos, limites e permissões no servidor; React escapa textos, sem HTML vindo dos arquivos.
- Headers de segurança e CSP com `object-src 'none'`, `base-uri 'self'` e `form-action 'self'`. Scripts inline são permitidos pela necessidade de hidratação do framework; não há HTML arbitrário executável na aplicação.
- Cinco tentativas de login consecutivas por identificador, com janela de 15 minutos; limitação adicional por IP da plataforma e recuperação de senha. Um login válido limpa o contador. E-mails desconhecidos recebem mensagens genéricas.
- Senhas: mínimo de 10 caracteres, maiúscula, minúscula, número e símbolo. O limite de 72 **bytes UTF-8** evita o truncamento silencioso do bcrypt; senhas Unicode podem atingir esse limite com menos de 72 caracteres.
- Tokens e hashes nunca aparecem nos arquivos de compra, nas respostas de estado ou na auditoria. Senhas não são armazenadas no navegador.
- API e páginas sem cache de dados autenticados. O service worker não guarda respostas do estoque.

Referências: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) e [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Estoque e compras

Classificação automática: crítico quando atual ≤ mínimo; atenção quando mínimo < atual < ideal; OK quando atual ≥ ideal. O administrador pode sobrescrever a classificação e a ação é auditada. A faixa amarela não é apresentada como previsão garantida de um ou dois dias: ainda não há dados suficientes de consumo para isso. A função de domínio pode receber futuramente uma política de consumo diário.

Sugestão de compra = `max(0, ideal - atual)`. O usuário pode ajustar a quantidade. Reposições críticas/sinalizadas podem ser sugeridas para a lista. Marcar como comprado não mexe no estoque. **Finalizar compra** registra data, responsável e observação; itens não comprados passam para a próxima lista. **Registrar entrada** adiciona a quantidade recebida ao estoque uma única vez, com histórico. Somente execute a entrada após conferir a chegada física dos produtos.

## Importação e exportação

Na lista, **Exportar lista** gera JSON v1 com somente os itens ainda não comprados. Envie esse arquivo por WhatsApp ou outro meio, abra o Repor no outro dispositivo e escolha **Importar lista**.

Campos: `app`, `version`, `generatedAt`, `list`. Cada item contém nome, categoria, unidade, quantidade de compra, quantidade atual de referência, sugestão e observação. O formato não transporta identidade de sessão nem credenciais.

O backend valida versão, tipos, quantidade de itens (1–500), tamanho (até 500 KB), duplicados e números finitos/não negativos. A prévia diferencia produtos novos, existentes, duplicados na lista, unidades incompatíveis e produtos arquivados. O administrador escolhe manter duplicados ou substituir explicitamente quantidade/observação da compra. Unidades incompatíveis e itens arquivados precisam ser resolvidos antes de importar. Produtos novos são criados com estoque zero para conferência; o estoque de referência do arquivo nunca é aplicado como contagem física.

## Testes e qualidade

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

Os testes usam SQLite real em memória, aplicam as migrations e chamam o mesmo backend da aplicação. Geram credenciais efêmeras em tempo de execução. Cobrem classificação, cálculo, formato e exportação segura, primeiro administrador, cookies, CSRF/origem, autorização, autoria, contagem, revisão desatualizada, compra sem entrada automática, prevenção de entrada duplicada, importação/conflitos, convites, tokens com hash, expiração/uso único, logout e bloqueio temporário de login.

O lint cobre o código da aplicação. Os componentes e hooks fornecidos pelo gerador são mantidos como dependência vendorizada, sem alterações; todos os arquivos continuam incluídos na checagem TypeScript.

## Produção e publicação

```sh
npm run build
npm start -- --ip 127.0.0.1 --port 3100
```

O comando `start` serve o Worker compilado localmente; aplique `db:migrate` antes. O lançador `scripts/start.mjs` usa `.wrangler/state` na raiz (ou `QA_STATE_DIR`) e carrega `.env`/`.env.local` da raiz por caminhos absolutos. Assim, o build em `dist/server` reutiliza o banco inicializado pelo comando de migration, sem criar outro banco dentro de `dist`. A porta padrão é 8787; mantenha `APP_URL` alinhada ao endereço escolhido para os links de recuperação. Produção hospedada utiliza Sites, o `project_id` persistido em `.openai/hosting.json`, o binding D1 `DB`, o build Worker e as migrations. Segredos devem ser configurados na plataforma. Nunca use o servidor de desenvolvimento como servidor público de produção.

A primeira publicação é privada para o proprietário no Sites. Isso adiciona uma camada de acesso da plataforma, além do login próprio do Repor. Para uso com funcionários, o proprietário deve configurar conscientemente o público da hospedagem e enviar os convites da aplicação. Cada instalação atende um negócio; não é uma plataforma multiempresa.

## PWA e evolução

Manifest, ícones, instalação suportada pelo navegador e service worker com página de falha de conexão. A aplicação exige rede para os dados protegidos. Não há promessa de edição offline nem sincronização automática entre instalações. Uma implantação compartilhada já centraliza os dados no backend; arquivos JSON atendem à transferência entre instalações/dispositivos.

O frontend responsivo e a API separada permitem empacotamento futuro com Capacitor ou outra camada Android/iOS, desde que cookies, origem, armazenamento seguro e recuperação de conta sejam reavaliados para o ambiente nativo. Fora do escopo: caixa/POS, financeiro, fiscal e RH.

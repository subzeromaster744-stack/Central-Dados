# Central-Dados · Qualidade do óleo

App web para registrar a qualidade do óleo das máquinas e da Central de Fluidos. Substitui o Power App "Registro da qualidade do óleo".

Ele roda na Cloudflare (Worker com arquivos estáticos) e guarda os dados no banco D1 `central-dados`.

## O que tem

- **Usuários com senha:** o admin cria cada pessoa com usuário, senha provisória, departamento e turno (Admin › Usuários). No primeiro acesso a pessoa cria a própria senha; depois pode trocar em "Minha conta". Se esquecer, o admin redefine. Cada um vê só as telas do seu departamento; o admin vê todos, separados.
- **Primeiro acesso do admin:** usuário `admin` com a senha do Secret `ADMIN_PASSWORD`. Essa combinação sempre funciona, para recuperar o acesso se a senha do admin for esquecida.
- **Central de Fluidos:** 3 etapas (data e turno → pH e concentração → produto e consumo), com o custo calculado na hora.
- **Máquinas individuais:** uma tela para os 6 óleos (6002, 2001, Houghto 5089, MQL, Diagrind 535, Microcut 515). O preço vem do CT cadastrado.
- **Histórico:**
  - busca e filtro por período;
  - totais de reposição e custo;
  - edição e exclusão, com "Desfazer";
  - exportação para Excel (CSV com `;` e vírgula decimal).
- **Admin** (com senha):
  - centros de trabalho e o preço de cada um;
  - importação de vários CTs colados do Excel;
  - preços dos produtos da Central;
  - tabela de máquinas.
- **Informações:** máquinas, volumes e concentração alvo.

As regras (óleos, limites, produtos de cada departamento) ficam em `public/config.js`. A tela e a API usam o mesmo arquivo, então a validação é igual nas duas pontas.

## Estrutura

```
public/        tela (index.html, app.js, style.css) e regras (config.js)
src/worker.js  API em /api/*
migrations/    tabelas do banco D1
wrangler.jsonc configuração da Cloudflare
```

## Publicar (uma vez)

1. Cloudflare → **Workers & Pages** → **Create** → **Import a repository** → escolha `Central-Dados`.
   O nome do Worker deve ser `central-dados`, e o comando de deploy fica o padrão (`npx wrangler deploy`).
2. No Worker → **Settings** → **Variables and Secrets**, crie os Secrets:
   - `ADMIN_PASSWORD`: senha do usuário `admin`, usada no primeiro acesso e para recuperar o acesso.
3. A partir daí, cada push na `main` publica sozinho.

O banco D1 `central-dados` já existe e já tem as tabelas. Se um dia uma nova migração for adicionada, rode `npm run migrar`.

## Primeiro uso

Entre em **Admin**:

1. Cadastre os CTs: um a um, escolhendo o CSV exportado da lista "CTs e Preços II" do SharePoint, ou colando do Excel (`CT;óleo;seção;preço`). Um mesmo CT pode ter mais de um óleo (ex.: emulsão e MQL).
2. Preencha os preços da Central de Fluidos.
3. Cadastre as máquinas da tela Informações.
4. Em **Importar histórico**, escolha os CSV exportados das listas "Relatório óleo Central de Fluidos" e "Relatório óleo Máquinas Individuais". Importar de novo não duplica: cada registro guarda o ID de origem.

O menu avisa o que ainda está sem preço.

## Rodar no computador

```
npm install
echo ADMIN_PASSWORD=teste > .dev.vars
npm run dev
```

## Segurança

Todas as telas e a API exigem login. Senhas são guardadas com PBKDF2 (nunca em texto). Quem não é admin só lê e grava no próprio departamento, e isso é conferido no servidor.

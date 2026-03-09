# Originais Lumine - Replica Base44

Aplicação web em HTML/CSS/JS com layout e fluxos inspirados no app `originais.base44.app` a partir das capturas enviadas.

## Telas replicadas
- `Dashboard`
- `Cronograma` (Gantt mensal)
- `Projetos` (tabela + filtros + importação CSV)
- `Configurações` (abas por entidade)

## Funcionalidades
- CRUD de projetos (novo, editar, excluir)
- Gantt com edição rápida no gráfico (`◀`, `▶`, `-`, `+` em cada etapa)
- Atalho `+ Novo Projeto` dentro do cronograma
- Dashboard com métricas e gráficos por ano/status/categoria/natureza/duração e tempo médio por etapa
- Configurações globais para categorias, tipos de produção, formatos, naturezas, durações, status e etapas
- Importação do pacote Base44 (9 CSVs de export) na aba Projetos

## Modelo de dados (localStorage)
Chave: `originais_lumine_state_v2`

- `settings.categories[]`
- `settings.productionTypes[]`
- `settings.formats[]`
- `settings.natures[]`
- `settings.durations[]`
- `settings.statuses[]`
- `settings.stages[]` `{ id, name, color }`
- `projects[]`:
  - `{ id, code, title, year, category, productionType, format, nature, duration, status, budget, spent, notes, stages[] }`
  - `stages[]`: `{ id, stageId, start, end }`
- `timeline`: `{ start, end }` (YYYY-MM)

## Importar Base44
1. Clique em `Importar Base44 CSV` na aba `Projetos`.
2. Selecione os arquivos:
   - `Category_export.csv`
   - `Duration_export.csv`
   - `Format_export.csv`
   - `Nature_export.csv`
   - `ProductionType_export.csv`
   - `Project_export.csv`
   - `ProjectStatus_export.csv`
   - `Stage_export.csv`
   - `StageType_export.csv`
3. O app normaliza os relacionamentos e substitui o estado local pela base importada.

## Uso
Abra `index.html` no navegador.

## Supabase (dados compartilhados entre usuários)
Para que convites/login funcionem em qualquer navegador/dispositivo, configure um backend compartilhado.

### Concorrência multiusuário (importante)
O app usa sincronização com **merge em 3 vias** (base local + edição local + estado remoto) para evitar perda silenciosa quando dois usuários editam ao mesmo tempo.

- Edições em `Projetos` e `Etapas` são mescladas por campo/registro.
- Se dois usuários editarem campos diferentes do mesmo projeto, os dois valores são preservados.
- As alterações são registradas em `state.auditLogs` (dentro do `app_state`) com:
  - data/hora
  - usuário (nome/e-mail)
  - entidade (`project` / `project_stage`)
  - ação (`create` / `update` / `delete`)
  - campos alterados (`from` / `to`)

Limite de retenção: últimos `2000` eventos.

### 1) Criar tabela no Supabase (SQL Editor)
```sql
create table if not exists public.app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "allow read app_state" on public.app_state;
drop policy if exists "allow write app_state" on public.app_state;

create policy "allow read app_state"
on public.app_state
for select
to anon
using (true);

create policy "allow write app_state"
on public.app_state
for insert
to anon
with check (true);

create policy "allow update app_state"
on public.app_state
for update
to anon
using (true)
with check (true);
```

### 2) Configurar `config.js` com DEV/PROD separado (recomendado)
Use o formato abaixo no `config.js`:

```js
window.__ORIGINAIS_SUPABASE__ = {
  mode: "auto",
  environments: {
    local: {
      url: "https://SEU-PROJETO.supabase.co",
      anonKey: "SUA_ANON_KEY",
      stateId: "originais-dev"
    },
    production: {
      url: "https://SEU-PROJETO.supabase.co",
      anonKey: "SUA_ANON_KEY",
      stateId: "originais-main"
    }
  }
};
```

Com `mode: "auto"`:
- local (`file://`, `localhost`, `127.0.0.1`) grava em `originais-dev`
- web publicada grava em `originais-main`

Assim, ajustes locais nao sobrescrevem dados da web.

### 3) Publicar novamente
Suba os arquivos atualizados (`index.html`, `script.js`, `config.js`).

## Fluxo seguro de testes (sem risco para a web)
1. Teste localmente: os dados irao para `originais-dev`.
2. Valide tudo no local.
3. Publique os arquivos na web.
4. Na web, os dados usados serao os de `originais-main`.

Se precisar forcar ambiente manualmente:
- `?env=local`
- `?env=production`

Quando configurado, o app:
- continua salvando localmente (fallback);
- sincroniza o estado no Supabase;
- compartilha usuarios/projetos/configuracoes entre navegadores no `stateId` do ambiente.

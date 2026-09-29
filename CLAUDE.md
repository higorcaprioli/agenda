# AGENDA HC — instruções para o Claude Code

Agenda pessoal do Higor (PWA + APK Android), em português do Brasil.
Site publicado: https://higorcaprioli.github.io/agenda/ (GitHub Pages, branch `main`, pasta raiz).

## Regras de trabalho (sempre)

1. **A cada mudança publicada, aumente a versão em `sw.js`**: `const VERSION = 'agenda-vNN'` → `NN + 1`.
   Sem isso, o celular continua com a versão antiga guardada. (Se criar um arquivo novo que o app
   carrega, inclua-o também na lista `SHELL` do `sw.js`.)
2. **Publicar = commit direto na branch `main` + push.** O GitHub Pages publica em ~1–2 min e o app
   instalado se atualiza sozinho (recarrega ao detectar versão nova). Não deixe mudanças só num PR,
   a menos que o Higor peça.
3. Textos da interface em **português (BR)**. Mensagens de commit em português.
4. **Mobile primeiro** (a maior parte do uso é no celular Android). No PC, cada página é uma folha A4.
5. Teste o que der antes de publicar (sintaxe dos módulos, telas afetadas). Não invente que testou.
6. Nunca coloque segredos no repositório (ele é **público**). A config do Firebase em
   `firebase-config.js` pode ficar (não é secreta; a segurança está nas regras do Firestore).
7. Não mude o endereço do site, o ID do pacote Android (`agenda.hc.group`) nem a estrutura dos
   dados salvos sem avisar: isso quebra o APK instalado ou os dados já existentes.

## Arquitetura

HTML/CSS/JS puro, sem build e sem npm. Módulos ES carregados direto pelo navegador.

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura: barra superior, abas, `<main id="app">`, diálogo da conta |
| `theme.js` | Tema claro/escuro, cores e fonte (script comum no `<head>`, aplica antes de desenhar) |
| `app.js` | Todas as telas, roteamento por `#/hash`, eventos |
| `store.js` | Salvamento: localStorage + sincronização com Firestore (login Google) |
| `gsync.js` | Envio ao Google Agenda (eventos) e Google Tarefas |
| `holidays.js` | Feriados do Brasil calculados para qualquer ano |
| `sw.js` | Service worker (offline). **Versão aqui.** |
| `styles.css` | Estilos. Cores em variáveis (`--ink`, `--pen`, `--hl`, `--hol`, `--ev`...) com modo escuro |
| `manifest.webmanifest` | Nome AGENDA HC, ícones, atalhos |
| `privacidade.html` | Política de privacidade (contato: higoreducare@gmail.com) |
| `download/agenda-hc.apk` | APK Android (TWA gerada no PWABuilder) |

Rotas: `#/hoje`, `#/dia/AAAA-MM-DD`, `#/mes/AAAA-MM`, `#/ano/AAAA`, `#/objetivos/AAAA`, `#/notas`, `#/menu`.
Ordem das abas: **Ano · Mês · Hoje · Objetivos · Anotações** (Hoje no meio; o app abre em Hoje).

## Dados (documentos no Firestore `users/{uid}/docs/{id}` e no localStorage `agenda:v1:{id}`)

Cada documento é `{ data, updatedAt }`; vence o mais recente.

- `day:AAAA-MM-DD` → `{ hl, hours: { "10a": "texto", "10b": ... }, spans: { "10a": 4 }, tasks: [{ id, text, done }], notes }`
  - horários de 6h às 22h, `a` = :00, `b` = :30; `spans` = horário esticado (nº de meias-horas)
- `month:AAAA-MM` → `{ lines: { "1": "texto", ... } }`
- `goals:AAAA` → `{ items: [{ title, steps: [{ t, done }×6], start, due, notes }] }`
- `notes` → `{ cats: [{ id, title, items: [{ id, text, done, urgent }] }] }`
- `events` → `{ items: [{ id, title, m (0-11), d, yearly, y? }] }` (aniversários/datas anuais)
- `settings` → `{ theme, ev, hl, hol, font }`
- `gsync:config` e `gsync:AAAA-MM-DD` → estado do envio ao Google (não editar à mão)

## Detalhes importantes

- Seção **Desenvolvimento** (painel do botão verde) aparece só para o criador: `CREATOR_UID` em `app.js`.
- Google Agenda: eventos vão para a agenda "Agenda HC" com cor azul (`colorId` 9); tarefas para a lista
  "Agenda HC" do Google Tarefas. Escopos: `calendar.app.created` e `tasks`.
- Firebase: projeto `agenda-hcn`. Login Google por popup.
- A chave de assinatura do APK **não** está no repositório (fica no PC do Higor, pasta `android/`).
  Gerar um APK novo só é necessário se mudar nome, ícone ou endereço; mudanças no site chegam sozinhas.

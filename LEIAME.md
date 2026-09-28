# Agenda

Agenda pessoal em formato de app (PWA): calendário anual, planejamento do mês,
objetivos do ano e a página do dia. Ela abre sempre no dia de hoje.
Funciona no celular e no PC (no PC, cada página é uma folha A4).

| Aba | O que tem |
|---|---|
| **Hoje** | Folha do dia: horários das 7h às 21h (2 linhas por hora), lista de tarefas, notas, semana e dia do ano. O botão *Destacar* marca o dia no calendário anual. |
| **Mês** | Planejamento linear com uma linha por dia, feriados e domingos destacados. Tocar no número abre a página do dia. |
| **Ano** | 12 meses com os feriados. Dias destacados ficam em amarelo, dias com anotação ficam sublinhados. Tocar em um dia abre a página dele. |
| **Objetivos** | OBJ (2 linhas), 6 etapas com progresso, Início / Prazo e quadro de anotações. O botão **+** adiciona mais objetivos. |

Arquivos: `index.html`, `styles.css`, `app.js` (telas), `store.js` (salvamento e sincronia),
`holidays.js` (feriados calculados para qualquer ano), `firebase-config.js`, `sw.js` (offline),
`manifest.webmanifest` e `icons/`.

---

## 1. Testar no PC (opcional)

Na pasta da agenda:

```
python -m http.server 8000
```

Abra http://localhost:8000. Sem o Firebase configurado, a agenda funciona em **modo local**
(salva só naquele navegador).

## 2. Configurar o Firebase (sincronia celular ↔ PC)

1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto**
   (pode ser `minha-agenda`; o Google Analytics não é necessário).
2. **Criação → Authentication → Vamos começar → Google**: ative e salve.
3. **Criação → Firestore Database → Criar banco de dados**: modo de produção,
   local `southamerica-east1 (São Paulo)`.
4. No Firestore, abra a aba **Regras**, cole o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.
5. Abra a **engrenagem → Configurações do projeto → Seus apps → ícone Web `</>`**.
   Registre o app como "Agenda" (não marque o Firebase Hosting).
6. Copie o objeto `firebaseConfig` que aparecer e cole no arquivo `firebase-config.js`,
   substituindo o `null`.
7. Abra **Authentication → Configurações → Domínios autorizados → Adicionar domínio** e
   adicione `SEU-USUARIO.github.io`.

> As chaves do `firebaseConfig` não são senhas: podem ficar num repositório público.
> Quem protege os dados são as regras do passo 4, que só deixam você acessar a sua agenda.

## 3. Publicar no GitHub Pages

1. Em https://github.com/new, crie um repositório chamado `agenda` (**público**:
   o GitHub Pages gratuito exige isso. Os seus dados ficam no Firebase, não no repositório).
2. No repositório, clique em **Add file → Upload files**, arraste **o conteúdo** desta pasta
   (o `index.html` precisa ficar na raiz) e clique em **Commit changes**.
3. Vá em **Settings → Pages → Build and deployment**, escolha Source *Deploy from a branch*,
   Branch `main`, pasta `/ (root)`, e clique em **Save**.
4. Em cerca de 1 minuto, a agenda estará em `https://SEU-USUARIO.github.io/agenda/`.

## 4. Instalar como app

- **Android (Chrome):** menu ⋮ → **Instalar app** (ou *Adicionar à tela inicial*).
- **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.
- **PC (Chrome/Edge):** ícone de instalar na barra de endereço.

Depois de instalado, toque em **Entrar** (canto superior direito) e entre com a sua conta Google.
Faça o mesmo no outro aparelho. O ponto verde significa que está tudo sincronizado.
A agenda também funciona sem internet: as alterações são enviadas quando a conexão voltar.

## 5. Atualizar o app depois de mudanças

1. Suba os arquivos alterados para o GitHub.
2. No `sw.js`, troque `const VERSION = 'agenda-v1'` para `'agenda-v2'` (e assim por diante).
   Assim os aparelhos baixam a versão nova.
3. A atualização aparece na segunda vez que você abrir o app.

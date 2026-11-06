# Configuração do Louvor-IBFCG

Passos para o app funcionar com dados salvos na nuvem.

## 1. Criar o projeto no Firebase

1. Abra https://console.firebase.google.com e clique em **Adicionar projeto**.
2. Crie um projeto (o nome é livre).
3. Em **Authentication → Sign-in method**, ative **Anônimo**. É o que o app usa.
4. Em **Authentication → Sign-in method**, ative também **E-mail/senha**.
   É o login de membros e administradores (Perfil → Entrar).
5. Em **Firestore Database**, crie o banco em modo produção.

> **Storage não é usado.** Os áudios dos kits e do Repertório são guardados
> em partes dentro do próprio Firestore (seção 9), então não é preciso criar
> bucket nem ativar o Firebase Storage — inclusive porque ele não está
> disponível no plano gratuito deste projeto.

## 2. Preencher as credenciais

Copie o objeto `firebaseConfig` de **Project settings → General → Your apps → SDK setup and configuration**.

Abra `src/environments/environment.ts` e troque os valores:

```ts
firebase: {
  apiKey: 'AIza...',
  authDomain: 'seu-projeto.firebaseapp.com',
  projectId: 'seu-projeto',
  storageBucket: 'seu-projeto.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:abcdef',
}
```

Faça a mesma coisa em `src/environments/environment.prod.ts`.

## 3. Enviar as regras de segurança

Com o Firebase CLI instalado (`npm i -g firebase-tools`), na pasta do projeto:

```
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

Isso aplica `firestore.rules`. Veja a seção 10 para a
ordem correta (cadastre os administradores no Console antes de enviar).

### 3.1 Realtime Database (presença online/offline)

O app mostra quem está online na tela de Participantes usando o
**Realtime Database** do Firebase (plano Spark, grátis). Ative assim no
Console (**Firefox**):

1. No menu lateral, em **Build**, clique em **Realtime Database** →
   **Create database**.
2. Escolha o local **us-central1** e a opção **Start in locked mode** →
   **Enable**.
3. Na aba **Rules** do banco recém-criado, apague o conteúdo e cole o
   conteúdo do arquivo `database.rules.json` do projeto, depois clique em
   **Publish**:

   ```json
   {
     "rules": {
       "presenca": {
         ".read": "auth != null",
         "$uid": {
           ".write": "auth != null && auth.uid === $uid"
         }
       }
     }
   }
   ```

4. Ainda na aba **Data**, copie a **URL** do banco (algo como
   `https://louvor-ibfcg-default-rtdb.firebaseio.com`) e cole em
   `databaseURL: '...'` **nos dois** arquivos
   `src/environments/environment.ts` e `src/environments/environment.prod.ts`.
5. Rebuild (`npm run build` e `npx cap sync android`).

> Sem a URL preenchida o app funciona normalmente — só não mostra a
> bolinha de online/offline em Participantes.

**Depois disso, desative o login anônimo**: em **Authentication →
Sign-in method**, clique em **Anonymous** → **Disable** → **Save**. O app
não usa mais login anônimo; todo mundo entra com e-mail e senha.

## 4. Logo da igreja

A logo oficial é **`src/assets/img/logo_IBFCG.png`** (512×481, fundo
transparente). É dela que saem:

- o **favicon / ícone do navegador** (`src/assets/icon/favicon.png`);
- os **ícones e splash do Android** (`android/app/src/main/res/`);
- o ícone exibido na tela inicial do app.

Para regerar tudo a partir da logo, rode (PowerShell):

```
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\opencode\gera-icones.ps1"
```

A tela inicial também usa `src/assets/logo-igreja.svg` quando ele existe.

## 5. Rodar

```
npm start          # desenvolvimento
npm run build      # produção
ionic serve        # com o servidor do Ionic
npx cap sync       # depois de gerar o app nativo
```

## 6. Cifras do Cifra Club (2)

O app busca cifra em **duas origens, nesta ordem** (`CifraService.basesCifra()`):

| # | Origem | Quando é usada | Fonte que responde |
|---|---|---|---|
| 1 | `cifraApi.baseUrl` → `http://localhost:3001` | no seu PC, com o servidor local ligado | **Cifra Club** (direto) |
| 2 | `cifraApi.fallbackUrl` → API pública na Vercel | celular, ou PC com o servidor desligado | **Cifra Club** (por ponte) + Cifralize |

As **duas têm a cobertura completa do Cifra Club**. A diferença é só o
caminho: o local acessa o site direto; a Vercel, bloqueada pela Akamai,
passa pelo leitor público `r.jina.ai` (ver 6.2).

Se a primeira nem responder (porta fechada, timeout, 5xx), o app cai
automaticamente para a segunda. **A tela nunca quebra por causa disso.**

### 6.1 API local (cobertura completa)

1. Instale o Node.js. As dependências já foram instaladas nesta cópia do projeto.
2. Suba a API na porta 3001 (e o app) com **um comando só**:

   ```
   npm run dev
   ```

   Só a API, se o app já estiver rodando em outro terminal:

   ```
   npm run start:cifra
   ```

3. Teste: `http://localhost:3001/api/cifra-club-2?artist=legiao-urbana&song=tempo-perdido`
   deve devolver JSON com `"cifra": [...]`.

> O `npm run dev` continua no ar mesmo se a API cair: só avisa no terminal
> (`API local fora. O app segue e usa a API da Vercel.`).

### 6.2 API pública na Vercel (celular / fora de casa)

Publicada em **`https://louvor-ibfcg-cifraclub-api-2.vercel.app`**
(projeto `louvor-ibfcg-cifraclub-api-2`, pasta `cifraclub-api-2/`).

- Raiz (`/`) devolve JSON com o modo de usar — não é 404.
- Endpoint: `/api/cifra-club-2?artist=<slug>&song=<slug>` (mesmo formato do local).
- **Redeploy** (após mudar `cifraclub-api-2/`):

  ```
  cd cifraclub-api-2
  vercel --prod --yes
  ```

  A pasta `.vercel/` na raiz do projeto já está vinculada (conta `af148`).

> **Como a Vercel contorna o bloqueio:** o Cifra Club usa Akamai e **bloqueia
> IP de datacenter** (testado: mesmo código retorna 403 da Vercel e 200 do seu
> PC). Quando o acesso direto dá 403, a API busca a mesma página pelo
> **`r.jina.ai`** (leitor público, sem chave) e recebe o HTML original — o
> parser continua o mesmo. Resultado: **celular com os servidores desligados
> busca cifra no Cifra Club igual ao PC**.
>
> - Limite do leitor: **20 requisições por minuto** (cabeçalho
>   `x-ratelimit-limit`). Buscar 1 louvor usa 1 ou 2.
> - Se estiver fora de cota, a API cai no **Cifralize** e, na falta dele,
>   avisa *"O Cifra Club bloqueou esta consulta (403). Tente de novo em
>   alguns segundos."*
> - Os scripts de conferência estão em `cifraclub-api-2/diagnostico/`
>   (`testa-jina.js`, `testa-jina-rajada.js`, `compara-local-vercel.js`).

### 6.3 Usando a busca

No formulário do louvor, use **Buscar letra e cifra**. Preencha título e
artista como aparecem no Cifra Club (ex.: artista `coldplay`, título
`the-scientist`).

> Se a música não existir nas duas fontes, o app avisa e você digita
> manualmente. Use o título/artista como aparecem no Cifra Club — se a música
> for um refrão dentro de outra (ex.: "Minha Vitória está em Ti", que está em
> "O Hino"), busque pela música principal.
>
> Obs.: `artist` e `song` vão em minúsculas, sem acento e com hífens
> (`"Jeová Rafá"` → `jeova-rafa`); o app já faz isso sozinho.

## 7. Importar playlists do YouTube

A tela **Playlists** tem o botão **Importar do YouTube** (ícone de nuvem na
barra de título ou ao lado da busca). Cole o link da playlist (`list=...`)
ou de um vídeo e o app salva a playlist no Firestore. Em seguida abre a
lista de vídeos com miniatura, e cada linha toca o vídeo **dentro do app**
(player embutido, com anterior/próxima e botão "Abrir no YouTube").

Também funciona o compartilhamento: mande o link do YouTube **para o app**
(Android oferece o Louvor-IBFCG na lista de compartilhamento) ou abra o link com
`?youtubePlaylist=...` na web.

1. Abra https://console.cloud.google.com e crie (ou escolha) um projeto.
2. **APIs & Services → Library → YouTube Data API v3 → Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Copie a chave para `youtube.apiKey` em `src/environments/environment.ts`
   e `environment.prod.ts`:

```ts
youtube: {
  apiKey: 'AIza...',
},
```

> A chave é gratuita para o uso de uma igreja (10.000 unidades/dia; cada
> playlist gasta 1 unidade por página de 50 vídeos). Restrinja a chave à
> YouTube Data API v3 no Console para protegê-la.
>
> Sem a chave o botão avisa "Chave da YouTube Data API não configurada".

## 8. Playlist do YouTube a partir de um vídeo

Quando o link colado/importado é de **um vídeo só** (comum ao compartilhar
pelo WhatsApp), o app tenta descobrir a **playlist/álbum do CD** a que o
vídeo pertence e importa a playlist inteira; se não achar, importa apenas
o vídeo.

- A descoberta usa o serviço antigo em `cifraclub-api/` (Flask + Selenium),
  separado da nova API de cifras. O endpoint
  `GET /youtube/playlist-do-video?video_id=...` abre a página do vídeo e lê a
  playlist referenciada. Esse recurso opcional ainda precisa do Docker; sem ele
  (ou sem `youtubePlaylistApi.baseUrl`), o comportamento volta ao
  antigo: importa só o vídeo.
- Leva de 5 a 20 segundos a mais na importação; o botão fica com spinner.
- O YouTube às vezes bloqueia consultas automatizadas do IP ("unusual
  traffic"). Nesse caso o app importa só o vídeo e avisa — depois de um
  tempo sem consultas o bloqueio passa sozinho, ou use o caminho certo:
  copie o **link da playlist** (o que tem `list=...`), que vem direto da
  Data API e nunca é bloqueado.
- As miniaturas dos vídeos vêm do próprio YouTube (i.ytimg.com) e não usam
  a chave da Data API.

## 9. Kit musical (gravação dos administradores)

A tela **Kit musical** (menu lateral) deixa os administradores gravarem kits
de músicas pelo microfone do aparelho e os membros ouvirem no app.

- **Quem grava:** só os administradores (coleção `admins` — seção 10).
  Os outros membros veem a lista e ouvem as faixas.
- **Como gravar:** botão **Gravar kit** → título → **Gravar música** →
  **Parar** → ouça a prévia, dê o nome da música → **Adicionar faixa**
  (repete quantas vezes quiser) → **Salvar kit**.
- **Áudio gravado em outro app:** no modal de gravação há o botão
  **Usar arquivo já gravado** — escolhe um mp3/m4a/wav gravado em qualquer
  aplicativo (gravador de voz, WhatsApp, download) e ele vira uma faixa do
  kit, sem passar pelo microfone.
- **Onde o áudio é salvo:** sem Firebase Storage. O arquivo é dividido em
  pedaços de ~700 KB (limite de 1 MB por documento) e gravado na coleção
  `arquivos` do Firestore (`arquivos/{caminho}/partes/{n}`); o campo `url`
  da faixa guarda o atalho `fs://...`. Ao tocar, o app baixa os pedaços,
  remonta o arquivo e toca — por isso **o primeiro toque de cada faixa
  baixa o áudio inteiro** (depois fica no cache do aparelho).
- Os kits ficam na coleção `kits` do Firestore (escuta em tempo real:
  aparece na tela dos outros membros na hora).
- Os membros tocam no kit para ver as faixas; tocar numa faixa usa o player
  global (continua tocando ao trocar de tela).
- A exclusão de kit/faixa também é só de administrador (apaga o documento
  e os pedaços do áudio).
- **Microfone no Android:** o `AndroidManifest.xml` declara `RECORD_AUDIO`
  e `MODIFY_AUDIO_SETTINGS`. Sem essas permissões o WebView nega o
  microfone sempre e a gravação não captura nada. Se o app antigo foi
  instalado sem elas, reinstale o APK depois de um `npx cap sync android`.

## 10. Permissões de acesso

O app tem três níveis de acesso, aplicados **tanto na interface quanto nas
regras do Firestore**:

| Nível | Quem | Pode |
| --- | --- | --- |
| Anônimo (login automático) | qualquer aparelho com o app | só ler os dados |
| Membro | quem entrou com e-mail/senha em **Perfil → Entrar** | editar **Repertório**, **Playlists** e o **próprio perfil** |
| Administrador | os 3 escolhidos (você, o líder e mais uma pessoa) | editar tudo: **Escala**, **Participantes**, **Kit musical** |

### Como criar os administradores

Os administradores ficam na coleção `admins` do Firestore, com o **id igual
ao UID** do usuário. Crie 1 documento por administrador no Console do
Firebase (Firestore → coleção `admins` → **Adicionar documento**), com id =
UID e campos quiser (ex.: `nome`, `email`, `criadoEm`). O app lê essa
coleção em tempo real: promover ou remover alguém ali libera ou bloqueia a
edição na hora, sem recompilar. A escrita nessa coleção é bloqueada nas
regras de propósito (só o Console altera — ninguém se auto-promove pelo app).

Para achar o UID de um usuário: Console → Authentication → aba **Users**.

> **Importante:** envie as regras novas **depois** de criar os documentos em
> `admins` (ou imediatamente em seguida). Com as regras novas e sem nenhum
> doc em `admins`, ninguém consegue editar Escala, Participantes ou Kits até
> o primeiro administrador ser cadastrado no Console (o Console ignora as
> regras, então consegue criar o doc mesmo assim).

### O que muda na prática

- Sem login: tudo é somente leitura (o app faz login anônimo automático).
- Logado: aparecem os botões de editar no Repertório e nas Playlists
  (incluindo importar playlist do YouTube).
- Administrador: aparecem também os botões da Escala (cultos e planilha),
  Participantes e a gravação de Kits musicais. O Perfil mostra o selo
  "Administrador" ao lado do nome.
- A escrita sem permissão é negada pelas regras do Firebase, mesmo que
  alguém tente chamar a API direto.

> **Antes de enviar as regras:** gere o login e-mail/senha dos
> administradores no Console (Authentication → Users → Add user) para que
> eles consigam entrar pelo app; senão todos ficam só de leitura.

## 11. E-mail de confirmação de conta

Quem se registra (Perfil → Entrar → Criar conta) recebe **dois e-mails**:

1. **Confirmação de conta do próprio Firebase** (`sendEmailVerification`).
   O app envia sozinho após o registro e reenvia ao entrar, enquanto a
   conta não for confirmada. O Perfil mostra o aviso "Confirme seu e-mail"
   com os botões **Reenviar e-mail** e **Já confirmei**.
2. **E-mail de boas-vindas personalizado.** Só é possível com uma
   **Cloud Function**, que exige o plano **Blaze (pago)** — no plano
   gratuito fica pendente (ver Limitações).

Para o e-mail 1 chegar na caixa de entrada do Gmail:

1. Console → **Authentication → Templates → Email address verification**
   (endereço de e-mail). O template padrão já funciona sem nada; para
   personalizar, clique em **Edit** e mude **Sender name** (ex.:
   `Louvor-IBFCG - Louvor IBFCG`) e o texto. **Save**.
2. Confirme em **Authentication → Settings → User actions** que
   **Email enumeration protection** não impede o envio (padrão: pode ficar
   ligado; o app trata o erro).
3. Teste: crie uma conta no app e veja se o e-mail chega no Gmail (olhe a
   pasta **Promoções/Spam** — e-mail de servidor costuma cair lá).

> Quem não confirma continua logado e com tudo liberado; o Perfil apenas
> mostra o aviso de confirmação enquanto `emailVerified` for falso.

## Limitações conhecidas

- **E-mail de boas-vindas personalizado**: precisa de Cloud Function
  (plano Blaze, pago). No plano gratuito só o e-mail de confirmação nativo
  do Firebase (seção 11).
- **Áudio no Firestore**: cada faixa consome a cota de armazenamento e de
  escritas do plano gratuito (gravar é barato; ouvir é leitura, que também
  tem cota diária). Prefira mp3 a WAV (o gravador do app produz WAV, bem
  maior) e apague kits antigos que não sirvam mais.

- **Autoplay na abertura**: navegadores bloqueiam áudio sem interação do
  usuário. O app tenta tocar ao abrir; se for bloqueado, o player mostra o botão
  play. No app empacotado pelo Capacitor o comportamento é melhor.
- **Cifras automáticas**: vêm da API Node.js Cifra Club (2), na pasta `cifraclub-api-2/`;
  a letra
  complementa com o lyrics.ovh. Com a API desligada, a letra e a cifra são
  digitadas no app, e a busca de cifra explica isso no aviso.
- **Login**: anônimo, sem e-mail. Cada aparelho é um usuário anônimo diferente,
  mas todos enxergam os mesmos dados da igreja.

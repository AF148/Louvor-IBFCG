# Configuração do Scale

Passos para o app funcionar com dados salvos na nuvem.

## 1. Criar o projeto no Firebase

1. Abra https://console.firebase.google.com e clique em **Adicionar projeto**.
2. Crie um projeto (o nome é livre).
3. Em **Authentication → Sign-in method**, ative **Anônimo**. É o que o app usa.
4. Em **Firestore Database**, crie o banco em modo produção.
5. Em **Storage**, crie o bucket.

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
firebase deploy --only firestore:rules,storage
```

Isso aplica `firestore.rules` e `storage.rules`. Veja a seção 10 para a
ordem correta (cadastre os administradores no Console antes de enviar).

## 4. Logo da igreja

Coloque o logo em `src/assets/logo-igreja.svg`. Enquanto o arquivo não existir,
a tela inicial mostra um placeholder no lugar.

## 5. Rodar

```
npm start          # desenvolvimento
npm run build      # produção
ionic serve        # com o servidor do Ionic
npx cap sync       # depois de gerar o app nativo
```

## 6. Cifras do Cifra Club (2) (opcional)

O app consulta as cifras pela API Node.js local em
`cifraclub-api-2/` (Axios + Cheerio; não precisa de Docker).

1. Instale o Node.js. As dependências já foram instaladas nesta cópia do projeto.
2. Inicie o servidor na porta 3001 para manter a porta 3000 disponível ao
   serviço opcional de descoberta de playlists do YouTube:

   ```
   cd cifraclub-api-2
   $env:PORT=3001; npm start
   ```

3. A API estará disponível em `http://localhost:3001/api/cifra-club-2`. Por exemplo:
   `http://localhost:3001/api/cifra-club-2?artist=coldplay&song=the-scientist`.
4. A base URL fica em `src/environments/environment.ts` (`cifraApi.baseUrl`).
   - **Navegador (`npm start` / `ionic serve`)**: `http://localhost:3001`
     já funciona (a API tem CORS liberado).
   - **App no aparelho (Capacitor)**: troque `localhost` pelo IP da máquina
     que roda o Node na rede local, ex.: `http://192.168.0.10:3001`. O
     aparelho e a máquina precisam estar na mesma rede, e o firewall deve
     liberar a porta 3001.
   - Vazio (`''`): busca de cifra desativada.
5. No formulário do louvor, use o botão **Buscar letra e cifra**. Preencha
   título e artista como aparecem no Cifra Club (ex.: artista `coldplay`,
   título `the-scientist`).

> A API consulta a página do Cifra Club pela rede. Se a música não existir no
> Cifra Club, o app avisa e você digita manualmente. Use o título/artista
> como aparecem no Cifra Club — se a música for um refrão dentro de outra
> (ex.: "Minha Vitória está em Ti", que está em "O Hino"), busque pela música
> principal.

## 7. Importar playlists do YouTube

A tela **Playlists** tem o botão **Importar do YouTube** (ícone de nuvem na
barra de título ou ao lado da busca). Cole o link da playlist (`list=...`)
ou de um vídeo e o app salva a playlist no Firestore. Em seguida abre a
lista de vídeos com miniatura, e cada linha toca o vídeo **dentro do app**
(player embutido, com anterior/próxima e botão "Abrir no YouTube").

Também funciona o compartilhamento: mande o link do YouTube **para o app**
(Android oferece o Scale na lista de compartilhamento) ou abra o link com
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
- Os áudios sobem para o Storage em `kits/{kitId}/` e os kits ficam na
  coleção `kits` do Firestore (escuta em tempo real: aparece na tela dos
  outros membros na hora).
- Os membros tocam no kit para ver as faixas; tocar numa faixa usa o player
  global (continua tocando ao trocar de tela).
- A exclusão de kit/faixa também é só de administrador (Firestore e Storage).

## 10. Permissões de acesso

O app tem três níveis de acesso, aplicados **tanto na interface quanto nas
regras do Firestore/Storage**:

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

## Limitações conhecidas

- **Autoplay na abertura**: navegadores bloqueiam áudio sem interação do
  usuário. O app tenta tocar ao abrir; se for bloqueado, o player mostra o botão
  play. No app empacotado pelo Capacitor o comportamento é melhor.
- **Cifras automáticas**: vêm da API Node.js Cifra Club (2), na pasta `cifraclub-api-2/`;
  a letra
  complementa com o lyrics.ovh. Com a API desligada, a letra e a cifra são
  digitadas no app, e a busca de cifra explica isso no aviso.
- **Login**: anônimo, sem e-mail. Cada aparelho é um usuário anônimo diferente,
  mas todos enxergam os mesmos dados da igreja.

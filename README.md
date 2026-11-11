================================================================================
                    RELATÓRIO TÉCNICO DO PROJETO
                         LOUVOR-IBFCG
          Apostila improvisada: o que foi feito e como funciona
================================================================================

Projeto ......... Louvor-IBFCG
Repositório ..... https://github.com/AF148/Louvor-IBFCG
Site (web) ...... https://louvor-ibfcg.web.app  (iPhone/iPad e navegador)
Pacote Android .. com.igreja.scale
Versão .......... 1.4 (versionCode 5)
Data do relatório  11/11/2026
Tamanho do código  65 arquivos / 13.559 linhas em src/
                   202 arquivos / 188.279 linhas no projeto todo


================================================================================
SUMÁRIO
================================================================================

  1. O que é o app
  2. Programas e ferramentas usados
  3. Tecnologias do código (front-end)
  4. Estrutura das pastas
  5. As telas do app
  6. O que cada serviço do código faz
  7. APIs externas usadas
  8. O que foi usado no Firebase
  9. Regras de segurança e níveis de acesso
 10. Backend próprio (API de cifras)
 11. Como o APK foi gerado (passo a passo)
 12. Assinatura do APK (keystore)
 13. Como gerar uma nova versão
 14. Custos e publicação
 15. Limitações conhecidas
 16. Comandos rápidos
 17. Segredos e chaves (onde fica cada um)


================================================================================
1. O QUE É O APP
================================================================================

Aplicativo Android (e web) para o ministério de louvor da igreja IBFCG.
Reúne, num lugar só:

  - Repertório de louvores com letra, cifra, transposição e áudio
  - Escala de cultos (importada de planilha Excel/CSV) com equipe e roteiro
  - Playlists do YouTube importadas por link
  - Kit musical montado pelo líder (voz, arquivos mp3 e louvores do
    repertório) com vídeos do YouTube, ouvido pelos membros
  - Lista de participantes com aniversários, contatos e foto
  - Bíblia (offline + online) e versículo do dia
  - Lembrete de escala por notificação local (2 dias antes, às 9:00)
  - Presença online/offline da equipe
  - Perfil com foto, banner e habilidades

Funciona em 3 níveis de acesso: sem conta é só leitura bloqueada, membro
edita repertório/playlists/perfil, administrador edita tudo.

COMO ACESSAR (dois caminhos, mesmo app e mesmos dados)
  Android ....... instala o APK Louvor-IBFCG-v1.4.apk (seção 14)
  iPhone/iPad ... abre https://louvor-ibfcg.web.app no Safari e
                  adiciona na tela de início (seção 14) — o iOS não
                  instala APK, então a versão web é o caminho oficial


================================================================================
2. PROGRAMAS E FERRAMENTAS USADOS
================================================================================

FERRAMENTAS DE DESENVOLVIMENTO
------------------------------
  Node.js 26 ............ runtime do JavaScript (API de cifras exige node 26.x)
  npm ................. gerenciador de pacotes
  Angular CLI 22 ....... build do front-end (ng build)
  Ionic CLI ............ servidor de desenvolvimento (ionic serve)
  Capacitor CLI 8 ...... empacota o site como app Android nativo
  Gradle 8.14.3 ........ sistema de build do Android (wrapper do projeto)
  Android SDK .......... plataformas android-36 e android-37.0
  Android build-tools .. 35.0.0 e 36.0.0 (aapt2, apksigner, zipalign)
  JDK 21 (JBR) ......... compilador Java usado pelo Gradle
                          caminho: C:/Users/Shuuichi/.jdks/jbr-21.0.11
                          (o Java 26 do sistema quebra os scripts Groovy)
  keytool .............. gerou o keystore de assinatura
  apksigner ............ assinou e verificou o APK

FERRAMENTAS DE QUALIDADE
------------------------
  ESLint 10 + angular-eslint + typescript-eslint ... linter
  Vitest 4 + jsdom ........... testes unitários
  TypeScript 6 ............... tipagem

FERRAMENTAS DE PUBLICAÇÃO
-------------------------
  GitHub .............. código-fonte (AF148/Louvor-IBFCG)
  GitHub Actions ...... 2 workflows de deploy automático no Firebase Hosting
  Firebase CLI ........ deploy de regras (firestore:rules)
  Vercel .............. API pública de cifras
  Docker + Selenium ... só na API ANTIGA (cifraclub-api/), hoje opcional

VERSÕES PRINCIPAIS DAS BIBLIOTECAS
----------------------------------
  @angular/core ............... ^22.2.1
  @ionic/angular .............. ^9.0.0
  @capacitor/core / android ... 8.5.2
  firebase (SDK web) .......... ^12.19.0
  ionicons .................... ^8.1.0
  rxjs ........................ ~7.8.0
  xlsx (ler Excel) ............ ^0.18.5
  axios + cheerio (API cifras) . 1.6.0 / 1.0.0-rc.12


================================================================================
3. TECNOLOGIAS DO CÓDIGO (FRONT-END)
================================================================================

Padrão: Angular standalone (sem NgModule) + Ionic 9 + SCSS.

  - Componentes standalone com `imports: [...]` direto no @Component
  - Signals (signal(), computed()) para estado reativo
  - Router com lazy loading (loadComponent) e authGuard em todas as telas
  - Pipes e funções puras separadas dos componentes (testáveis)
  - Sass/SCSS com arquivo compartilhado src/shared/pagina.scss

O build do Angular gera os arquivos em www/ (saída configurada em
angular.json → outputPath: www). Essa pasta é o que o Capacitor copia
para dentro do APK.


================================================================================
4. ESTRUTURA DAS PASTAS
================================================================================

Louvor-IBFCG/
├── src/                      Código do app (Angular/Ionic)
│   ├── app/
│   │   ├── core/             Serviços e regras de negócio (o "cérebro")
│   │   ├── shared/           Componentes compartilhados + SCSS comum
│   │   ├── home/ escala/ repertorio/ playlists/ kits/
│   │   ├── participantes/ biblia/ login/ perfil/
│   │   ├── app.routes.ts     Mapa das telas + guarda de acesso
│   │   └── app.component.ts  Menu lateral + player global de áudio
│   ├── environments/         Chaves de API (dev e produção)
│   ├── assets/               Logo, ícone, figuras
│   └── index.html            Ponto de entrada
├── www/                      Build de produção (gerado, não editar)
├── android/                  Projeto Android nativo (Capacitor)
│   ├── app/build.gradle      Id do app, versão e assinatura
│   ├── gradle.properties     Aponta o Gradle para o JDK 21
│   └── louvor-ibfcg.keystore CHAVE DE ASSINATURA (guardar!)
├── cifraclub-api-2/          API de cifras (Node + Vercel)
├── cifraclub-api/            API antiga (Docker + Selenium) - opcional
├── functions/                Cloud Functions (não usadas em produção)
├── public/                   Arquivos do Firebase Hosting
├── scripts/dev.js            Sobe API + app num comando só
├── firestore.rules           Regras de segurança do Firestore
├── database.rules.json       Regras do Realtime Database
├── firebase.json             Config do Firebase Hosting/rule
├── CONFIGURACAO.md           Guia de configuração do Firebase
├── RELATORIO-DO-PROJETO.txt  Este arquivo
└── Louvor-IBFCG-v1.4.apk     APK pronto pra instalar


================================================================================
5. AS TELAS DO APP
================================================================================

Todas as telas exigem login (authGuard). Quem não tem conta vai pra /login.

  /login .......... Entrar com e-mail/senha ou criar conta
  /home ........... Atalhos, resumo e versículo do dia
  /repertorio ..... Louvores: letra, cifra, transposição, busca, áudio
  /escala ......... Cultos, equipe, roteiro, importação de planilha
  /playlists ...... Playlists locais e importação do YouTube
  /kits ........... Kit musical: várias faixas (gravação, arquivo,
                    repertório) e vídeos do YouTube no mesmo kit
  /participantes .. Equipe, aniversários, foto, promoção de admin
  /biblia ........ Bíblia completa (offline + API.Bible)
  /perfil ......... Dados, foto, banner, habilidades, sair da conta


================================================================================
6. O QUE CADA SERVIÇO DO CÓDIGO FAZ
================================================================================

Todos em src/app/core/:

  firebase.ts .............. Inicializa Firebase sob demanda. Tem
                            cache persistente no Firestore (funciona sem
                            sinal), espera o login antes de abrir escutas
                            e NÃO usa login anônimo.

  auth.service.ts .......... Cadastro, login, logout, verificação de
                            e-mail, leitura/gravação em `admins`
                            (saber quem é administrador).

  auth.guard.ts ............ Redireciona pra /login quem não tem sessão
                            e guarda a rota de origem pra voltar depois.

  store.service.ts ........ Escuta 7 coleções do Firestore em tempo real
                            (participantes, louvores, playlists, cultos,
                            planilhas, mensagens, kits) e expõe em
                            signals. Também faz CRUD em lote.

  audio.service.ts ........ Player global com um único <audio>: a música
                            continua tocando ao trocar de tela.

  midia.service.ts ........ Grava e lê áudio/vídeo EM PARTES no Firestore
                            (sem Firebase Storage). Divide em pedaços de
                            ~700 KB, monta de volta na hora de tocar.

  gravador.service.ts ..... Gravação por getUserMedia + MediaRecorder,
                            converte pra WAV (o WebM do Chrome não tinha
                            duração e o player mostrava 0:00).

  cifra.service.ts ........ Busca letra (lyrics.ovh) e cifra (API
                            Cifra Club) com 2 origens e fallback
                            automático.

  youtube.service.ts ...... Interpreta links, extrai playlistId/videoId e
                            lista os vídeos pela YouTube Data API v3.

  deep-link.service.ts .... Recebe links do YouTube vindos de fora
                            (WhatsApp/intent) e de ?youtubePlaylist=.

  planilha.service.ts ..... Importa escala de .xlsx/.xls/.CSV e gera os
                            cultos. A lógica de reconhecimento está em
                            planilha.util.ts (função pura, testável).

  biblia.service.ts ....... Bíblia: versões salvas em IndexedDB, leitura
                            offline, busca e importação pela API.Bible.

  versiculo.service.ts .... Versículo do dia (API.Bible, NTLH), com cache.

  aniversario.service.ts .. Calcula aniversários próximos (só dia e mês).

  presenca.service.ts ..... Presença online/offline no Realtime Database,
                            com heartbeat e onDisconnect.

  lembrete-escala.service.ts  Notificação local 2 dias antes do culto,
                            às 9:00, via @capacitor/local-notifications.

  models.ts ............... Tipos de todos os registros (Louvor, Culto,
                            Playlist, KitMusical, Participante...).

  imagem.util.ts .......... Comprime foto de perfil/banner em data URL.

ARQUIVOS DE TESTE (.spec.ts)
  aniversario, cifra, youtube, app.component — rodar com `npm test`.


================================================================================
7. APIs EXTERNAS USADAS
================================================================================

Nº  SERVIÇO                  PARA QUÊ                       CUSTO
--- ------------------------ ------------------------------ -----------------
 1  YouTube Data API v3      Listar vídeos das playlists     Grátis
                             (10.000 unidades/dia)          (chave própria)
 2  YouTube IFrame API       Tocar vídeo dentro do app      Grátis
 3  i.ytimg.com              Miniaturas dos vídeos          Grátis
 4  Cifra Club (via própria   Busca de cifra                Grátis
    API, 2 caminhos)
 5  r.jina.ai                Leitor público que contorna    20 req/min grátis
                             o bloqueio 403 da Akamai
 6  Cifralize                Reserva quando o Cifra Club    Grátis
                             bloqueia
 7  lyrics.ovh               Letra da música                Grátis
 8  API.Bible (NTLH)         Versículo do dia               Grátis (chave
                              (mesma chave da linha 9)       embutida)
 9  API.Bible (rest.api.bible) Bíblia completa              Grátis (chave
                                                             embutida)
10  Google Fonts / Firebase  Hospedagem e fontes            Grátis (Plano
    Hosting                                              Spark)

DETALHAMENTO DA BUSCA DE CIFRA (o mais elaborado)
--------------------------------------------------
O Cifra Club bloqueia IP de datacenter (Akamai). Por isso a busca tem
DUAS origens, nesta ordem (CifraService.basesCifra()):

  1ª) http://localhost:3001  -> API local no seu PC, acesso direto
  2ª) https://louvor-ibfcg-cifraclub-api-2.vercel.app -> API na Vercel
       (celular, ou PC com a API desligada)

Na Vercel, como o acesso direto volta 403, a API busca a mesma página
pelo leitor r.jina.ai e recebe o HTML original — o parser é o mesmo.
Se a 1ª não responder (porta fechada, timeout, 5xx), o app cai
automaticamente pra 2ª. A tela nunca quebra por causa disso.

Fluxo de fallback completo:
  API local -> API Vercel (via r.jina.ai) -> Cifralize -> aviso pro
  usuário digitar a cifra na mão.


================================================================================
8. O QUE FOI USADO NO FIREBASE
================================================================================

Projeto Firebase: louvor-ibfcg (louvor-ibfcg.firebaseapp.com)
Plano: Spark (gratuito)

SERVIÇOS ATIVOS
---------------
  [USADO] Authentication
          Login por e-mail/senha. O login anônimo foi DESATIVADO.
          Templates de e-mail de confirmação configurados.

  [USADO] Cloud Firestore (banco (default), região nam5)
          Banco principal. 10 coleções + cache offline persistente.

  [USADO] Realtime Database
          Só pra presença online/offline (coleção `presenca`).
          URL: https://louvor-ibfcg-default-rtdb.firebaseio.com

  [USADO] Firebase Hosting
          Site público + 2 workflows do GitHub Actions que fazem
          deploy automático a cada push na branch main.

  [NÃO USADO] Storage
          Nem existe bucket. Todo áudio é gravado EM PARTES dentro do
          Firestore (peça de ~700 KB por documento, limite é 1 MB).
          Motivo: o Storage não estava disponível no plano gratuito.

  [CONFIGURADO, NÃO USADO] Remote Config
          Existe remoteconfig.template.json mas está vazio `{}`.

  [PASTA EXISTE, NÃO USADO] Cloud Functions
          functions/ tem firebase-functions v7 e firebase-admin v13,
          mas nada foi publicado — exigiria plano Blaze (pago).


COLEÇÕES DO FIRESTORE
---------------------
  louvores/{id} ........... Repertório (título, cifra, tom, áudio)
  playlists/{id} .......... Playlists locais e do YouTube
  cultos/{id} ............. Cultos: data, equipe, roteiro, status
  planilhas/{id} .......... Planilha de escala importada
  participantes/{id} ...... Equipe (nome, papel, nascimento, foto)
  kits/{id} ............... Kits musicais (título + faixas)
  mensagens/{id} .......... Mensagens de voz
  usuarios/{uid} .......... Perfil de cada usuário (id = UID)
  admins/{uid} ............ Lista de administradores (id = UID)
  arquivos/{id}/partes/{n}  Áudios divididos em pedaços

Realtime Database:
  presenca/{uid} .......... heartbeat de presença (tem `visto`)


================================================================================
9. REGRAS DE SEGURANÇA E NÍVEIS DE ACESSO
================================================================================

Três níveis, aplicados NA INTERFACE e NAS REGRAS (mesmo que alguém
chame a API direto, o Firebase nega):

  1. SEM CONTA ....... nenhum acesso. O authGuard manda pro /login.
                       (não existe login anônimo)
  2. MEMBRO .......... lê tudo; escreve em louvores, playlists e no
                       próprio perfil (usuarios/{uid}).
  3. ADMINISTRADOR ... escreve em tudo (cultos, planilhas,
                       participantes, kits, mensagens, admins).

Funções usadas no firestore.rules:
  autenticado() -> request.auth != null
  membro()      -> autenticado E provedor diferente de 'anonymous'
  admin()       -> existe um doc em admins/{uid} com esse uid
  podeGravarArquivo(id) -> kits* exige admin; louvores* aceita admin
                           ou membro

Regra extra importante: a coleção `admins` tem escrita SÓ para quem já
é admin — ninguém se auto-promove pelo app. O Console do Firebase é o
caminho de emergência (bypassa as regras).

Auto-vínculo do participante: quem está logado pode criar o próprio
documento em `participantes` com o próprio e-mail e mudar apenas
`nome` e `papel` (hasOnly). É assim que o nome da planilha aparece na
escala do culto.

Coleção desconhecida: leitura liberada pra logado, escrita negada.

Realtime Database (database.rules.json):
  presenca -> .read: auth != null
              presenca/{uid} -> .write: só o próprio dono


================================================================================
10. BACKEND PRÓPRIO (API DE CIFRAS)
================================================================================

cifraclub-api-2/  — a que está em uso
  Node.js 26 + axios + cheerio (sem Docker, sem Selenium)
  Lê a página do Cifra Club e devolve JSON.
  Local:  node cifraclub-api-2/server.js  -> porta 3001
  Nuvem:  https://louvor-ibfcg-cifraclub-api-2.vercel.app
  Endpoint: GET /api/cifra-club-2?artist=<slug>&song=<slug>
  Deploy: cd cifraclub-api-2 && vercel --prod --yes
  Testes de diagnóstico em cifraclub-api-2/diagnostico/

cifraclub-api/  — a antiga (opcional)
  Flask + Selenium + Docker, porta 3000.
  Serve pra descobrir a playlist/álbum a partir de um vídeo só.
  Endpoint: GET /youtube/playlist-do-video?video_id=...
  Sem Docker, o app simplesmente importa só o vídeo.

scripts/dev.js
  `npm run dev` sobe os dois de uma vez:
    1) API de cifras na porta 3001
    2) App Angular (ionic serve) na porta 8100


================================================================================
11. COMO O APK FOI GERADO (PASSO A PASSO)
================================================================================

Executado em 07/11/2026 nesta máquina (Windows).

PASSO 1 — Build do site (Angular -> www/)
  comando:  npm run build
  tempo:   ~134 segundos
  gera:    www/ (index.html + js + css)
  saída:   Application bundle generation complete

PASSO 2 — Copiar pro projeto Android
  comando:  npx cap sync android
  faz:      - copia www/ para android/app/src/main/assets/public
            - gera capacitor.config.json
            - detecta os 5 plugins do Capacitor:
                @capacitor/app, haptics, keyboard,
                local-notifications, status-bar

PASSO 3 — Compilar o APK
  comando:  cd android && .\gradlew.bat assembleRelease --no-daemon
  tempo:    ~9 min 46 s na primeira vez
  saída:    BUILD SUCCESSFUL (324 tarefas)
  gera:     android/app/build/outputs/apk/release/app-release.apk

PASSO 4 — Verificar a assinatura
  comando:  apksigner verify --print-certs app-release.apk
  confere:  DN do certificado, SHA-256, SHA-1 e MD5

PASSO 5 — Copiar pra raiz com nome amigável
  destino:  C:\projetos\Louvor-IBFCG\Louvor-IBFCG-v1.4.apk  (4,15 MB)

CONFIGURAÇÕES DO APP ANDROID
----------------------------
  applicationId / namespace ... com.igreja.scale
  appName ..................... Louvor-IBFCG
  versionCode / versionName ... 5 / "1.4"
  minSdk / targetSdk / compileSdk  24 / 36 / 36
  (Android 7.0 em diante)

PERMISSÕES DO APP (as 8 que estão DENTRO do APK)
-------------------------------------------------
Verificado com: aapt2 dump permissions app-release.apk

  #  PERMISSÃO                     DE ONDE VEM            PARA QUÊ
  -- ----------------------------- ---------------------- -------------------------
  1  INTERNET                     AndroidManifest.xml     acesso à rede
                                  (do projeto)
  2  RECORD_AUDIO                 AndroidManifest.xml     gravar o kit musical
                                  (do projeto)
  3  MODIFY_AUDIO_SETTINGS        AndroidManifest.xml     ajustes de áudio
                                  (do projeto)
  4  VIBRATE                      plugin @capacitor/      vibração do
                                  haptics                 feedback tátil
  5  POST_NOTIFICATIONS           plugin @capacitor/      PERMITIR NOTIFICAÇÕES
                                  local-notifications     (lembrete de escala)
  6  SCHEDULE_EXACT_ALARM         plugin @capacitor/      notificação EXATAMENTE
                                  local-notifications     às 9:00, não "por volta"
  7  RECEIVE_BOOT_COMPLETED       plugin @capacitor/      reagendar os lembretes
                                  local-notifications     depois de reiniciar
  8  WAKE_LOCK                    plugin @capacitor/      acordar o aparelho na
                                  local-notifications     hora certa de disparar
  +  DYNAMIC_RECEIVER_NOT_        gerado automaticamente pelo Android
    EXPORTED_PERMISSION          (não é permissão de usuário)

  Também declarado: <uses-feature android:name="android.hardware.microphone"
  android:required="false" /> — aparelho sem microfone ainda funciona.

POR QUE A NOTIFICAÇÃO NÃO APARECE NO AndroidManifest.xml DO PROJEITO
--------------------------------------------------------------------
Porque o Capacitor usa a técnica de **manifest merge**: cada plugin traz o
próprio `AndroidManifest.xml` dentro da biblioteca, e o Gradle junta tudo
num só arquivo na hora do build. O arquivo que você abre e edita
(android/app/src/main/AndroidManifest.xml) só contém o que o APP escreveu;
as permissões dos plugins ficam nos respectivos `node_modules/@capacitor/*/android/src/main/AndroidManifest.xml`.

Arquivo real do plugin das notificações:
  node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml

Manifest merged (resultado da junção, gerado no build):
  android/app/build/intermediates/merged_manifest/release/
      processReleaseMainManifest/AndroidManifest.xml

Para listar as permissões FINAIS de qualquer APK:
  %LOCALAPPDATA%\Android\Sdk\build-tools\36.0.0\aapt2.exe dump permissions app-release.apk

IMPORTANTE — permissão que precisa de aprovação do usuário
----------------------------------------------------------
  POST_NOTIFICATIONS é de nível de EXECUÇÃO no Android 13+ (API 33).
  Declarar no manifest não basta: o app tem que PEDIR na tela.
  Sem a aprovação, o lembrete de escala simplesmente não aparece.
  O app trata isso: em `lembrete-escala.service.ts` há a pergunta
  "Permitir notificações?" uma única vez por aparelho.

INTENT FILTERS (o app abre links de fora)
-----------------------------------------
  https://www.youtube.com / youtube.com / m.youtube.com
      -> o link tocado no WhatsApp abre o Louvor-IBFCG como opção
  escala://
      -> esquema próprio
  SEND text/plain
      -> aparece na lista "Compartilhar" do Android


================================================================================
12. ASSINATURA DO APK (KEYSTORE)
================================================================================

O Android NÃO instala APK sem assinatura. Por isso foi criado:

  Arquivo ... android/louvor-ibfcg.keystore   (NÃO é versionado)
  Alias ..... louvor-ibfcg
  Senha ..... definida em variável de ambiente / keystore.properties
  Algoritmo . RSA 2048 / SHA384withRSA
  Validade .. 10.000 dias (~27 anos)
  Assinatura . CN=Louvor IBFCG, OU=Ministerio de Louvor, O=IBFCG

  SHA-256 do certificado:
  1135f4ba1e4b8b93efa8ceac9f682f46cb61809740d44bc0880dd3e8b80edd42

!!! GUARDE ESTE ARQUIVO !!!
Sem ele você NÃO consegue publicar atualizações do mesmo app.
Perdeu = precisa refazer o app do zero com outro id.

COMO A ASSINATURA FICOU AUTOMÁTICA
-----------------------------------
A senha NUNCA fica no código. O `android/app/build.gradle` lê as
credenciais nesta ordem:

  1. variável de ambiente (CI/CD ou máquina nova)
  2. arquivo `android/keystore.properties` (uso local, está no .gitignore)

    // trecho do build.gradle
    def valorDe = { String propriedade, String variavel ->
        def valorEnv = System.getenv(variavel)
        return (valorEnv != null && !valorEnv.trim().isEmpty())
            ? valorEnv
            : propsAssinatura.getProperty(propriedade)
    }

    signingConfigs {
        release {
            if (assinarRelease) {
                storeFile keystoreCaminho
                storePassword keystoreSenha
                keyAlias keystoreAlias
                keyPassword keystoreKeyPass
            }
        }
    }

O `keystore.properties` (local, NÃO vai pro Git) tem 4 linhas:

    storeFile=louvor-ibfcg.keystore
    storePassword=***
    keyAlias=louvor-ibfcg
    keyPassword=***

Para CI/CD, use as variáveis em vez do arquivo:

    LOUVOR_KEYSTORE_FILE
    LOUVOR_STORE_PASSWORD
    LOUVOR_KEY_ALIAS
    LOUVOR_KEY_PASSWORD

Por que assim e não a senha direto no build.gradle?
  - código publicado não expõe credencial (aqui é repositório aberto);
  - o build.gradle pode ir pro portfólio sem segredo;
  - o mesmo arquivo serve pra várias máquinas sem editar o código.

SE O KEystore OU AS CREDENCIAIS FALTAREM
----------------------------------------
O build **não quebra**: ele gera `app-release-unsigned.apk`, que serve
para testar mas **não instala**. Basta criar o `keystore.properties`
para voltar a gerar o `app-release.apk` assinado.


================================================================================
13. COMO GERAR UMA NOVA VERSÃO
================================================================================

Basta 3 comandos na raiz do projeto:

    npm run build
    npx cap sync android
    cd android
    .\gradlew.bat assembleRelease

O APK novo fica em:
    android\app\build\outputs\apk\release\app-release.apk

Pra subir versão nova no mesmo app, aumente em
android/app/build.gradle:
    versionCode 6        (sempre cresce, nunca repete)
    versionName "1.5"    (é o que o usuário vê)

Se mudou código do app (src/), SEMPRE rode o `npm run build` antes do
`cap sync` — senão o APK fica com a versão antiga.

Desenvolvimento local:
    npm run dev          sobe API (3001) + app (8100) juntos
    npm start            só o app
    npm start:cifra      só a API de cifras
    npm test             testes (Vitest)
    npm run lint         verificação de código


================================================================================
14. CUSTOS E PUBLICAÇÃO
================================================================================

DISTRIBUIÇÃO DIRETA (o que foi feito)
  Custo: R$ 0
  Manda o arquivo Louvor-IBFCG-v1.4.apk por WhatsApp/drive/site.
  Na primeira instalação o Android avisa "fonte desconhecida" — é uma
  vez só por aparelho, depois nunca mais. Não tem como remover esse
  aviso em APK fora da loja (é proteção do sistema).

VERSÃO WEB (iPhone/iPad, tablet e computador) — R$ 0
  Endereço: https://louvor-ibfcg.web.app

  É o MESMO app e os MESMOS dados do APK (mesmo Firebase), só que
  roda no navegador. É o caminho oficial pro iPhone/iPad, que não
  instala arquivo APK — não existe "instalar direto do site" no iOS
  (só App Store, TestFlight ou conta de desenvolvedor Apple paga).

  No iPhone: abrir o endereço no Safari → botão Compartilhar →
  "Adicionar à Tela de Início". Fica com o ícone do logo e tela
  cheia, quase igual app. Não tem atualização pra baixar: sempre
  abre na versão mais nova.

  Publicação é AUTOMÁTICA: todo git push pro main o GitHub Actions
  builda o site (npm run build → pasta www/) e sobe no Firebase
  Hosting. Publicação manual, se precisar:
      firebase deploy --only hosting

  Funciona igual ao APK: login, repertório, escala, playlists, kits
  (gravando pelo microfone do navegador), bíblia, vídeos do YouTube.
  Limite: o lembrete de escala só dispara com a página aberta —
  pra notificação com o celular em repouso, o APK continua melhor.

GOOGLE PLAY STORE
  Taxa única de cadastro ... US$ 25 (~R$ 140) — uma vez só
  Publicar/atualizar ...... grátis pra sempre
  Manutenção da conta ...... R$ 0

  ⚠ Conta PESSOAL criada depois de 13/11/2023 o Google exige:
    teste fechado com MÍNIMO DE 12 TESTADORES inscritos por
    14 DIAS CONSECUTIVOS antes de liberar a Produção.
    Isso é grátis, mas leva 2 semanas e precisa de 12 pessoas reais.
    Conta ORGANIZACIONAL não tem essa exigência.

  Pra publicar na Play, o APK vira AAB (bundle):
    .\gradlew.bat bundleRelease
  (gera app-release.aab em android/app/build/outputs/bundle/release/)

OUTRAS OPÇÕES
  PWA ........... instalar pelo navegador, sem loja e sem APK (R$ 0)
  TWA ........... site empacotado publicado na Play (US$ 25)
  ADB ........... instalar via cabo, sem aviso pro usuário (R$ 0)

Firebase Hosting ............ grátis (Plano Spark)
YouTube Data API ............ grátis (10.000 unidades/dia)
Vercel (API de cifras) ...... grátis (plano hobby)
API.Bible ................... grátis (chave embutida no app)


================================================================================
15. LIMITAÇÕES CONHECIDAS
================================================================================

  - Áudio no Firestore: consome cota de armazenamento e de leitura do
    plano gratuito. Prefira mp3 (o gravador gera WAV, bem maior).
    Apague kits antigos que não sirvam mais.

  - E-mail de boas-vindas personalizado: exigiria Cloud Function =
    plano Blaze (pago). No grátis só o e-mail de confirmação nativo.

  - Autoplay: navegadores bloqueiam áudio sem interação. O app tenta
    tocar ao abrir; se bloquear, aparece o botão play.

  - Busca de cifra depende de serviços externos. Se as duas APIs
    caírem, a cifra é digitada à mão (o aviso explica isso).

  - YouTube às vezes bloqueia consultas automatizadas do IP
    ("unusual traffic"). Nesse caso importa só o vídeo e avisa;
    usar o link da playlist (list=...) nunca é bloqueado.

  - API antiga de playlist (cifraclub-api/) precisa de Docker.

  - Autoplay e notificações locais funcionam melhor no APK
    empacotado do que no navegador.

  - O arquivo environment.ts está versionado no Git com as chaves
    (Firebase web key e YouTube key). A do Firebase é pública por
    design (a segurança está nas regras); a do YouTube DEVE estar
    restrita ao Google Cloud Console (só YouTube Data API v3).


================================================================================
16. COMANDOS RÁPIDOS
================================================================================

  # Primeira vez
  npm install

  # Desenvolvimento (API + app juntos)
  npm run dev

  # Gerar o APK
  npm run build
  npx cap sync android
  cd android
  .\gradlew.bat assembleRelease

  # Testes e lint
  npm test
  npm run lint

  # Publicar regras do Firestore
  firebase login
  firebase deploy --only firestore:rules

  # Atualizar a API de cifras na Vercel
  cd cifraclub-api-2
  vercel --prod --yes

  # Verificar assinatura do APK
  %LOCALAPPDATA%\Android\Sdk\build-tools\36.0.0\apksigner.bat verify --print-certs app-release.apk

  # Regenerar ícones a partir da logo
  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\opencode\gera-icones.ps1"


================================================================================
17. SEGREDS E CHAVES (ONDE FICA CADA UM)
================================================================================

ARQUIVO                                  O QUE TEM
---------------------------------------  -------------------------------
src/environments/environment.ts          Chaves do Firebase, YouTube,
src/environments/environment.prod.ts     URLs das APIs de cifra
                                         (versão dev e produção)

android/louvor-ibfcg.keystore            Identidade do app (NÃO vai pro Git)
                                         Alias: louvor-ibfcg
                                         Senha: em keystore.properties (local)

android/keystore.properties              4 linhas com alias e senhas
                                         (NÃO vai pro Git — ver .gitignore)

firebase.json / firestore.rules          Regras de acesso
database.rules.json                      Regras do Realtime DB
.firebaserc                              Projeto padrão: louvor-ibfcg

Variáveis de ambiente (CI / outra PC)    LOUVOR_KEYSTORE_FILE,
                                         LOUVOR_STORE_PASSWORD,
                                         LOUVOR_KEY_ALIAS,
                                         LOUVOR_KEY_PASSWORD

Chave da Bíblia (API.Bible)              Embutida no código
                                         (src/environments/environment*.ts);
                                         é a chave gratuita do projeto e
                                         dispensa configuração no aparelho

⚠ NUNCA SUBA no Git:
  - keystore (é a identidade do app)
  - keystore.properties (tem as senhas)
  - service account / FIREBASE_SERVICE_ACCOUNT_*

✅ ESTE REPOSITÓRIO ESTÁ LIMPO:
  - nenhuma senha de keystore no código nem no README
  - keystore.properties e *.keystore no .gitignore
  - APK e build artifacts ignorados
  - service account só nos Secrets do GitHub Actions

O GitHub Actions usa o secret
FIREBASE_SERVICE_ACCOUNT_LOUVOR_IBFCG
(não está no repositório, fica em Settings → Secrets).


================================================================================
FIM DO RELATÓRIO
================================================================================

Resumo em uma frase: app Ionic/Angular empacotado com Capacitor,
dados no Firebase (Auth + Firestore + Realtime DB), cifras vindo de
uma API Node própria publicada na Vercel, APK assinado e gerado
automaticamente pelo Gradle.

Guarde junto com o projeto:
  - Louvor-IBFCG-v1.4.apk   (o app pronto)
  - android/louvor-ibfcg.keystore  (a chave de assinatura)

================================================================================

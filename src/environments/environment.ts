// Este arquivo pode ser substituído em build pelo array `fileReplacements`.
// `ng build` troca `environment.ts` por `environment.prod.ts`.
// A lista de trocas está em `angular.json`.

export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyA754KFRv7H1_4MUnHQz2SoLKRPPbr5LRc',
    authDomain: 'louvor-ibfcg.firebaseapp.com',
    projectId: 'louvor-ibfcg',
    storageBucket: 'louvor-ibfcg.firebasestorage.app',
    messagingSenderId: '1035514933974',
    appId: '1:1035514933974:web:cf8a47e5d196c4a9738f77',
    measurementId: 'G-19PHKYW8N7',
    // Realtime Database (presença online/offline). Fica vazio enquanto o
    // banco não for criado no Console; depois cole a URL que ele mostrar,
    // ex.: https://louvor-ibfcg-default-rtdb.firebaseio.com
    databaseURL: '',
  },
  // Chave da YouTube Data API v3 (gratuita): https://console.cloud.google.com
  // Necessária para listar as músicas de uma playlist importada.
  youtube: {
    apiKey: 'AIzaSyCQX10cB1NyipbeQLsdnLoIXnUUWLKo-RY',
  },
  // API local Cifra Club (2), servida pela pasta cifraclub-api-2/, sem Docker.
  // `fallbackUrl` é a mesma API publicada (Vercel): entra quando a local não
  // responde — no celular `localhost` não existe, e no PC com o servidor
  // desligado também. Deixe vazia para desativar.
  cifraApi: {
    baseUrl: 'http://localhost:3001',
    fallbackUrl: 'https://louvor-ibfcg-cifraclub-api-2.vercel.app',
  },
  // API antiga para descobrir playlists a partir de um vídeo; ainda usa Docker.
  youtubePlaylistApi: {
    baseUrl: 'http://localhost:3000',
  },
};

/*
 * Para facilitar a depuração no modo de desenvolvimento, você pode importar o
 * arquivo a seguir para ignorar erros de pilha do zone related como `zone.run`.
 *
 * Este import deve ser comentado em produção, pois tem impacto negativo no
 * desempenho quando um erro é lançado.
 */
// import 'zone.js/plugins/zone-error';  // Incluído com o Angular CLI.

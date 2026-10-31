// Este arquivo pode ser substituído em build pelo array `fileReplacements`.
// `ng build` troca `environment.ts` por `environment.prod.ts`.
// A lista de trocas está em `angular.json`.

export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyA754KFRv7H1_4MUnHQz2SoLKRPPbr5LRc',
    authDomain: 'louvor-ibfcg.firebaseapp.com',
    databaseURL: 'https://louvor-ibfcg-default-rtdb.firebaseio.com',
    projectId: 'louvor-ibfcg',
    storageBucket: 'louvor-ibfcg.firebasestorage.app',
    messagingSenderId: '1035514933974',
    appId: '1:1035514933974:web:cf8a47e5d196c4a9738f77',
    measurementId: 'G-19PHKYW8N7',
  },
  // Chave da YouTube Data API v3 (gratuita): https://console.cloud.google.com
  // Necessária para listar as músicas de uma playlist importada.
  youtube: {
    apiKey: 'AIzaSyCQX10cB1NyipbeQLsdnLoIXnUUWLKo-RY',
  },
  // API local Cifra Club (2), servida pela pasta cifraclub-api-2/, sem Docker.
  cifraApi: {
    baseUrl: 'http://localhost:3001',
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

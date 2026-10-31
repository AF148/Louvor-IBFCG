export const environment = {
  production: true,
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
  youtube: {
    apiKey: 'AIzaSyCQX10cB1NyipbeQLsdnLoIXnUUWLKo-RY',
  },
  // API Node.js local para cifras. Em aparelho nativo, use o IP do computador.
  cifraApi: {
    baseUrl: 'http://localhost:3001',
  },
  // Serviço anterior de descoberta de playlists do YouTube (Docker).
  youtubePlaylistApi: {
    baseUrl: 'http://localhost:3000',
  },
};

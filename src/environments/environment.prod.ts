export const environment = {
  production: true,
  firebase: {
    apiKey: 'AIzaSyA754KFRv7H1_4MUnHQz2SoLKRPPbr5LRc',
    authDomain: 'louvor-ibfcg.firebaseapp.com',
    projectId: 'louvor-ibfcg',
    storageBucket: 'louvor-ibfcg.firebasestorage.app',
    messagingSenderId: '1035514933974',
    appId: '1:1035514933974:web:cf8a47e5d196c4a9738f77',
    measurementId: 'G-19PHKYW8N7',
    // Realtime Database (presença online/offline).
    databaseURL: 'https://louvor-ibfcg-default-rtdb.firebaseio.com',
  },
  // Chave da YouTube Data API v3 (gratuita): https://console.cloud.google.com
  youtube: {
    apiKey: 'AIzaSyCQX10cB1NyipbeQLsdnLoIXnUUWLKo-RY',
  },
  // API.Bible (gratuita): https://scripture.api.bible
  // A NTLH é a única tradução em português liberada no plano gratuito.
  // A chave é do próprio projeto e fica embutida no app para o versículo
  // do dia funcionar em qualquer aparelho, sem configuração.
  bible: {
    apiKey: 'om6a468I-sXfp0WqihTNL',
    ntlhId: 'acef2bc597c450a1-01',
  },
  // API Node.js local para cifras. Em aparelho nativo, use o IP do computador.
  // `fallbackUrl` é a API publicada (Vercel): é ela que o celular usa, já que
  // `localhost` no aparelho aponta para o próprio telefone.
  cifraApi: {
    baseUrl: 'http://localhost:3001',
    fallbackUrl: 'https://louvor-ibfcg-cifraclub-api-2.vercel.app',
  },
  // Serviço anterior de descoberta de playlists do YouTube (Docker).
  youtubePlaylistApi: {
    baseUrl: 'http://localhost:3000',
  },
};

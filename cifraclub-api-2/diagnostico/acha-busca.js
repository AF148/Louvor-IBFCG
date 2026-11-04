/** Acha a URL de busca do Cifra Club e testa termos de louvor. */
const axios = require('axios');

const sessao = axios.create({
  proxy: false,
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
  validateStatus: (s) => s >= 200 && s < 500,
  maxRedirects: 5,
});

(async () => {
  // 1) Procura o formulário de busca na home.
  console.log('=== procurando formulário de busca na home ===');
  const home = await sessao.get('https://www.cifraclub.com.br/');
  const html = String(home.data);
  const acoes = [...html.matchAll(/<form[^>]*action="([^"]*)"[^>]*>/gi)].map((m) => m[1]);
  console.log('forms:', acoes.slice(0, 10));
  const inputs = [...html.matchAll(/<input[^>]*name="([^"]*)"[^>]*>/gi)].map((m) => m[1]);
  console.log('inputs:', [...new Set(inputs)].slice(0, 15));

  // 2) Padrões comuns de busca.
  const candidatos = [
    '/busca?q=jeova-rafa',
    '/busca?busca=jeova-rafa',
    '/search?q=jeova-rafa',
    '/busca/jeova-rafa',
    '/explorar/busca?q=jeova-rafa',
  ];
  console.log('\n=== testando padrões de busca ===');
  for (const c of candidatos) {
    try {
      const r = await sessao.get(`https://www.cifraclub.com.br${c}`);
      const corpo = String(r.data);
      const achou = /jeova/i.test(corpo) && /rafa/i.test(corpo);
      console.log(`${r.status}  bytes=${corpo.length}  achouTermo=${achou}  ${c}`);
    } catch (e) {
      console.log(`ERRO ${c} ${e.message}`);
    }
  }
})();

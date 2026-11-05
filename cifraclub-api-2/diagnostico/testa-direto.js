/** Repete o acesso direto ao Cifra Club com o MESMO cabeçalho do servidor. */
const axios = require('axios');

const sessao = axios.create({
  proxy: false,
  timeout: 15000,
  validateStatus: (s) => s >= 200 && s < 500,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
});

const alvos = [
  'https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/',
  'https://www.cifraclub.com.br/prisma-brasil/o-cordeiro-de-deus/',
];

(async () => {
  for (const url of alvos) {
    const inicio = Date.now();
    try {
      const r = await sessao.get(url);
      const corpo = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const bloqueio = /Access Denied|Reference&#32;&#35;18\./.test(corpo);
      const temCifra = /data-chord-content|data-chord-container|cifra_cnt/.test(corpo);
      console.log(
        `HTTP ${String(r.status).padEnd(4)} ${String(Date.now() - inicio).padStart(5)}ms bytes=${String(corpo.length).padEnd(8)} cifra=${temCifra} bloqueio=${bloqueio}\n   ${url}`,
      );
    } catch (e) {
      console.log(`ERRO ${e.message}\n   ${url}`);
    }
  }
})();

/** Testa URLs candidatas do Cifra Club. Uso: node testa-url.js /diante-do-trono/nos-rendemos/ */
const axios = require('axios');

const alvos = process.argv.slice(2);
if (!alvos.length) {
  console.log('informe ao menos um caminho, ex.: /diante-do-trono/nos-rendemos/');
  process.exit(1);
}

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
  for (const caminho of alvos) {
    const url = `https://www.cifraclub.com.br${caminho}`;
    try {
      const res = await sessao.get(url);
      const temCifra =
        String(res.data).includes('data-chord-content') ||
        String(res.data).includes('cifra_cnt') ||
        String(res.data).includes('js-tab-content');
      console.log(
        `${res.status}  temCifra=${temCifra}  bytes=${String(res.data).length}  ${url}`,
      );
    } catch (e) {
      console.log(`ERRO  ${url}  ${e.message}`);
    }
  }
})();

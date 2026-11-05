/** Mede o limite real do r.jina.ai: 25 buscas seguidas + cabeçalhos de cota. */
const axios = require('axios');

const sessao = axios.create({
  proxy: false,
  timeout: 60000,
  validateStatus: () => true,
  headers: { 'User-Agent': 'Mozilla/5.0', 'X-Return-Format': 'html' },
});

const URL = 'https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/';

(async () => {
  let ok = 0;
  let falhas = 0;
  let primeirosCabecais = null;
  for (let i = 1; i <= 25; i++) {
    const inicio = Date.now();
    try {
      const r = await sessao.get(`https://r.jina.ai/${URL}`);
      if (!primeirosCabecais) primeirosCabecais = r.headers;
      const corpo = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const temCifra = /data-chord-container/.test(corpo);
      if (r.status === 200 && temCifra) ok++;
      else {
        falhas++;
        console.log(`  #${String(i).padStart(2)} HTTP ${r.status} ${Date.now() - inicio}ms ${corpo.slice(0, 160).replace(/\s+/g, ' ')}`);
      }
      if (i === 1 || i % 5 === 0) {
        const cota =
          r.headers['x-ratelimit-remaining'] ?? r.headers['ratelimit-remaining'] ?? '-';
        console.log(
          `#${String(i).padStart(2)} HTTP ${r.status} ${String(Date.now() - inicio).padStart(5)}ms cifra=${temCifra} cotaRest=${cota}`,
        );
      }
    } catch (e) {
      falhas++;
      console.log(`  #${i} ERRO ${e.message}`);
    }
  }
  console.log(`\nOK=${ok}  FALHAS=${falhas}`);
  if (primeirosCabecais) {
    const relevantes = Object.entries(primeirosCabecais).filter(([k]) =>
      /rate|limit|quota|retry|jina/i.test(k),
    );
    console.log('cabeçalhos de cota:', JSON.stringify(Object.fromEntries(relevantes), null, 2));
  }
})();

/** Compara a busca do Cifralize com slug (hoje) vs. texto legível (proposto). */
const axios = require('axios');

const sessao = axios.create({
  proxy: false,
  timeout: 20000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
  validateStatus: (s) => s >= 200 && s < 500,
});

const casos = [
  { slug: 'jeova-rafa allan-andre', legivel: 'Jeová Rafá Allan André' },
  { slug: 'nos-rendemos diante-do-trono', legivel: 'Nos Rendemos Diante do Trono' },
  { slug: 'abencao-que-nao-acaba priscilla-alves', legivel: 'Bênção que Não Acaba Priscilla Alves' },
  { slug: 'santo-espirito david-danner', legivel: 'Santo Espírito David Danner' },
  { slug: 'tempo-perdido legiao-urbana', legivel: 'Tempo Perdido Legião Urbana' },
];

(async () => {
  for (const c of casos) {
    for (const [rotulo, q] of [['slug   ', c.slug], ['legível', c.legivel]]) {
      const url = `https://cifralize.com.br/search?q=${encodeURIComponent(q)}&format=json`;
      try {
        const r = await sessao.get(url);
        const musicas = r.data?.songs || [];
        const top = musicas.slice(0, 3).map((m) => `${m.artist_name} - ${m.title}`);
        console.log(
          `${c.legivel.padEnd(38)} | ${rotulo} -> HTTP ${r.status} resultados=${musicas.length}` +
            (top.length ? `\n      ex.: ${top.join('  ||  ')}` : ''),
        );
      } catch (e) {
        console.log(`${c.legivel.padEnd(38)} | ${rotulo} -> ERRO ${e.message}`);
      }
    }
  }
})();

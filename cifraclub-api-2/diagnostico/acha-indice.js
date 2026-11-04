/** Procura sitemap/robots do Cifra Club e um índice de artistas. */
const axios = require('axios');

const sessao = axios.create({
  proxy: false,
  timeout: 25000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
  validateStatus: (s) => s >= 200 && s < 500,
  maxRedirects: 5,
});

const alvos = [
  '/robots.txt',
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/letra/A/',
];

(async () => {
  for (const a of alvos) {
    const url = `https://www.cifraclub.com.br${a}`;
    try {
      const r = await sessao.get(url);
      const corpo = String(r.data);
      console.log(`\n=== ${a} -> HTTP ${r.status} bytes=${corpo.length} ===`);
      if (a.endsWith('.txt') || a.endsWith('.xml')) {
        console.log(corpo.slice(0, 1500));
      } else {
        // Lista os links de 1 e 2 segmentos para ver o formato.
        const hrefs = [...corpo.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        const unicos = [...new Set(hrefs)].filter((h) => /^\/[^/]+\/?$/.test(h) || /^\/[^/]+\/[^/]+\/?$/.test(h));
        console.log(unicos.slice(0, 40).join('\n'));
      }
    } catch (e) {
      console.log(`\n=== ${a} -> ERRO ${e.message} ===`);
    }
  }
})();

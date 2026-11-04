/** Busca no Cifra Club e lista os links reais de música. Uso: node busca.js "jeova rafa" */
const axios = require('axios');
const cheerio = require('cheerio');

const termos = process.argv.slice(2);
if (!termos.length) {
  console.log('informe um termo, ex.: node busca.js "jeova rafa"');
  process.exit(1);
}

const sessao = axios.create({
  proxy: false,
  timeout: 20000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
  validateStatus: (s) => s >= 200 && s < 500,
  maxRedirects: 5,
});

const normalizar = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

(async () => {
  for (const termo of termos) {
    const url = `https://www.cifraclub.com.br/search?q=${encodeURIComponent(termo)}`;
    console.log(`\n=== "${termo}" -> ${url} ===`);
    try {
      const res = await sessao.get(url);
      console.log(`status ${res.status} bytes ${String(res.data).length}`);
      if (res.status >= 400) continue;

      const $ = cheerio.load(res.data);
      const vistos = new Set();
      const alvo = normalizar(termo);
      $('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        let u;
        try {
          u = new URL(href, 'https://www.cifraclub.com.br/');
        } catch {
          return;
        }
        if (!u.hostname.endsWith('cifraclub.com.br')) return;
        const p = u.pathname.split('/').filter(Boolean);
        if (p.length !== 2) return;
        const chave = u.pathname;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        const texto = $(a).text().trim().replace(/\s+/g, ' ').slice(0, 70);
        const bate = normalizar(`${p[0]} ${p[1]}`).includes(alvo) || normalizar(p[1]).includes(alvo);
        console.log(`  ${bate ? '>>' : '  '} ${u.pathname}   "${texto}"`);
      });
      if (!vistos.size) console.log('  (nenhum link de música de 2 segmentos)');
    } catch (e) {
      console.log(`ERRO: ${e.message}`);
    }
  }
})();

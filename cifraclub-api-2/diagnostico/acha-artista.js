/** Acha o slug correto do artista no índice /letra/<L>/ e lista músicas. */
const axios = require('axios');
const cheerio = require('cheerio');

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

const normalizar = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const nomes = process.argv.slice(2);
if (!nomes.length) {
  console.log('uso: node acha-artista.js "Allan André" "Priscilla Alves"');
  process.exit(1);
}

(async () => {
  for (const nome of nomes) {
    const letra = normalizar(nome)[0].toUpperCase();
    const url = `https://www.cifraclub.com.br/letra/${letra}/`;
    console.log(`\n=== "${nome}" -> ${url} ===`);
    try {
      const r = await sessao.get(url);
      if (r.status >= 400) {
        console.log(`  HTTP ${r.status}`);
        continue;
      }
      const $ = cheerio.load(String(r.data));
      const alvo = normalizar(nome);
      const candidatos = [];
      $('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        const m = href.match(/^\/([^/]+)\/$/);
        if (!m) return;
        const slug = m[1];
        const texto = normalizar($(a).text());
        if (slug.includes(alvo) || alvo.includes(slug) || texto.includes(alvo) || alvo.includes(texto)) {
          candidatos.push({ slug, texto: $(a).text().trim() });
        }
      });
      if (!candidatos.length) {
        console.log('  nenhum candidato no índice desta letra');
      } else {
        candidatos.slice(0, 10).forEach((c) => console.log(`  /${c.slug}/   "${c.texto}"`));
      }
    } catch (e) {
      console.log(`  ERRO ${e.message}`);
    }
  }
})();

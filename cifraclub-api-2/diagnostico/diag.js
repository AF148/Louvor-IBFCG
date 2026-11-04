/**
 * Diagnóstico: vê o que o Cifra Club realmente devolve para um artista.
 * Uso: node diag.js [artista]
 */
const axios = require('axios');
const cheerio = require('cheerio');

const artista = process.argv[2] || 'diante-do-trono';
const URL_BASE = 'https://www.cifraclub.com.br/';

(async () => {
  const sessao = axios.create({
    proxy: false,
    timeout: 15000,
    // Mesmo header do server.js: é ele que passa pelo anti-bot do Cifra Club.
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
    validateStatus: (s) => s >= 200 && s < 500,
  });

  const url = `${URL_BASE}${artista}/`;
  console.log(`\n=== ${url} ===`);
  try {
    const res = await sessao.get(url, { maxRedirects: 5 });
    console.log(`status: ${res.status}  bytes: ${String(res.data).length}`);
    console.log(`url final: ${res.request?.res?.responseUrl || '?'}`);
    if (res.status >= 400) return;

    const $ = cheerio.load(res.data);
    const alvos = ['nos-rendemos', 'que-existe-um-lugar', 'jeova-rafa', 'abencao-que-nao-acaba'];
    const hrefs = [];
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href') || '';
      try {
        const u = new URL(href, URL_BASE);
        if (!u.hostname.endsWith('cifraclub.com.br')) return;
        const p = u.pathname.split('/').filter(Boolean);
        if (p.length === 2) hrefs.push({ href: u.pathname, texto: $(a).text().trim().slice(0, 50) });
      } catch {
        /* ignora */
      }
    });
    console.log(`links de música encontrados: ${hrefs.length}`);
    console.log('primeiros 15:');
    hrefs.slice(0, 15).forEach((h) => console.log(`  ${h.href}   "${h.texto}"`));
    console.log('procurando os alvos:');
    for (const alvo of alvos) {
      const achados = hrefs.filter(
        (h) => h.href.includes(alvo) || h.texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(alvo),
      );
      console.log(`  ${alvo}: ${achados.length ? achados.map((a) => a.href).join(', ') : 'NADA'}`);
    }
  } catch (e) {
    console.log(`ERRO: ${e.message}`);
  }
})();

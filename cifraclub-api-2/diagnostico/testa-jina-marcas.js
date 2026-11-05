/**
 * Quais marcadores diferenciam, no HTML devolvido pelo Jina:
 *  - uma página de música válida
 *  - uma página inexistente (404 do Cifra Club)
 *  - a página de um artista (usada para achar o slug certo)
 */
const axios = require('axios');

const sessao = axios.create({
  proxy: false,
  timeout: 60000,
  validateStatus: () => true,
  headers: {
    'User-Agent': 'Mozilla/5.0',
    'X-Return-Format': 'html',
  },
});

const alvos = [
  { nome: 'música válida', url: 'https://www.cifraclub.com.br/prisma-brasil/o-cordeiro-de-deus/' },
  { nome: 'música inexistente', url: 'https://www.cifraclub.com.br/prisma-brasil/essa-musica-nao-existe-xyz/' },
  { nome: 'artista', url: 'https://www.cifraclub.com.br/diante-do-trono/' },
  { nome: 'artista inexistente', url: 'https://www.cifraclub.com.br/allan-andre/' },
];

const marcas = [
  'data-chord-page',
  'data-chord-container',
  'data-chord-content',
  'cifra_cnt',
  'js-tab-content',
  'http-equiv="content-language"',
];

(async () => {
  for (const alvo of alvos) {
    const inicio = Date.now();
    try {
      const r = await sessao.get(`https://r.jina.ai/${alvo.url}`);
      const corpo = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const achadas = marcas.filter((m) => corpo.includes(m));
      console.log(
        `${alvo.nome.padEnd(22)} HTTP ${r.status} ${String(Date.now() - inicio).padStart(5)}ms bytes=${String(corpo.length).padStart(8)}`,
      );
      console.log(`   marcas: ${achadas.join(', ') || '(nenhuma)'}`);
      const titulo = corpo.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titulo) console.log(`   title: ${titulo[1].trim().slice(0, 90)}`);
      const naoEncontrada = corpo.match(/n[aã]o (?:encontrad|existe)[^<]{0,80}/i);
      if (naoEncontrada) console.log(`   aviso: ${naoEncontrada[0].trim().slice(0, 90)}`);
    } catch (e) {
      console.log(`${alvo.nome.padEnd(22)} ERRO ${e.message}`);
    }
  }
})();

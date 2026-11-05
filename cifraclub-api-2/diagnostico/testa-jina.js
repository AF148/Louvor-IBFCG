/**
 * Testa o r.jina.ai como "ponte" para o Cifra Club.
 *
 * A Akamai bloqueia IP de datacenter, mas o Jina faz o fetch do lado dele
 * e nos devolve a página. Se devolver o HTML original, o parser atual
 * (cheerio) continua valendo sem nenhuma mudança.
 */
const axios = require('axios');

const MUSICA = 'https://www.cifraclub.com.br/prisma-brasil/o-cordeiro-de-deus/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sessao = axios.create({
  proxy: false,
  timeout: 60000,
  maxRedirects: 5,
  validateStatus: () => true,
  headers: { 'User-Agent': UA },
});

const tentativas = [
  { nome: 'html', headers: { 'X-Return-Format': 'html' } },
  { nome: 'markdown', headers: { 'X-Return-Format': 'markdown' } },
  { nome: 'html + engine browser', headers: { 'X-Return-Format': 'html', 'X-Engine': 'browser' } },
];

(async () => {
  for (const t of tentativas) {
    const inicio = Date.now();
    try {
      const r = await sessao.get(`https://r.jina.ai/${MUSICA}`, { headers: t.headers });
      const corpo = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const temChordContainer = /data-chord-container/.test(corpo);
      const temPreTag = /<pre/.test(corpo);
      const temCifra =
        /data-chord-content|data-chord-container|cifra_cnt|js-tab-content/.test(corpo);
      console.log(
        `${t.nome.padEnd(22)} HTTP ${r.status} ${String(Date.now() - inicio).padStart(5)}ms bytes=${String(corpo.length).padStart(8)} container=${temChordContainer} pre=${temPreTag} cifra=${temCifra}`,
      );
      console.log(`   ct=${r.headers['content-type']} | inicio: ${corpo.slice(0, 160).replace(/\s+/g, ' ')}`);
      if (temCifra) {
        // Mostra um trecho ao redor do primeiro marcador de cifra.
        const i = corpo.search(/data-chord-content|data-chord-container|cifra_cnt|js-tab-content/);
        console.log(`   trecho: ...${corpo.slice(Math.max(0, i - 80), i + 300).replace(/\s+/g, ' ')}...`);
      }
    } catch (e) {
      console.log(`${t.nome.padEnd(22)} ERRO ${e.message}`);
    }
  }
})();

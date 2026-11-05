/**
 * Valida o r.jina.ai como ponte para o Cifra Club:
 *  - devolve status 404 quando a música não existe?
 *  - aguenta várias requisições seguidas (rate limit)?
 *  - há um leitor alternativo para usar como segunda opção?
 */
const axios = require('axios');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sessao = axios.create({
  proxy: false,
  timeout: 60000,
  maxRedirects: 5,
  validateStatus: () => true,
  headers: { 'User-Agent': UA, 'X-Return-Format': 'html' },
});

const EXISTE = 'https://www.cifraclub.com.br/prisma-brasil/o-cordeiro-de-deus/';
const NAO_EXISTE = 'https://www.cifraclub.com.br/prisma-brasil/essa-musica-nao-existe-xyz/';

const resumo = (rotulo, r, inicio) => {
  const corpo = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  const temCifra = /data-chord-content|data-chord-container|cifra_cnt/.test(corpo);
  const bloqueio = /Access Denied|Reference&#32;&#35;18\./.test(corpo);
  const restante =
    r.headers['x-ratelimit-remaining'] ?? r.headers['ratelimit-remaining'] ?? '-';
  console.log(
    `${rotulo.padEnd(34)} HTTP ${String(r.status).padEnd(4)} ${String(Date.now() - inicio).padStart(5)}ms bytes=${String(corpo.length).padEnd(7)} cifra=${temCifra} bloqueio=${bloqueio} rateRest=${restante}`,
  );
  if (r.status >= 400) console.log(`   corpo: ${corpo.slice(0, 220).replace(/\s+/g, ' ')}`);
};

(async () => {
  // 1) Música que não existe: o status vem como 404?
  console.log('--- música inexistente ---');
  try {
    const r = await sessao.get(`https://r.jina.ai/${NAO_EXISTE}`);
    resumo('jina / música inexistente', r, Date.now());
  } catch (e) {
    console.log('jina / música inexistente ERRO ' + e.message);
  }

  // 2) Cinco requisições seguidas numa música válida.
  console.log('--- 5 requisições seguidas ---');
  for (let i = 1; i <= 5; i++) {
    const inicio = Date.now();
    try {
      const r = await sessao.get(`https://r.jina.ai/${EXISTE}`);
      resumo(`jina #${i}`, r, inicio);
    } catch (e) {
      console.log(`jina #${i} ERRO ${e.message}`);
    }
  }

  // 3) Leitores alternativos (caso o Jina caia).
  console.log('--- leitores alternativos ---');
  const alternativos = [
    { nome: 'md.dhr.wtf', url: `https://md.dhr.wtf/?url=${encodeURIComponent(EXISTE)}`, headers: {} },
    { nome: 'textance', url: `https://api.textance.com/?url=${encodeURIComponent(EXISTE)}`, headers: {} },
    { nome: 'codetabs html', url: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(EXISTE)}`, headers: {} },
  ];
  for (const alt of alternativos) {
    const inicio = Date.now();
    try {
      const r = await sessao.get(alt.url, { headers: { ...alt.headers, 'X-Return-Format': 'html' } });
      resumo(alt.nome, r, inicio);
    } catch (e) {
      console.log(`${alt.nome.padEnd(34)} ERRO ${e.message}`);
    }
  }
})();

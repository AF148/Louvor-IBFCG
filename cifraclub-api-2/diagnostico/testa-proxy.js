/**
 * Testa se é possível obter a página do Cifra Club por terceiros
 * (proxies públicos / arquivo Wayback). Se algum devolver a cifra,
 * a API da Vercel teria cobertura total mesmo com a Akamai bloqueando.
 */
const axios = require('axios');

const MUSICA = 'https://www.cifraclub.com.br/prisma-brasil/o-cordeiro-de-deus/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sessao = axios.create({
  proxy: false,
  timeout: 45000,
  maxRedirects: 5,
  validateStatus: () => true,
  headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
});

const alvos = [
  { nome: 'direto (controle)', url: MUSICA },
  { nome: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(MUSICA)}` },
  { nome: 'codetabs', url: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(MUSICA)}` },
  { nome: 'corsproxy.io', url: `https://corsproxy.io/?${encodeURIComponent(MUSICA)}` },
  { nome: 'whateverorigin', url: `https://www.whateverorigin.org/get?url=${encodeURIComponent(MUSICA)}` },
  { nome: 'thingproxy', url: `https://thingproxy.freeboard.io/fetch/${MUSICA}` },
  { nome: 'wayback (snapshot)', url: `https://web.archive.org/web/2024id_/${MUSICA}` },
  { nome: 'wayback (availability)', url: `http://archive.org/wayback/available?url=${encodeURIComponent(MUSICA)}` },
  { nome: 'jina reader', url: `https://r.jina.ai/${MUSICA}` },
];

(async () => {
  for (const alvo of alvos) {
    const inicio = Date.now();
    try {
      const r = await sessao.get(alvo.url);
      const corpo = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const temCifra =
        /data-chord-content|data-chord-container|cifra_cnt|js-tab-content/.test(corpo);
      const bloqueado = /Access Denied|Reference #18\./.test(corpo);
      const statusHttp =
        alvo.nome.includes('availability') && corpo.includes('url') ? 'json' : r.status;
      console.log(
        `${alvo.nome.padEnd(24)} HTTP ${String(statusHttp).padEnd(5)} ${String(Date.now() - inicio).padStart(5)}ms bytes=${String(corpo.length).padStart(8)} cifra=${temCifra} bloqueio=${bloqueado}`,
      );
      if (bloqueado) {
        const ref = corpo.match(/Reference&#32;&#35;[0-9.]+/);
        console.log(`   -> Akamai Access Denied${ref ? ' (' + ref[0] + ')' : ''}`);
      }
    } catch (e) {
      console.log(`${alvo.nome.padEnd(24)} ERRO ${e.message}`);
    }
  }
})();

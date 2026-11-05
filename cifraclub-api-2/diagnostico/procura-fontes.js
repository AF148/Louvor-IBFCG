/**
 * Procura fontes alternativas de cifra/letra em português que respondam
 * de IP de datacenter (o Cifra Club bloqueia via Akamai).
 *
 * Mostra status, servidor/CDN e se acharia uma música de teste.
 */
const axios = require('axios');

const sessao = axios.create({
  proxy: false,
  timeout: 20000,
  maxRedirects: 5,
  validateStatus: () => true,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  },
});

const alvos = [
  { nome: 'letras.mus.br (busca)', url: 'https://www.letras.mus.br/busca/?q=o+cordeiro+de+deus' },
  { nome: 'letras.mus.br (raiz)', url: 'https://www.letras.mus.br/' },
  { nome: 'cifragospel.com.br', url: 'https://www.cifragospel.com.br/' },
  { nome: 'cifragospel.com', url: 'https://cifragospel.com/' },
  { nome: 'cifras.mus.br', url: 'https://cifras.mus.br/' },
  { nome: 'cifras.online', url: 'https://www.cifras.online/' },
  { nome: 'letras.mus.br API?', url: 'https://api.letras.mus.br/' },
  { nome: 'ultimate-guitar busca', url: 'https://www.ultimate-guitar.com/search.php?search_type=title&value=o%20cordeiro%20de%20deus' },
  { nome: 'musixmatch', url: 'https://www.musixmatch.com/search/o%20cordeiro%20de%20deus' },
  { nome: 'genius', url: 'https://genius.com/api/search?q=o%20cordeiro%20de%20deus' },
  { nome: 'cifralize (controle)', url: 'https://cifralize.com.br/search?q=cordeiro&format=json' },
];

(async () => {
  for (const alvo of alvos) {
    const inicio = Date.now();
    try {
      const r = await sessao.get(alvo.url);
      const hdr = r.headers || {};
      const cdn =
        hdr['cf-ray'] ? 'Cloudflare'
        : hdr['x-amz-cf-id'] ? 'Cloudflare/AWS'
        : hdr['x-cache'] ? `x-cache=${hdr['x-cache']}`
        : hdr['server'] || '?';
      const corpo = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const achou = /cordeiro/i.test(corpo);
      console.log(
        `${alvo.nome.padEnd(28)} HTTP ${String(r.status).padEnd(4)} ${Date.now() - inicio}ms`,
      );
      console.log(
        `   server=${cdn} | bytes=${corpo.length} | cita "cordeiro": ${achou}`,
      );
    } catch (e) {
      console.log(`${alvo.nome.padEnd(28)} ERRO ${e.message}`);
    }
  }
})();

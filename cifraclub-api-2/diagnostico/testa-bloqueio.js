/**
 * Descobre se o 403 do Cifra Club vem do IP ou do cliente HTTP.
 * Compara axios (que funciona) com fetch nativo e com um cliente "em branco".
 */
const axios = require('axios');

const URL_ALVO = 'https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

function resumo(rotulo, status, corpo) {
  const temCifra = /data-chord-content|cifra_cnt|js-tab-content/.test(corpo || '');
  console.log(
    `${rotulo.padEnd(34)} -> HTTP ${status}  bytes=${String(corpo || '').length}  temCifra=${temCifra}`,
  );
}

(async () => {
  // 1) axios com UA (a config que o servidor usa) — esperado 200
  try {
    const r = await axios.get(URL_ALVO, {
      proxy: false,
      timeout: 20000,
      headers: { 'User-Agent': UA },
      validateStatus: () => true,
    });
    resumo('axios + UA', r.status, r.data);
  } catch (e) {
    console.log(`axios + UA -> ERRO ${e.message}`);
  }

  // 2) fetch nativo (undici) com UA — é o que o navegador/Node novo usam
  try {
    const r = await fetch(URL_ALVO, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    const corpo = await r.text();
    resumo('fetch(nativo) + UA', r.status, corpo);
    if (r.status >= 400) console.log('   corpo 403:', corpo.slice(0, 300).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(`fetch(nativo) -> ERRO ${e.message}`);
  }

  // 3) axios SEM UA — para ver se o bloqueio é por cabeçalho
  try {
    const r = await axios.get(URL_ALVO, {
      proxy: false,
      timeout: 20000,
      validateStatus: () => true,
    });
    resumo('axios sem UA', r.status, r.data);
    if (r.status >= 400) console.log('   corpo:', String(r.data).slice(0, 300).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(`axios sem UA -> ERRO ${e.message}`);
  }
})();

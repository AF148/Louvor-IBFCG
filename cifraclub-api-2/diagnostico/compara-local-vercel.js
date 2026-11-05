/** Compara local × Vercel linha a linha: a ponte pode perder conteúdo? */
const axios = require('axios');

const LOCAL = 'http://localhost:3001';
const VERCEL = 'https://louvor-ibfcg-cifraclub-api-2.vercel.app';

const casos = [
  { n: 'Tempo Perdido', q: 'artist=legiao-urbana&song=tempo-perdido' },
  { n: 'O Cordeiro de Deus', q: 'artist=prisma-brasil&song=o-cordeiro-de-deus' },
  { n: 'Santo Espírito', q: 'artist=david-danner&song=santo-espirito' },
  { n: 'Me Ama', q: 'artist=diante-do-trono&song=me-ama' },
];

const sessao = axios.create({ proxy: false, timeout: 60000, validateStatus: () => true });

const buscar = async (base, q) => {
  try {
    const r = await sessao.get(`${base}/api/cifra-club-2?${q}`);
    return r.data;
  } catch (e) {
    return { error: 'falhou: ' + e.message };
  }
};

(async () => {
  for (const c of casos) {
    const [loc, ver] = await Promise.all([buscar(LOCAL, c.q), buscar(VERCEL, c.q)]);
    const lc = loc.cifra?.length ?? 0;
    const vc = ver.cifra?.length ?? 0;
    const ll = (loc.letra || '').length;
    const vl = (ver.letra || '').length;
    const igual = lc === vc && Math.abs(ll - vl) <= 2;
    console.log(
      `${c.n.padEnd(22)} local=${String(lc).padStart(4)}L/${String(ll).padStart(5)}ch   vercel=${String(vc).padStart(4)}L/${String(vl).padStart(5)}ch   ${igual ? '✅ igual' : '⚠️  DIFERE'}`,
    );
    if (!igual) {
      console.log(`   local erro=${loc.error || '-'} | vercel erro=${ver.error || '-'}`);
      console.log(`   local fonte=${loc.source || '-'} | vercel fonte=${ver.source || '-'}`);
    }
  }
})();

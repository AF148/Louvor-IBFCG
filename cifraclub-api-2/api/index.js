/**
 * Página inicial da API.
 *
 * Sem ela, abrir a raiz do domínio na Vercel devolve o 404 genérico
 * "This page doesn't exist". Aqui explicamos como usar o endpoint de verdade.
 */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    nome: 'API de cifras — Cifra Club (2)',
    status: 'ok',
    uso: '/api/cifra-club-2?artist=<slug-do-artista>&song=<slug-da-musica>',
    exemplo:
      '/api/cifra-club-2?artist=legiao-urbana&song=tempo-perdido',
    dica:
      'artist e song em minúsculas, sem acento e com hífens: "Jeová Rafá" -> "jeova-rafa".',
    responde: 'JSON com cifra[] (linhas), letra, source e cifraclub_url.',
    rotas: ['/api/cifra-club-2', '/api/cifra'],
    aviso:
      'O Cifra Club bloqueia IPs de datacenter; daqui a busca dele costuma falhar e a API cai para o Cifralize.',
  });
};

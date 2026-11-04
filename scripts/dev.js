/**
 * Sobe os dois servidores do modo de desenvolvimento num comando só:
 *
 *   npm run dev
 *
 * 1. API de cifras (cifraclub-api-2/)  -> http://localhost:3001
 * 2. App Angular (ionic serve)         -> http://localhost:8100
 *
 * Sem este passo o botão "Buscar letra e cifra" falha com
 * "Falha ao consultar a API Cifra Club (2)" porque a porta 3001 está fechada.
 * Encerrar com Ctrl+C nos dois, ou fechar o terminal.
 */
const { spawn } = require('child_process');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ehWindows = process.platform === 'win32';

const alvos = [
  {
    rotulo: 'cifra-api',
    cmd: process.execPath,
    args: [path.join(raiz, 'cifraclub-api-2', 'server.js')],
    cwd: raiz,
  },
  {
    rotulo: 'app',
    // `npx`/`ionic` são .cmd no Windows: shell resolve isso por nós.
    cmd: ehWindows ? 'npx.cmd' : 'npx',
    args: ['ionic', 'serve', '--port', '8100', '--no-interactive'],
    cwd: raiz,
    shell: ehWindows,
  },
];

const filhos = [];
let encerrando = false;

for (const alvo of alvos) {
  // Com `shell: true` o Node quer UMA string (concatenar arrays escapa mal).
  const filho = alvo.shell
    ? spawn(`${alvo.cmd} ${alvo.args.join(' ')}`, {
        cwd: alvo.cwd,
        shell: true,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn(alvo.cmd, alvo.args, {
        cwd: alvo.cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

  const prefixar = (texto) =>
    texto
      .split(/\r?\n/)
      .filter((linha) => linha.trim())
      .forEach((linha) => console.log(`[${alvo.rotulo}] ${linha}`));

  filho.stdout.on('data', (d) => prefixar(String(d)));
  filho.stderr.on('data', (d) => prefixar(String(d)));
  filho.on('exit', (codigo, sinal) => {
    if (encerrando) return;
    // A API de cifras caindo não pode derrubar o app: o `CifraService` tem
    // fallback para a Vercel e a busca continua funcionando.
    if (alvo.rotulo === 'cifra-api') {
      prefixar(
        `encerrado (código ${codigo ?? sinal}) — API local fora. O app segue e usa a API da Vercel.`,
      );
      return;
    }
    prefixar(`encerrado (código ${codigo ?? sinal}) — parando os demais.`);
    encerrar(codigo ?? 1);
  });

  filhos.push(filho);
}

function encerrar(codigo) {
  if (encerrando) return;
  encerrando = true;
  for (const filho of filhos) {
    if (filho.exitCode === null) filho.kill();
  }
  process.exit(codigo);
}

process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));

console.log('Subindo API de cifras (3001) e app (8100)... Ctrl+C para parar.');

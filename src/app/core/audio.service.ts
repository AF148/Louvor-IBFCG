import { Injectable, signal, computed, inject } from '@angular/core';
import type { Louvor, Midia } from './models';
import { MidiaService } from './midia.service';

/** Uma faixa navegável pelo player (louvor + seu arquivo de mídia). */
export interface Trilha {
  louvor: Louvor;
  midia: Midia;
}

/**
 * Tocador global de mídia com um único elemento `<audio>`.
 *
 * Centraliza o estado para que a reprodução continue entre páginas: o
 * `<audio>` vive no componente raiz, então navegar não interrompe o louvor.
 */
@Injectable({ providedIn: 'root' })
/** Controla a gravação, reprodução e organização dos áudios usados no aplicativo. */
export class AudioService {
  private elemento: HTMLAudioElement | null = null;
  private objectUrls: string[] = [];
  /** Converte atalhos `fs://` do Firestore em object URL tocável. */
  private readonly midia = inject(MidiaService);

  readonly tocando = signal(false);
  readonly carregando = signal(false);
  readonly atual = signal<Trilha | null>(null);
  readonly posicaoSegundos = signal(0);
  readonly duracaoSegundos = signal(0);
  readonly volume = signal(1);
  readonly erro = signal<string | null>(null);
  readonly urlAtual = signal<string | null>(null);

  /** Fila de reprodução atual: permite ⏮/⏭ entre as faixas do mesmo contexto. */
  readonly fila = signal<Trilha[]>([]);
  /** Índice da faixa em execução dentro da fila (-1 = sem fila). */
  readonly indiceFila = signal(-1);
  /**
   * True quando a faixa em execução veio de um Kit vocal. A barra de play
   * só aparece nesse caso (Repertório/Playlists tocam sem barra visível).
   */
  readonly emKit = signal(false);

  /** Mostra os botões ⏮/⏭ só quando há mais de uma faixa na fila. */
  readonly temFila = computed(() => this.fila().length > 1);
  readonly podeAnterior = computed(() => this.indiceFila() > 0);
  readonly podeProxima = computed(() => {
    const i = this.indiceFila();
    return i >= 0 && i < this.fila().length - 1;
  });

  /** Quando true, a faixa é MP4 e o player mostra vídeo. */
  readonly temVideo = computed(() => this.atual()?.midia.tipo === 'mp4');

  /** Elemento de áudio compartilhado. Deve ser ligado uma única vez no app. */
  registrar(elemento: HTMLAudioElement): void {
    this.elemento = elemento;
    elemento.volume = this.volume();
    elemento.addEventListener('timeupdate', () => {
      this.posicaoSegundos.set(elemento.currentTime);
    });
    elemento.addEventListener('loadedmetadata', () => this.atualizarDuracao(elemento));
    elemento.addEventListener('durationchange', () => this.atualizarDuracao(elemento));
    elemento.addEventListener('playing', () => this.tocando.set(true));
    elemento.addEventListener('pause', () => this.tocando.set(false));
    elemento.addEventListener('waiting', () => this.carregando.set(true));
    elemento.addEventListener('canplay', () => this.carregando.set(false));
    elemento.addEventListener('ended', () => {
      this.tocando.set(false);
      this.posicaoSegundos.set(0);
      // Avança sozinho para a próxima faixa da fila (kits/playlists).
      void this.proxima();
    });
    elemento.addEventListener('error', () => {
      this.carregando.set(false);
      this.erro.set('Não foi possível carregar esta mídia.');
    });
  }

  /**
   * Cria um object URL para arquivo local escolhido no aparelho.
   * Os URLs são revogados em `limparUrlsLocais` ao trocar de faixa.
   */
  urlLocal(arquivo: File): string {
    const url = URL.createObjectURL(arquivo);
    this.objectUrls.push(url);
    return url;
  }

  private limparUrlsLocais(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls = [];
  }

  /**
   * Fixa a fila e a posição da faixa atual. Quando não há fila (arquivo
   * local avulso), a navegação ⏮/⏭ é desativada.
   */
  private definirFila(fila: Trilha[] | undefined, atual: Trilha): void {
    if (!fila || fila.length === 0) {
      this.fila.set([]);
      this.indiceFila.set(-1);
      return;
    }
    // Localiza por URL (identificador estável mesmo com títulos repetidos).
    const idx = fila.findIndex((t) => t.midia.url === atual.midia.url);
    this.fila.set(fila);
    this.indiceFila.set(idx >= 0 ? idx : 0);
  }

  /** Toca a próxima faixa da fila; sem próxima, não faz nada. */
  async proxima(): Promise<void> {
    const i = this.indiceFila() + 1;
    const alvo = this.fila()[i];
    if (!alvo) return;
    await this.tocar(alvo.louvor, alvo.midia, this.fila(), this.emKit());
  }

  /** Volta para a faixa anterior; na primeira, reinicia a faixa atual. */
  async anterior(): Promise<void> {
    const i = this.indiceFila();
    const alvo = this.fila()[i - 1];
    if (!alvo) {
      this.buscar(0);
      return;
    }
    await this.tocar(alvo.louvor, alvo.midia, this.fila(), this.emKit());
  }

  /**
   * Toca uma faixa.
   *
   * `fila` (opcional) define a ordem de navegação dos botões ⏮/⏭: passe a
   * lista completa do contexto. `emKit` marca a faixa como vinda de um Kit
   * vocal — só nesse caso a barra de play aparece no rodapé.
   */
  async tocar(
    louvor: Louvor,
    midia: Midia,
    fila?: Trilha[],
    emKit = false,
  ): Promise<void> {
    if (!midia?.url) {
      this.erro.set('Este louvor não tem arquivo de áudio ou vídeo.');
      return;
    }
    this.definirFila(fila, { louvor, midia });
    this.emKit.set(emKit);
    this.limparUrlsLocais();
    this.erro.set(null);
    this.atual.set({ louvor, midia });
    this.posicaoSegundos.set(0);
    this.duracaoSegundos.set(midia.duracaoSegundos ?? 0);
    // Áudio do Firestore chega como atalho fs://: baixa os pedaços e
    // monta um object URL antes de ligar no elemento <audio>.
    this.carregando.set(true);
    let url: string;
    try {
      url = await this.midia.resolver(midia.url);
    } catch {
      this.carregando.set(false);
      this.erro.set('Não foi possível carregar o arquivo de mídia (verifique a conexão).');
      return;
    }
    this.carregando.set(false);
    this.urlAtual.set(url);
    // Só reatribui quando o valor mudou: gravar o mesmo src dispara um novo
    // load e abortaria o play() com AbortError.
    if (this.elemento && this.elemento.src !== url) this.elemento.src = url;
    if (!this.elemento) return;
    this.elemento.currentTime = 0;
    try {
      await this.elemento.play();
    } catch (err) {
      // Navegadores bloqueiam autoplay sem interação do usuário. Nesse caso
      // o app mostra o botão de play e o usuário libera.
      this.erro.set(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Toque em ▶ para iniciar a reprodução (o navegador bloqueou o autoplay).'
          : 'Falha ao iniciar a reprodução.',
      );
    }
  }

  /** Toca um File local (mp3/mp4 escolhido na hora), sem passar pelo Storage. */
  async tocarArquivoLocal(louvor: Louvor | null, arquivo: File): Promise<void> {
    this.limparUrlsLocais();
    this.erro.set(null);
    const tipo: Midia['tipo'] = arquivo.type.includes('mp4') ? 'mp4' : 'mp3';
    const url = this.urlLocal(arquivo);
    const trilha: Trilha = {
      louvor: louvor ?? ({ id: 'local', titulo: arquivo.name } as Louvor),
      midia: { url, tipo, tamanho: arquivo.size },
    };
    // Arquivo avulso do dispositivo: sem fila (⏮/⏭ ocultos).
    this.definirFila(undefined, trilha);
    this.emKit.set(false);
    this.atual.set(trilha);
    this.posicaoSegundos.set(0);
    this.urlAtual.set(url);
    // Só reatribui quando o valor mudou: gravar o mesmo src dispara um novo
    // load e abortaria o play() com AbortError.
    if (this.elemento && this.elemento.src !== url) this.elemento.src = url;
    if (!this.elemento) return;
    this.elemento.currentTime = 0;
    try {
      await this.elemento.play();
    } catch {
      this.erro.set('Toque em ▶ para iniciar a reprodução.');
    }
  }

  async alternar(): Promise<void> {
    if (!this.elemento) return;
    if (this.elemento.paused) {
      try {
        await this.elemento.play();
      } catch {
        this.erro.set('Toque novamente para iniciar a reprodução.');
      }
    } else {
      this.elemento.pause();
    }
  }

  /**
   * WebM do MediaRecorder frequentemente vem com duration = Infinity/NaN.
   * Usa a duração gravada no Firestore quando o arquivo não informa.
   */
  private atualizarDuracao(elemento: HTMLAudioElement): void {
    const lida = elemento.duration;
    const fallback = this.atual()?.midia.duracaoSegundos ?? 0;
    if (Number.isFinite(lida) && lida > 0) {
      this.duracaoSegundos.set(lida);
      return;
    }
    if (lida === Infinity) {
      const aoAtualizar = () => {
        elemento.removeEventListener('timeupdate', aoAtualizar);
        if (Number.isFinite(elemento.duration) && elemento.duration > 0) {
          this.duracaoSegundos.set(elemento.duration);
        } else if (fallback > 0) {
          this.duracaoSegundos.set(fallback);
        }
        elemento.currentTime = 0;
      };
      elemento.addEventListener('timeupdate', aoAtualizar);
      elemento.currentTime = 1e101;
      return;
    }
    if (fallback > 0) this.duracaoSegundos.set(fallback);
  }

  parar(): void {
    this.elemento?.pause();
    this.tocando.set(false);
  }

  buscar(segundos: number): void {
    if (!this.elemento) return;
    this.elemento.currentTime = Math.max(0, Math.min(segundos, this.duracaoSegundos() || segundos));
  }

  avancar(segundos: number): void {
    this.buscar(this.posicaoSegundos() + segundos);
  }

  definirVolume(valor: number): void {
    const v = Math.max(0, Math.min(1, valor));
    this.volume.set(v);
    if (this.elemento) this.elemento.volume = v;
  }

  progresso = computed(() => {
    const total = this.duracaoSegundos();
    return total > 0 ? this.posicaoSegundos() / total : 0;
  });
}

/** Formata segundos como 'm:ss'. */
/** Converte segundos em minutos e segundos para mostrar no player. */
export function formatarTempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return '0:00';
  const min = Math.floor(segundos / 60);
  const seg = Math.floor(segundos % 60);
  return `${min}:${String(seg).padStart(2, '0')}`;
}

/** Formata 'AAAA-MM-DD' como 'DD/MM/AAAA'. */
/** Formata uma data ISO curta conforme a localidade brasileira. */
export function formatarData(iso: string): string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

/** Formata 'AAAA-MM-DD' como dia da semana por extenso. */
/** Formata a data ISO por extenso para títulos e mensagens ao usuário. */
export function formatarDataExtenso(iso: string): string {
  if (!iso) return '';
  const partes = iso.split('-').map(Number);
  if (partes.length !== 3) return iso;
  const d = new Date(partes[0], partes[1] - 1, partes[2]);
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

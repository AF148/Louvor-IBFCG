import { Injectable, signal, computed, effect, inject, type Signal } from '@angular/core';
import type { Louvor, Midia } from './models';

interface Trilha {
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

  readonly tocando = signal(false);
  readonly carregando = signal(false);
  readonly atual = signal<Trilha | null>(null);
  readonly posicaoSegundos = signal(0);
  readonly duracaoSegundos = signal(0);
  readonly volume = signal(1);
  readonly erro = signal<string | null>(null);
  readonly urlAtual = signal<string | null>(null);

  /** Quando true, a faixa é MP4 e o player mostra vídeo. */
  readonly temVideo = computed(() => this.atual()?.midia.tipo === 'mp4');

  constructor() {
    effect(() => {
      const url = this.urlAtual();
      if (this.elemento && url) {
        this.elemento.src = url;
      }
    });
  }

  /** Elemento de áudio compartilhado. Deve ser ligado uma única vez no app. */
  registrar(elemento: HTMLAudioElement): void {
    this.elemento = elemento;
    elemento.volume = this.volume();
    elemento.addEventListener('timeupdate', () => {
      this.posicaoSegundos.set(elemento.currentTime);
    });
    elemento.addEventListener('durationchange', () => {
      this.duracaoSegundos.set(Number.isFinite(elemento.duration) ? elemento.duration : 0);
    });
    elemento.addEventListener('playing', () => this.tocando.set(true));
    elemento.addEventListener('pause', () => this.tocando.set(false));
    elemento.addEventListener('waiting', () => this.carregando.set(true));
    elemento.addEventListener('canplay', () => this.carregando.set(false));
    elemento.addEventListener('ended', () => {
      this.tocando.set(false);
      this.posicaoSegundos.set(0);
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

  async tocar(louvor: Louvor, midia: Midia): Promise<void> {
    if (!midia?.url) {
      this.erro.set('Este louvor não tem arquivo de áudio ou vídeo.');
      return;
    }
    this.limparUrlsLocais();
    this.erro.set(null);
    this.atual.set({ louvor, midia });
    this.posicaoSegundos.set(0);
    this.urlAtual.set(midia.url);
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
    this.atual.set({
      louvor: louvor ?? ({ id: 'local', titulo: arquivo.name } as Louvor),
      midia: { url, tipo, tamanho: arquivo.size },
    });
    this.posicaoSegundos.set(0);
    this.urlAtual.set(url);
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

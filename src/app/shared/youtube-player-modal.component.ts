import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonItem,
  IonLabel,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  playSkipBackOutline,
  playSkipForwardOutline,
  openOutline,
  play,
} from 'ionicons/icons';
import type { VideoYouTube } from '../core/models';

/** Tipos mínimos da YouTube IFrame API (carregada em tempo de execução). */
interface YTPlayer {
  loadPlaylist(lista: string[], indice?: number, inicioSegundos?: number): void;
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  previousVideo(): void;
  getPlaylistIndex(): number;
  destroy(): void;
}
interface YTOpcoes {
  videoId?: string;
  playerVars?: Record<string, unknown>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number }) => void;
    onError?: (e: unknown) => void;
  };
}
interface YTNamespace {
  Player: new (elemento: HTMLElement, opcoes: YTOpcoes) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/* Estados da YouTube IFrame API. */
const ESTADO_TOCANDO = 1;

/**
 * Player de vídeos do YouTube em um modal. Recebe a lista de vídeos na ordem
 * da playlist e toca em sequência, com anterior/próxima e opção de abrir no
 * app do YouTube.
 */
@Component({
  selector: 'app-youtube-player',
  standalone: true,
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonItem,
    IonLabel,
  ],
  templateUrl: './youtube-player-modal.component.html',
  styleUrls: ['./youtube-player-modal.component.scss'],
})
/** Player compartilhado para reproduzir vídeos do YouTube em um modal. */
export class YoutubePlayerModalComponent implements OnDestroy {
  readonly aberto = signal(false);
  readonly videos = signal<VideoYouTube[]>([]);
  readonly indice = signal(0);
  readonly tocando = signal(false);
  readonly erroVideo = signal<string | null>(null);

  @ViewChild('playerEl') playerEl?: ElementRef<HTMLDivElement>;

  private player: YTPlayer | null = null;

  constructor() {
    addIcons({
      closeOutline,
      playSkipBackOutline,
      playSkipForwardOutline,
      openOutline,
      play,
    });
  }

  get videoAtual(): VideoYouTube | null {
    return this.videos()[this.indice()] ?? null;
  }

  ngOnDestroy(): void {
    this.destruir();
  }

  abrir(videos: VideoYouTube[], inicio = 0): void {
    this.videos.set(videos);
    this.indice.set(inicio);
    this.erroVideo.set(null);
    // Só sinaliza a abertura: o conteúdo fica em <ng-template> e só é
    // montado quando o modal abre. Quem cria o player é aoAbrir() (didPresent),
    // quando o #playerEl já existe no DOM.
    this.aberto.set(true);
  }

  /** Chamado pelo ion-modal depois que o conteúdo <ng-template> montou. */
  aoAbrir(): void {
    void this.criarPlayer();
  }

  fechar(): void {
    this.aberto.set(false);
    this.destruir();
  }

  tocar(): void {
    this.player?.playVideo();
  }

  anterior(): void {
    this.player?.previousVideo();
  }

  proxima(): void {
    this.player?.nextVideo();
  }

  abrirFora(): void {
    const video = this.videoAtual;
    if (!video) return;
    const url = `https://www.youtube.com/watch?v=${video.videoId}`;
    window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
  }

  private async criarPlayer(): Promise<void> {
    const videos = this.videos();
    const indice = this.indice();
    if (!this.aberto() || !videos.length) return;

    const YT = window.YT;
    if (!YT) {
      try {
        await carregarApi();
      } catch {
        this.erroVideo.set('Não foi possível conectar ao player do YouTube.');
        return;
      }
      if (!window.YT) {
        this.erroVideo.set('Não foi possível conectar ao player do YouTube.');
        return;
      }
    }

    // #playerEl vive dentro do <ng-template>; se o @ViewChild ainda não
    // resolveu neste ciclo, procura a área no DOM para não abortar.
    const area =
      this.playerEl?.nativeElement ??
      document
        .querySelector('app-youtube-player')
        ?.querySelector('.yt-area') ??
      null;
    if (!area) return;

    this.destruir();
    area.innerHTML = '';
    // O YT.Player substitui o elemento alvo por um <iframe> de tamanho fixo
    // (640x360). Criamos uma div interna pra ele alvo, mantendo o .yt-area
    // (dimensionado pelo CSS) intacto — assim o vídeo nunca estoura a tela.
    const alvo = document.createElement('div');
    area.appendChild(alvo);
    this.erroVideo.set(null);

    const ids = videos.map((v) => v.videoId);
    const inicio = Math.min(Math.max(0, indice), ids.length - 1);
    const namespace = window.YT as YTNamespace;

    try {
      this.player = new namespace.Player(alvo, {
        videoId: ids[inicio],
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            // O YT.Player cria o iframe com tamanho fixo (640x360). Ajustamos
            // por JS (estilo inline) pra preencher o .yt-area dimensionado —
            // não dá pra confiar em CSS, pois o iframe é criado em tempo de
            // execução sem o atributo de encapsulamento do Angular.
            this.ajustarIframe(area);
            const p = e.target;
            p.loadPlaylist(ids, inicio, 0);
            p.playVideo();
          },
          onStateChange: (e: { data: number }) => {
            this.tocando.set(e.data === ESTADO_TOCANDO);
            if (e.data === ESTADO_TOCANDO) {
              try {
                this.indice.set(this.player?.getPlaylistIndex?.() ?? this.indice());
              } catch {
                this.indice.set(this.indice());
              }
            }
          },
          onError: (e: unknown) => {
            // 101/150 = o dono do vídeo proíbe reprodução embutida (comum em
            // clipes oficiais de gravadora): não é indisponibilidade.
            const codigo = (e as { data?: number } | null)?.data;
            this.erroVideo.set(
              codigo === 101 || codigo === 150
                ? 'Este vídeo não permite tocar dentro do app (restrição do canal). Toque em "Abrir no YouTube".'
                : 'Não foi possível carregar este vídeo (pode ser privado ou indisponível).',
            );
          },
        },
      });
    } catch {
      this.erroVideo.set('Falha ao criar o player do YouTube.');
    }
  }

  /**
   * Dimensiona o vídeo por JS (estilo inline): o YT.Player cria o iframe com
   * tamanho fixo (640x360) e o CSS não pega nele (iframe criado em tempo de
   * execução, sem o atributo do Angular). Trava 16:9, centrado, cabendo na
   * largura da tela e no espaço vertical acima dos controles.
   */
  private ajustarIframe(area: HTMLElement): void {
    const content = area.closest('ion-content');
    const larguraDisp = Math.min(
      content?.clientWidth || window.innerWidth,
      window.innerWidth,
    );
    const alturaDisp = Math.max(180, window.innerHeight - 240);
    const largura = Math.round(Math.min(larguraDisp, alturaDisp * (16 / 9)));
    const altura = Math.round(largura * (9 / 16));
    area.style.width = `${largura}px`;
    area.style.height = `${altura}px`;

    const iframe = area.querySelector('iframe');
    if (iframe) {
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = '0';
      iframe.style.display = 'block';
    }
  }

  private destruir(): void {
    this.player?.destroy();
    this.player = null;
  }
}

let apiPronta: Promise<void> | null = null;

/** Carrega o script da YouTube IFrame API uma única vez. */
function carregarApi(): Promise<void> {
  if (apiPronta) return apiPronta;
  apiPronta = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      anterior?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () =>
      reject(new Error('Falha ao carregar o player do YouTube.'));
    document.head.appendChild(script);
  });
  return apiPronta;
}

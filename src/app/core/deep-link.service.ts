import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StoreService } from './store.service';
import { YoutubeService } from './youtube.service';
import type { Playlist, VideoYouTube } from './models';

/**
 * Recebe playlists do YouTube vindas de fora do app.
 *
 * Duas fontes:
 *  - App empacotado (Capacitor): o link tocado no WhatsApp abre o app e
 *    dispara `appUrlOpen` (ver intent filters no AndroidManifest);
 *  - Navegador: o botão "Importar do YouTube" na tela de Playlists usa o
 *    mesmo fluxo com o link colado, e `?youtubePlaylist=...` permite testar
 *    o comportamento de compartilhamento durante o desenvolvimento.
 */
@Injectable({ providedIn: 'root' })
/** Trata links de entrada e encaminha cada endereço para a tela correspondente. */
export class DeepLinkService {
  private readonly router = inject(Router);
  private readonly store = inject(StoreService);
  private readonly youtube = inject(YoutubeService);

  /** Resultado da última importação (usado para abrir a lista na tela). */
  readonly ultimaImportacao = signal<Playlist | null>(null);
  /** Mensagem de erro ou aviso da última tentativa. */
  readonly mensagem = signal<string | null>(null);
  /** True quando a última mensagem é um erro (para pintar de vermelho). */
  readonly mensagemErro = signal(false);
  /** Quando uma importação está em andamento. */
  readonly importando = signal(false);

  private iniciado = false;

  /** Registra as escutas. Idempotente. */
  async iniciar(): Promise<void> {
    if (this.iniciado) return;
    this.iniciado = true;
    try {
      if (Capacitor.isNativePlatform()) {
        // App já estava em execução quando o link foi aberto.
        App.addListener('appUrlOpen', (dados) => {
          void this.processarLink(dados.url, false);
        });
        // App abriu a partir do link (lançamento a frio).
        const lancamento = await App.getLaunchUrl();
        if (lancamento?.url) {
          void this.processarLink(lancamento.url, true);
        }
      }
    } catch {
      // Em web o plugin @capacitor/app não dispara; segue sem tratar.
    }
    this.importarDaUrlDaWeb();
  }

  /**
   * Importa uma playlist ou vídeo a partir de um link. Usado pelo botão
   * "Importar do YouTube" na tela de Playlists.
   */
  async importarLink(link: string): Promise<Playlist | null> {
    return this.processarLink(link, false);
  }

  /** Limpa o banner de resultado da tela de Playlists. */
  limparMensagem(): void {
    this.mensagem.set(null);
    this.mensagemErro.set(false);
  }

  /**
   * Converte um link do YouTube em uma playlist salva no app.
   * Prefere playlists; na ausência, aceita um vídeo isolado.
   */
  private async processarLink(link: string, irParaLista: boolean): Promise<Playlist | null> {
    this.mensagem.set(null);
    this.mensagemErro.set(false);
    this.importando.set(true);
    try {
      const url = new URL(link, window.location.origin);
      const alvo = desembrulhar(url);
      const playlistId = this.youtube.extrairPlaylistId(alvo.toString());
      let videos: VideoYouTube[];
      let titulo = 'Playlist do YouTube';
      let expandidoDeVideo = false;
      let veioDeVideo = false;
      let youtubeBloqueado = false;

      if (playlistId) {
        videos = await this.youtube.importarPlaylist(playlistId);
      } else {
        const videoId = this.youtube.extrairVideoId(alvo.toString());
        if (!videoId) {
          this.mensagemErro.set(true);
          this.mensagem.set(
            'Link inválido. Envie o link de uma playlist ou de um vídeo do YouTube.',
          );
          return null;
        }
        veioDeVideo = true;
        // Link de vídeo só: se a página do vídeo referencia uma playlist/álbum
        // (o CD), importa ela inteira; senão, fica o vídeo isolado (comportamento
        // antigo). A playlist descoberta nem sempre contém o MESMO vídeo (uploads
        // não oficiais do CD têm outros IDs), então confiam na descoberta da
        // página em vez de exigir a presença do vídeo compartilhado.
        const descoberta = await this.youtube.playlistDoVideo(videoId);
        youtubeBloqueado = descoberta.bloqueado;
        const daPlaylist = descoberta.playlistId
          ? await this.youtube.importarPlaylist(descoberta.playlistId)
          : [];
        if (daPlaylist.length) {
          videos = daPlaylist;
          titulo = 'Playlist do YouTube';
          expandidoDeVideo = true;
        } else {
          const video = await this.youtube.importarVideo(videoId);
          videos = video ? [video] : [];
          titulo = 'Vídeo do YouTube';
        }
      }

      if (!videos.length) {
        if (!this.mensagem()) {
          this.mensagemErro.set(true);
          this.mensagem.set(this.youtube.erro() ?? 'Nenhum vídeo encontrado nesta playlist.');
        }
        return null;
      }

      const agora = Date.now();
      const playlist: Playlist = {
        id: crypto.randomUUID(),
        nome: `${titulo} (${this.formatarCriacao(agora)})`,
        origem: 'youtube',
        linkYouTube: alvo.toString(),
        itens: [],
        itensYouTube: videos.map((v, indice) => ({ ...v, posicao: indice + 1 })),
        criadoEm: agora,
        atualizadoEm: agora,
      };
      await this.store.salvar('playlists', playlist);
      this.ultimaImportacao.set(playlist);
      let mensagemSucesso: string;
      if (expandidoDeVideo) {
        mensagemSucesso = `O vídeo faz parte de uma playlist: importadas ${videos.length} músicas.`;
      } else if (veioDeVideo) {
        // Vídeo avulso: pode ser que a playlist/CD não tenha sido descoberta
        // (vídeo sem playlist, API local fora ou YouTube bloqueando agora).
        if (youtubeBloqueado) {
          mensagemSucesso = 'Importada só esta música: o YouTube bloqueou temporariamente as consultas deste computador. Tente de novo daqui a uns minutos, ou cole o link da playlist (list=...) para trazer as faixas todas.';
        } else {
          mensagemSucesso = videos.length === 1
            ? 'Importada 1 música. Se o vídeo for de um CD, cole o link da playlist (list=...) para trazer as faixas todas.'
            : `Playlist importada com ${videos.length} músicas.`;
        }
      } else {
        mensagemSucesso = `Playlist importada com ${videos.length} ${videos.length === 1 ? 'música' : 'músicas'}.`;
      }
      this.mensagem.set(mensagemSucesso);
      if (irParaLista) {
        await this.router.navigate(['/playlists']);
      }
      return playlist;
    } catch (err) {
      // Sem este catch, uma falha (API do YouTube ou gravação no Firestore)
      // viraria uma rejeição silenciosa e o usuário não veria o motivo.
      this.mensagemErro.set(true);
      this.mensagem.set(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      this.importando.set(false);
    }
  }

  /** Procura `?youtubePlaylist=...` na URL da web para simular um compartilhamento. */
  private importarDaUrlDaWeb(): void {
    const parametro = new URLSearchParams(window.location.search).get(
      'youtubePlaylist',
    );
    if (parametro) {
      // Limpa a URL para um segundo compartilhamento funcionar.
      window.history.replaceState({}, '', window.location.pathname);
      void this.processarLink(parametro, true);
    }
  }

  private formatarCriacao(agora: number): string {
    const d = new Date(agora);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
}

/**
 * Segue embrulhos comuns de compartilhamento para chegar ao link do YouTube:
 * extras 'url='/'link='/'playlist='/'v=' ou caminho 'playlist', 'watch', 'shorts'.
 */
function desembrulhar(url: URL): URL {
  if (url.searchParams.has('playlist')) {
    return new URL(url.searchParams.get('playlist') as string);
  }
  if (url.searchParams.has('link')) {
    return new URL(url.searchParams.get('link') as string);
  }
  if (url.searchParams.has('url')) {
    return new URL(url.searchParams.get('url') as string);
  }
  return url;
}

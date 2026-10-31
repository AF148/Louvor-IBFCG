import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import type { VideoYouTube } from './models';

interface ItemPlaylistAPI {
  snippet?: {
    title?: string;
    resourceId?: { videoId?: string };
    channelTitle?: string;
    position?: number;
  };
  contentDetails?: { duration?: string; videoId?: string };
  /** True quando o item for um trailer/privatizado sem vídeo jogável. */
  status?: { privacyStatus?: string };
}

/**
 * Integração com o YouTube: interpreta links de playlist/vídeo e busca a
 * lista de músicas de uma playlist pela YouTube Data API v3.
 *
 * Requer preencher `environment.youtube.apiKey` (chave gratuita no
 * Google Cloud Console). Sem a chave, nada é importado.
 */
@Injectable({ providedIn: 'root' })
/** Pesquisa vídeos e listas no YouTube e normaliza as respostas para as páginas. */
export class YoutubeService {
  readonly importando = signal(false);
  readonly erro = signal<string | null>(null);

  get apiKey(): string {
    return environment.youtube?.apiKey ?? '';
  }

  /** Extrai o ID de uma playlist a partir de qualquer link/texto do YouTube. */
  extrairPlaylistId(texto: string): string | null {
    const match = /[?&]list=([A-Za-z0-9_-]{13,43})/.exec(texto ?? '');
    return match ? match[1] : null;
  }

  /** Extrai o ID de um vídeo a partir de qualquer link/texto do YouTube. */
  extrairVideoId(texto: string): string | null {
    const textoLimpo = texto ?? '';
    const padrao =
      /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/i;
    const viaUrl = padrao.exec(textoLimpo);
    if (viaUrl) return viaUrl[1];
    const viaYoutu = /youtu\.be\/([A-Za-z0-9_-]{11})/i.exec(textoLimpo);
    return viaYoutu ? viaYoutu[1] : null;
  }

  /**
   * Busca as músicas de uma playlist na API do YouTube. Baixa os títulos,
   * canal e duração de cada vídeo, na ordem da playlist.
   */
  async importarPlaylist(playlistId: string): Promise<VideoYouTube[]> {
    this.erro.set(null);
    if (!this.apiKey) {
      this.erro.set(
        'Chave da YouTube Data API não configurada. Veja a seção "7. Importar playlists do YouTube" em CONFIGURACAO.md.',
      );
      return [];
    }

    this.importando.set(true);
    try {
      const videos: VideoYouTube[] = [];
      let token: string | null = null;
      // Até 5 páginas (250 vídeos) para playlists grandes.
      for (let pagina = 0; pagina < 5; pagina++) {
        const parametros = new URLSearchParams({
          part: 'snippet,contentDetails',
          maxResults: '50',
          playlistId,
          key: this.apiKey,
        });
        if (token) parametros.set('pageToken', token);

        const resposta = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?${parametros}`,
        );
        if (!resposta.ok) {
          throw new Error(
            `Falha ao consultar o YouTube (HTTP ${resposta.status}). Confira se a chave da API está ativa e a playlist é pública.`,
          );
        }
        const dados = (await resposta.json()) as {
          items?: ItemPlaylistAPI[];
          nextPageToken?: string;
        };

        for (const item of dados.items ?? []) {
          const videoId =
            item.snippet?.resourceId?.videoId ?? item.contentDetails?.videoId;
          if (!videoId) continue;
          videos.push({
            videoId,
            titulo: (item.snippet?.title ?? 'Vídeo sem título').trim(),
            canal: item.snippet?.channelTitle?.trim() || undefined,
            duracaoSegundos: duracaoISOparaSegundos(
              item.contentDetails?.duration,
            ),
            posicao: videos.length + 1,
          });
        }
        token = dados.nextPageToken ?? null;
        if (!token) break;
      }
      return videos;
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      this.erro.set(mensagem);
      return [];
    } finally {
      this.importando.set(false);
    }
  }

  /**
   * Descobre a playlist (álbum/CD) a que um vídeo pertence, pela API local
   * (cifraclub-api), que abre a página num navegador de verdade. Devolve a
   * playlistId encontrada (ou null) e sinaliza quando o YouTube bloqueou o
   * IP temporariamente ("unusual traffic") — nesse caso quem chama pode
   * avisar o usuário em vez de fingir que o vídeo não tem playlist.
   */
  async playlistDoVideo(videoId: string): Promise<{ playlistId: string | null; bloqueado: boolean }> {
    const base = (environment.youtubePlaylistApi?.baseUrl ?? '').replace(/\/+$/, '');
    const semResultado = { playlistId: null, bloqueado: false };
    if (!base) return semResultado;
    try {
      // A API abre um navegador Selenium: depende da grade estar morna
      // (a primeira sessão do dia passa de 2 minutos), por isso 180s.
      const res = await fetch(
        `${base}/youtube/playlist-do-video?video_id=${encodeURIComponent(videoId)}`,
        { signal: AbortSignal.timeout(180_000) },
      );
      if (!res.ok) return semResultado;
      const dados = (await res.json()) as { playlistId?: string | null; error?: string };
      return {
        playlistId: dados.playlistId ?? null,
        bloqueado: dados.error === 'bloqueio',
      };
    } catch {
      // API local desligada ou lenta: segue com o vídeo isolado.
      return semResultado;
    }
  }

  /** Busca os dados de um vídeo avulso. Devolve null se não for encontrado. */
  async importarVideo(videoId: string): Promise<VideoYouTube | null> {
    this.erro.set(null);
    if (!this.apiKey) {
      this.erro.set(
        'Chave da YouTube Data API não configurada. Veja a seção "7. Importar playlists do YouTube" em CONFIGURACAO.md.',
      );
      return null;
    }

    this.importando.set(true);
    try {
      const parametros = new URLSearchParams({
        part: 'snippet,contentDetails',
        id: videoId,
        key: this.apiKey,
      });
      const resposta = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${parametros}`,
      );
      if (!resposta.ok) {
        throw new Error(
          `Falha ao consultar o YouTube (HTTP ${resposta.status}).`,
        );
      }
      const dados = (await resposta.json()) as {
        items?: Array<{
          id?: string;
          snippet?: { title?: string; channelTitle?: string };
          contentDetails?: { duration?: string };
        }>;
      };
      const item = dados.items?.[0];
      if (!item?.id) {
        this.erro.set('Vídeo não encontrado ou privado.');
        return null;
      }
      return {
        videoId: item.id,
        titulo: (item.snippet?.title ?? 'Vídeo sem título').trim(),
        canal: item.snippet?.channelTitle?.trim() || undefined,
        duracaoSegundos: duracaoISOparaSegundos(item.contentDetails?.duration),
        posicao: 1,
      };
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      this.erro.set(mensagem);
      return null;
    } finally {
      this.importando.set(false);
    }
  }
}

/**
 * Converte uma duração no formato ISO 8601 (ex.: 'PT4M13S') para segundos.
 * Devolve undefined quando o valor é inválido ou ausente.
 */
/** Converte a duração ISO devolvida pela API do YouTube em segundos. */
export function duracaoISOparaSegundos(iso?: string): number | undefined {
  if (!iso) return undefined;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso.trim());
  if (!match) return undefined;
  const horas = Number(match[1] ?? 0);
  const minutos = Number(match[2] ?? 0);
  const segundos = Number(match[3] ?? 0);
  const total = horas * 3600 + minutos * 60 + segundos;
  return total > 0 ? total : undefined;
}

/** Formata segundos como 'h:mm:ss' ou 'm:ss'. */
/** Formata uma duração em segundos para o formato legível da interface. */
export function formatarDuracao(segundos?: number): string {
  if (!segundos || segundos <= 0) return '';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Miniatura do vídeo, servida pelo próprio YouTube (i.ytimg.com) — não usa
 * a Data API, então não gasta cota. 'mqdefault' = 320x180, bom para linha.
 */
/** Monta o endereço da miniatura padrão a partir do identificador do vídeo. */
export function thumbnailYouTube(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

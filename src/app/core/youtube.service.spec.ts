import { TestBed } from '@angular/core/testing';
import { YoutubeService, duracaoISOparaSegundos, thumbnailYouTube } from './youtube.service';
import { environment } from '../../environments/environment';

describe('YoutubeService', () => {
  let service: YoutubeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(YoutubeService);
    environment.youtube = { apiKey: 'AIzaSyCQX10cB1NyipbeQLsdnLoIXnUUWLKo-RY' };
    environment.youtubePlaylistApi = { baseUrl: 'http://localhost:3000' };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('extrairPlaylistId', () => {
    it('extrai o ID de um link padrão de playlist', () => {
      const link = 'https://www.youtube.com/playlist?list=PLC784E7C9A0E2F6D0&si=abc';
      expect(service.extrairPlaylistId(link)).toBe('PLC784E7C9A0E2F6D0');
    });

    it('extrai o ID de um link de vídeo com lista junto', () => {
      const link = 'https://www.youtube.com/watch?v=abcdEFGhijK&list=PL1234567890abcdefg';
      expect(service.extrairPlaylistId(link)).toBe('PL1234567890abcdefg');
    });

    it('aceita o domínio sem www', () => {
      expect(service.extrairPlaylistId('https://youtube.com/playlist?list=PL1234567890abcdefg')).toBe(
        'PL1234567890abcdefg',
      );
    });

    it('devolve null para texto sem playlist', () => {
      expect(service.extrairPlaylistId('https://www.youtube.com/watch?v=abcdEFGhijK')).toBeNull();
      expect(service.extrairPlaylistId('')).toBeNull();
      expect(service.extrairPlaylistId('texto solto')).toBeNull();
    });
  });

  describe('extrairVideoId', () => {
    it('extrai o ID de um vídeo comum', () => {
      expect(service.extrairVideoId('https://www.youtube.com/watch?v=abcdEFGhijK')).toBe(
        'abcdEFGhijK',
      );
    });

    it('extrai o ID de shorts, embed e youtu.be', () => {
      expect(service.extrairVideoId('https://youtube.com/shorts/abcdEFGhijK')).toBe('abcdEFGhijK');
      expect(service.extrairVideoId('https://www.youtube.com/embed/abcdEFGhijK')).toBe(
        'abcdEFGhijK',
      );
      expect(service.extrairVideoId('https://youtu.be/abcdEFGhijK')).toBe('abcdEFGhijK');
    });

    it('devolve null para texto inválido', () => {
      expect(service.extrairVideoId('qualquer coisa')).toBeNull();
    });
  });

  describe('duracaoISOparaSegundos', () => {
    it('converte durações comuns', () => {
      expect(duracaoISOparaSegundos('PT4M13S')).toBe(253);
      expect(duracaoISOparaSegundos('PT1H2M3S')).toBe(3723);
      expect(duracaoISOparaSegundos('PT45S')).toBe(45);
    });

    it('devolve undefined para valores inválidos ou ausentes', () => {
      expect(duracaoISOparaSegundos(undefined)).toBeUndefined();
      expect(duracaoISOparaSegundos('abc')).toBeUndefined();
      expect(duracaoISOparaSegundos('PT0S')).toBeUndefined();
    });
  });

  describe('importarPlaylist', () => {
    it('avisa (sem erro fatal) quando a chave da API não está configurada', async () => {
      // O beforeEach configura uma chave; este caso precisa dela ausente.
      environment.youtube = { apiKey: '' };
      const videos = await service.importarPlaylist('PL1234567890abcdefg');
      expect(videos).toEqual([]);
      expect(service.erro()).toContain('Chave da YouTube Data API');
    });

    it('busca os vídeos na API e monta a lista com paginação', async () => {
      environment.youtube = { apiKey: 'CHAVE_TESTE' };

      const primeiraPagina = {
        items: [
          {
            snippet: {
              title: 'Louvor 1',
              resourceId: { videoId: 'AAA11111111' },
              channelTitle: 'Coral da Igreja',
              position: 0,
            },
            contentDetails: { duration: 'PT4M13S' },
          },
        ],
        nextPageToken: 'PROXIMA',
      };
      const segundaPagina = {
        items: [
          {
            snippet: { title: 'Louvor 2', resourceId: { videoId: 'BBB22222222' } },
            contentDetails: {},
          },
        ],
      };
      const chamadas: string[] = [];
      const fetchMock = vi.fn(async (url: string | URL) => {
        const texto = String(url);
        chamadas.push(texto);
        const dados = texto.includes('pageToken') ? segundaPagina : primeiraPagina;
        return new Response(JSON.stringify(dados), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const videos = await service.importarPlaylist('PL1234567890abcdefg');

      expect(videos).toHaveLength(2);
      expect(videos[0]).toMatchObject({
        videoId: 'AAA11111111',
        titulo: 'Louvor 1',
        canal: 'Coral da Igreja',
        duracaoSegundos: 253,
        posicao: 1,
      });
      // Sem duração informada na segunda página.
      expect(videos[1].duracaoSegundos).toBeUndefined();
      expect(videos[1].posicao).toBe(2);
      expect(service.erro()).toBeNull();
      expect(chamadas[0]).toContain('playlistId=PL1234567890abcdefg');
      expect(chamadas[0]).toContain('key=CHAVE_TESTE');
      expect(chamadas[1]).toContain('pageToken=PROXIMA');
    });

    it('expõe mensagem de erro quando a API responde com falha', async () => {
      environment.youtube = { apiKey: 'CHAVE_TESTE' };
      vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 403 })));
      const videos = await service.importarPlaylist('PL1234567890abcdefg');
      expect(videos).toEqual([]);
      expect(service.erro()).toContain('HTTP 403');
    });
  });

  describe('importarVideo', () => {
    it('devolve null quando o vídeo não é encontrado', async () => {
      environment.youtube = { apiKey: 'CHAVE_TESTE' };
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
      );
      expect(await service.importarVideo('abcdEFGhijK')).toBeNull();
    });
  });

  describe('thumbnailYouTube', () => {
    it('monta a URL da miniatura no CDN do YouTube', () => {
      expect(thumbnailYouTube('MS-H--XrLQ8')).toBe(
        'https://i.ytimg.com/vi/MS-H--XrLQ8/mqdefault.jpg',
      );
    });
  });

  describe('playlistDoVideo', () => {
    it('devolve a playlistId que a API local descobriu', async () => {
      const fetchMock = vi.fn(
        async (_url: string | URL) =>
          new Response(JSON.stringify({ playlistId: 'OLAK5uy_abc123' }), { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      expect(await service.playlistDoVideo('MS-H--XrLQ8')).toEqual({
        playlistId: 'OLAK5uy_abc123',
        bloqueado: false,
      });
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        '/youtube/playlist-do-video?video_id=MS-H--XrLQ8',
      );
    });

    it('devolve null quando a API não encontra playlist (vídeo avulso)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ playlistId: null }), { status: 200 })),
      );
      expect(await service.playlistDoVideo('MS-H--XrLQ8')).toEqual({
        playlistId: null,
        bloqueado: false,
      });
    });

    it('sinaliza o bloqueio temporário do YouTube ("unusual traffic")', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify({ playlistId: null, error: 'bloqueio' }), {
              status: 200,
            }),
        ),
      );
      expect(await service.playlistDoVideo('MS-H--XrLQ8')).toEqual({
        playlistId: null,
        bloqueado: true,
      });
    });

    it('devolve null quando a API local está desligada ou falha', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('offline');
        }),
      );
      expect(await service.playlistDoVideo('MS-H--XrLQ8')).toEqual({
        playlistId: null,
        bloqueado: false,
      });
    });

    it('não chama rede quando a baseUrl está vazia (recurso desativado)', async () => {
      environment.youtubePlaylistApi = { baseUrl: '' };
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      expect(await service.playlistDoVideo('MS-H--XrLQ8')).toEqual({
        playlistId: null,
        bloqueado: false,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
// Verifica a conversão e a apresentação das informações retornadas pelo YouTube.

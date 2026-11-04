import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Busca de letra e cifra.
 *
 * Duas fontes, complementares:
 * - letra: lyrics.ovh (catálogo comercial; louvor de culto em português
 *   normalmente retorna 404, aí o preenchimento manual continua valendo);
 * - cifra: a API local Cifra Club (2), na pasta `cifraclub-api-2/` (Node.js + Axios + Cheerio),
 *   que lê a página do Cifra Club e devolve a cifra em JSON sem Selenium ou Docker.
 *   A base URL fica em `environment.cifraApi.baseUrl` — vazio desativa a busca.
 *
 * Se a API estiver fora do ar ou a música não existir no Cifra Club, o
 * resultado volta como `aviso`, nunca como exceção, para a tela não quebrar.
 */

interface LetraLyricsOvh {
  lyrics?: string;
}

/** Resposta de `GET /api/cifra-club-2?artist=...&song=...` da API local. */
interface RespostaCifraClub {
  name?: string;
  artist?: string;
  cifraclub_url?: string;
  cifra?: string[];
  letra?: string;
  source?: string;
  error?: string;
}

export interface ResultadoBusca {
  letra?: string;
  /** Só devolvido por APIs de cifras que entreguem o acorde também. */
  cifra?: string;
  /** URL de origem do conteúdo, para gravar em `Louvor.fonteCifra`. */
  fonte?: string;
  /** Nome da fonte efetiva, por exemplo Cifra Club ou Cifralize. */
  fonteNome?: string;
  /** Mensagem para quando a fonte externa não encontra o conteúdo. */
  aviso?: string;
}

@Injectable({ providedIn: 'root' })
/** Busca cifras e oferece funções para ajustar tom e formar endereços de busca. */
export class CifraService {
  /** Contador: letra e cifra são buscadas em paralelo; o spinner só some
   *  quando TODAS as chamadas terminam (um booleano apagaria cedo). */
  private readonly pendentes = signal(0);
  readonly carregando = computed(() => this.pendentes() > 0);
  readonly aviso = signal<string | null>(null);

  private iniciar(): void {
    this.pendentes.update((n) => n + 1);
  }

  private concluir(): void {
    this.pendentes.update((n) => Math.max(0, n - 1));
  }

  /**
   * Tenta obter a letra de um título/artista via lyrics.ovh.
   * Falhas são devolvidas como aviso, nunca lançadas, para a tela não quebrar.
   */
  async buscarLetra(titulo: string, artista: string): Promise<ResultadoBusca> {
    const t = titulo.trim();
    const a = artista.trim();
    if (!t || !a) {
      return { aviso: 'Informe o título e o artista para buscar a letra.' };
    }
    this.iniciar();
    this.aviso.set(null);
    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`;
      const res = await fetch(url);
      if (!res.ok) {
        return {
          aviso:
            'A fonte externa não tem a letra desse louvor. Você pode digitar a letra e a cifra manualmente.',
        };
      }
      const dados = (await res.json()) as LetraLyricsOvh;
      if (!dados.lyrics?.trim()) {
        return { aviso: 'A fonte externa retornou uma letra vazia. Digite manualmente.' };
      }
      return { letra: dados.lyrics.trim() };
    } catch {
      return {
        aviso:
          'Sem conexão com a fonte externa. Você pode digitar a letra e a cifra manualmente.',
      };
    } finally {
      this.concluir();
    }
  }

  /**
   * Busca a cifra na API Node; a letra continua sendo consultada separadamente.
   *
   * Tenta as origens em ordem: `cifraApi.baseUrl` (local, rápida) e depois
   * `cifraApi.fallbackUrl` (API pública na Vercel). Assim o celular — onde
   * `localhost` aponta para o próprio aparelho — e o PC com o servidor
   * desligado continuam conseguindo buscar cifra.
   */
  async buscarCifra(titulo: string, artista: string): Promise<ResultadoBusca> {
    const bases = this.basesCifra();
    if (!bases.length) {
      return {
        aviso:
          'Busca de cifra desativada. Preencha `cifraApi.baseUrl` em src/environments/environment.ts.',
      };
    }
    const t = titulo.trim();
    const a = artista.trim();
    if (!t || !a) {
      return { aviso: 'Informe o título e o artista para buscar a cifra.' };
    }
    this.iniciar();
    this.aviso.set('Consultando o Cifra Club (2)…');
    try {
      const parametros = new URLSearchParams({ artist: slugificar(a), song: slugificar(t) });
      const caminho = `/api/cifra-club-2?${parametros.toString()}`;
      let falha: unknown = null;
      for (const base of bases) {
        try {
          return await this.consultar(`${base}${caminho}`);
        } catch (e) {
          // Só tenta a próxima origem se a anterior nem respondeu (rede,
          // timeout, 5xx). Resposta 4xx é o mesmo problema em qualquer origem.
          falha = e;
        }
      }
      const expirou = falha instanceof DOMException && falha.name === 'TimeoutError';
      return {
        aviso: expirou
          ? 'A API de cifras demorou demais para responder. Tente novamente.'
          : 'Falha ao consultar a API Cifra Club (2). Verifique a internet ou rode `npm run start:cifra` na pasta do projeto.',
      };
    } finally {
      this.concluir();
    }
  }

  /** Origens de cifra na ordem em que serão tentadas (vazias são ignoradas). */
  private basesCifra(): string[] {
    const cfg = environment.cifraApi;
    const limpar = (v?: string) => (v ?? '').trim().replace(/\/+$/, '');
    const bases = [limpar(cfg?.baseUrl), limpar(cfg?.fallbackUrl)].filter(
      (v): v is string => !!v,
    );
    // Sem repetir a mesma URL se as duas forem iguais.
    return [...new Set(bases)];
  }

  /** Faz a chamada e devolve o resultado pronto; lança em falha de rede/5xx. */
  private async consultar(url: string): Promise<ResultadoBusca> {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      // 4xx (ex.: parâmetro inválido) é resposta da própria API: adianta
      // pouco trocar de origem, então devolve a mensagem direto.
      if (res.status < 500) return { aviso: `A API de cifras respondeu ${res.status}.` };
      throw new Error(`HTTP ${res.status}`);
    }
    const dados = (await res.json()) as RespostaCifraClub;
    if (dados.error || !dados.cifra?.length) {
      return {
        letra: dados.letra,
        fonteNome: dados.source,
        aviso:
          dados.error ||
          'Música não encontrada no Cifra Club. Verifique o título/artista ou digite a cifra manualmente.',
        fonte: dados.cifraclub_url,
      };
    }
    return {
      cifra: dados.cifra.join('\n'),
      letra: dados.letra,
      fonte: dados.cifraclub_url,
      fonteNome: dados.source,
    };
  }
}

/**
 * Converte título/artista no slug usado pelo Cifra Club na URL:
 * 'Minha Adoração, Senhor' → 'minha-adoracao-senhor'.
 */
/** Normaliza nomes de músicas para criar caminhos de busca consistentes. */
export function slugificar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SEMAITONS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/**
 * Transpõe a cifra entre tons, útil para adaptar um louvor ao:set do pastor.
 * `semitons` positivo sobe, negativo desce.
 */
/** Transpõe os acordes reconhecidos sem alterar as linhas de letra da cifra. */
export function transpor(cifra: string, semitons: number): string {
  if (!cifra || semitons === 0) return cifra;
  // A nota pode ser seguida de letra ('sus4'), símbolo ou fim de linha. Por isso
  // o lookahead em vez de \b: 'Csus4' e 'C#' não têm fronteira de palavra depois
  // da nota, e \b os deixaria de fora.
  return cifra.replace(
    /\b([A-G][#b]?)(m|maj|min|dim|aug|sus|add|°|\+)?(?![a-zA-Z])/g,
    (match, nota: string, sufixo = '') => {
      const base = SEMAITONS[nota];
      if (base === undefined) return match;
      const alvo = ((base + semitons) % 12 + 12) % 12;
      const novo = NOTAS[alvo];
      // Ao subir de um sustenh para uma nota natural, prefere bemol.
      // Se o acorde original usava bemol, mantém bemol no resultado. Sem isso
      // quem escreve em Gb veria o tom virar G#.
      const final =
        nota.includes('b') && novo.includes('#') ? bemolDe(novo) : novo;
      return `${final}${sufixo}`;
    },
  );
}

function bemolDe(nota: string): string {
  const mapa: Record<string, string> = {
    'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
  };
  return mapa[nota] ?? nota;
}

/** Semitons entre dois tons, ex.: distância('C', 'G') === 7. */
/** Calcula o intervalo em semitons entre dois tons musicais. */
export function distancia(de: string, para: string): number {
  const a = SEMAITONS[de.trim()];
  const b = SEMAITONS[para.trim()];
  if (a === undefined || b === undefined) return 0;
  return ((b - a) % 12 + 12) % 12;
}

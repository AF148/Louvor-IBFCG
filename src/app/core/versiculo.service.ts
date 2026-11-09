import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { extrairVersiculos } from './biblia-conteudo.util';

interface RespostaVersiculo {
  reference: string;
  text: string;
  translation?: { name: string };
}

interface CapituloLivro {
  id: string;
  number: string;
}

interface LivroApi {
  id: string;
  name: string;
  chapters: CapituloLivro[];
}

const BASE = 'https://rest.api.bible/v1';
const BIBLE_ID = environment.bible.ntlhId;
/**
 * Versão nova do cache: a chave antiga (`versiculo:livros`) guardava a lista
 * da bible-api.com, que não tem o campo `chapters` — ler esse formato antigo
 * derrubava o versículo do dia com "livro.chapters is undefined".
 */
const CACHE_LIVROS = 'versiculo:livros:v2';
const CACHE_LIVROS_ANTIGO = 'versiculo:livros';
const CACHE_CAPITULOS_ANTIGO = 'versiculo:capitulos:';
const NOME_TRADUCAO = 'Nova Tradução na Linguagem de Hoje';

/**
 * Versículo do dia via API.Bible, versão NTLH (Nova Tradução na Linguagem
 * de Hoje) — a única em português liberada no plano gratuito do serviço.
 *
 * A escolha é determinística a partir da data: o mesmo dia devolve sempre o
 * mesmo versículo, e o texto fica guardado no aparelho para aparecer offline.
 *
 * A API não oferece "versículo aleatório", e gerar a referência por conta
 * própria erra: nem todo livro tem 20 capítulos nem todo capítulo tem 25
 * versículos. Por isso o serviço consulta a lista de livros (com cache no
 * aparelho) e só então escolhe capítulo e versículo que existem de fato.
 */
@Injectable({ providedIn: 'root' })
/** Fornece o versículo de destaque exibido na tela inicial do aplicativo. */
export class VersiculoService {
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly versiculo = signal<RespostaVersiculo | null>(this.lerDoCache());

  constructor() {
    this.limparCacheAntigo();
  }

  /** Apaga os caches da versão anterior (bible-api.com), de formato incompatível. */
  private limparCacheAntigo(): void {
    try {
      for (const chave of Object.keys(localStorage)) {
        if (chave === CACHE_LIVROS_ANTIGO || chave.startsWith(CACHE_CAPITULOS_ANTIGO)) {
          localStorage.removeItem(chave);
        }
      }
    } catch {
      // Sem storage acessível: o cache novo faz a validação de qualquer forma.
    }
  }

  private async buscar<T>(caminho: string): Promise<T> {
    const res = await fetch(`${BASE}${caminho}`, {
      headers: { 'api-key': environment.bible.apiKey, 'Content-Type': 'text/plain' },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('a chave da API.Bible foi recusada.');
      if (res.status === 429) throw new Error('limite de chamadas da API.Bible atingido.');
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private lerCache<T>(chave: string): T | null {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto ? (JSON.parse(bruto) as T) : null;
    } catch {
      return null;
    }
  }

  private gravarCache(chave: string, valor: unknown): void {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // Sem espaço para cache; a busca online ainda funciona nesta sessão.
    }
  }

  /** Semente estável para o dia, usada em todas as escolhas. */
  private sementeDoDia(): number {
    const hoje = new Date();
    const inicioDoDia = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return Math.floor(inicioDoDia / 86_400_000);
  }

  private chaveDoDia(data = new Date()): string {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  private lerDoCache(): RespostaVersiculo | null {
    return this.lerCache<RespostaVersiculo>(`versiculo:${this.chaveDoDia()}`);
  }

  private async livros(): Promise<LivroApi[]> {
    // Só aceita do cache a lista no formato novo (livro com capítulos).
    // Qualquer outro formato é descartado e a lista é baixada de novo.
    const cacheBom = this.somenteLivrosComCapitulos(this.lerCache<unknown>(CACHE_LIVROS));
    if (cacheBom.length) return cacheBom;
    // Um único endpoint devolve os 66 livros já com a lista de capítulos.
    const dados = await this.buscar<{ data?: LivroApi[] }>(`/bibles/${BIBLE_ID}/books?include-chapters=true`);
    const livros = this.somenteLivrosComCapitulos(Array.isArray(dados.data) ? dados.data : []);
    if (!livros.length) throw new Error('a API não devolveu a lista de livros.');
    this.gravarCache(CACHE_LIVROS, livros);
    return livros;
  }

  /** Filtra entradas sem id, sem nome ou sem capítulos (cache de outra fonte). */
  private somenteLivrosComCapitulos(valor: unknown): LivroApi[] {
    if (!Array.isArray(valor)) return [];
    const livros: LivroApi[] = [];
    for (const bruto of valor) {
      if (!bruto || typeof bruto !== 'object') continue;
      const livro = bruto as Partial<LivroApi> & { chapters?: unknown };
      if (typeof livro.id !== 'string' || typeof livro.name !== 'string') continue;
      if (!Array.isArray(livro.chapters)) continue;
      const capituloValido = (cap: unknown): cap is CapituloLivro => {
        if (!cap || typeof cap !== 'object') return false;
        const c = cap as Partial<CapituloLivro>;
        return typeof c.id === 'string' && c.id.length > 0 && c.number !== undefined && c.number !== null;
      };
      const capitulo: CapituloLivro[] = livro.chapters
        .filter(capituloValido)
        // Ignora capítulos editoriais ("intro"): o versículo do dia precisa
        // de um capítulo com versículos numerados de verdade.
        .filter((c) => /^\d+$/.test(String(c.number)))
        .map((c) => ({ id: c.id, number: String(c.number) }));
      if (!capitulo.length) continue;
      livros.push({ id: livro.id, name: livro.name, chapters: capitulo });
    }
    return livros;
  }

  async carregar(): Promise<void> {
    const emCache = this.lerDoCache();
    if (emCache) {
      this.versiculo.set(emCache);
      this.erro.set(null);
      return;
    }

    this.carregando.set(true);
    this.erro.set(null);
    const semente = this.sementeDoDia();

    try {
      const livros = await this.livros();
      const livro = livros[semente % livros.length];
      if (!livro) throw new Error('a API não devolveu a lista de livros.');

      const capitulo = livro.chapters[(semente * 7) % livro.chapters.length];
      if (!capitulo) throw new Error(`a API não devolveu os capítulos de ${livro.name}.`);

      const dados = await this.buscar<{ data?: { content?: unknown } }>(
        `/bibles/${BIBLE_ID}/chapters/${encodeURIComponent(capitulo.id)}?content-type=json`,
      );
      const versiculos = extrairVersiculos(dados.data?.content);
      if (!versiculos.length) throw new Error('o capítulo escolhido não tem versículos.');

      const escolhido = versiculos[(semente * 13) % versiculos.length];
      const limpo: RespostaVersiculo = {
        reference: `${livro.name} ${capitulo.number}:${escolhido.numero}`,
        text: escolhido.texto,
        translation: { name: NOME_TRADUCAO },
      };

      this.versiculo.set(limpo);
      this.gravarCache(`versiculo:${this.chaveDoDia()}`, limpo);
    } catch (err) {
      this.erro.set(
        err instanceof Error
          ? `Não foi possível carregar o versículo: ${err.message}`
          : 'Não foi possível carregar o versículo.',
      );
    } finally {
      this.carregando.set(false);
    }
  }

  /** Limpa o cache do dia para forçar nova busca. */
  limparCache(): void {
    try {
      localStorage.removeItem(`versiculo:${this.chaveDoDia()}`);
    } catch {
      // Ignora falha de storage.
    }
  }
}

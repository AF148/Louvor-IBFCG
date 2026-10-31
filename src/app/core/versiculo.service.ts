import { Injectable, signal } from '@angular/core';

interface RespostaVersiculo {
  reference: string;
  text: string;
  translation?: { name: string };
}

interface LivroApi {
  id: string;
  name: string;
}

interface CapítuloApi {
  book_id: string;
  book: string;
  chapter: number;
}

const BASE = 'https://bible-api.com';
const TRADUCAO = 'almeida';
const CACHE_LIVROS = 'versiculo:livros';
const CACHE_CAPITULOS = 'versiculo:capitulos';

/**
 * Versículo do dia via bible-api.com (domínio público, sem chave de API).
 *
 * A escolha é determinística a partir da data, então o mesmo dia devolve
 * sempre o mesmo versículo e o texto fica guardado para ser exibido offline.
 *
 * A API não oferece "versículo aleatório", e gerar a referência por conta
 * própria erra: nem todo livro tem 20 capítulos nem todo capítulo tem 25
 * versículos, o que produz 404. Por isso o serviço consulta a lista de livros
 * e de capítulos (com cache no aparelho) e só então escolhe uma referência que
 * existe de fato.
 */
@Injectable({ providedIn: 'root' })
/** Fornece textos bíblicos curtos usados como versículo de destaque no aplicativo. */
export class VersiculoService {
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly versiculo = signal<RespostaVersiculo | null>(this.lerDoCache());

  private async buscar<T>(caminho: string): Promise<T> {
    const res = await fetch(`${BASE}${caminho}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    const doCache = this.lerCache<LivroApi[]>(CACHE_LIVROS);
    if (doCache?.length) return doCache;
    const dados = await this.buscar<{ books: LivroApi[] }>(`/data/${TRADUCAO}`);
    this.gravarCache(CACHE_LIVROS, dados.books);
    return dados.books;
  }

  private async capitulos(livroId: string): Promise<CapítuloApi[]> {
    const chave = `${CACHE_CAPITULOS}:${livroId}`;
    const doCache = this.lerCache<CapítuloApi[]>(chave);
    if (doCache?.length) return doCache;
    const dados = await this.buscar<{ chapters: CapítuloApi[] }>(`/data/${TRADUCAO}/${livroId}`);
    this.gravarCache(chave, dados.chapters);
    return dados.chapters;
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
      if (!livro) throw new Error('A API não devolveu a lista de livros.');

      const capitulos = await this.capitulos(livro.id);
      const capitulo = capitulos[(semente * 7) % capitulos.length];
      if (!capitulo) throw new Error('A API não devolveu os capítulos do livro.');

      // O capítulo vem com os versículos, então dá para escolher um que existe
      // e ler o texto na mesma requisição.
      const dados = await this.buscar<{ verses: { verse: number; text: string }[] }>(
        `/data/${TRADUCAO}/${livro.id}/${capitulo.chapter}`,
      );
      const versiculos = dados.verses;
      if (!versiculos.length) throw new Error('O capítulo escolhido não tem versículos.');

      const escolhido = versiculos[(semente * 13) % versiculos.length];
      const limpo: RespostaVersiculo = {
        reference: `${capitulo.book} ${capitulo.chapter}:${escolhido.verse}`,
        text: escolhido.text.trim(),
        translation: { name: 'João Ferreira de Almeida' },
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

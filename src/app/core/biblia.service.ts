import { Injectable } from '@angular/core';

export interface BibliaVersiculo {
  numero: number;
  texto: string;
}

export interface BibliaCapitulo {
  numero: number;
  versiculos: BibliaVersiculo[];
}

export interface BibliaLivro {
  nome: string;
  capitulos: BibliaCapitulo[];
}

export interface BibliaVersao {
  sigla: string;
  nome: string;
  pais?: string;
  livros: BibliaLivro[];
  importadaEm: number;
}

const DB_NOME = 'scale-biblia';
const DB_VERSAO = 2;
const STORE_VERSOES = 'versoes';
const STORE_CAPITULOS_API = 'capitulos-api';
const PRAZO_CACHE_API_MS = 14 * 24 * 60 * 60 * 1000;
const ORDEM_LIVROS_BIBLIA = [
  'Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio', 'Josué', 'Juízes', 'Rute',
  '1 Samuel', '2 Samuel', '1 Reis', '2 Reis', '1 Crônicas', '2 Crônicas', 'Esdras', 'Neemias', 'Ester',
  'Jó', 'Salmos', 'Provérbios', 'Eclesiastes', 'Cântico dos Cânticos', 'Isaías', 'Jeremias', 'Lamentações',
  'Ezequiel', 'Daniel', 'Oséias', 'Joel', 'Amós', 'Obadias', 'Jonas', 'Miquéias', 'Naum', 'Habacuque',
  'Sofonias', 'Ageu', 'Zacarias', 'Malaquias', 'Mateus', 'Marcos', 'Lucas', 'João', 'Atos', 'Romanos',
  '1 Coríntios', '2 Coríntios', 'Gálatas', 'Efésios', 'Filipenses', 'Colossenses', '1 Tessalonicenses',
  '2 Tessalonicenses', '1 Timóteo', '2 Timóteo', 'Tito', 'Filemom', 'Hebreus', 'Tiago', '1 Pedro',
  '2 Pedro', '1 João', '2 João', '3 João', 'Judas', 'Apocalipse',
];
const API_BIBLE_URL = 'https://rest.api.bible/v1';
const API_CHAVE_STORAGE = 'scale-biblia-api-key';

export interface BibliaApiItem {
  id: string;
  abbreviation?: string;
  abbreviationLocal?: string;
  name: string;
  nameLocal?: string;
  language?: { id?: string; name?: string; nameLocal?: string };
  countries?: Array<{ id: string; name: string; nameLocal: string }>;
}

export interface BibliaApiLivro {
  id: string;
  name: string;
  nameLocal?: string;
  chapters: Array<{ id: string; number: string; reference: string }>;
}

/** Capítulo API.Bible guardado temporariamente para leitura sem conexão. */
export interface BibliaApiCapituloOffline {
  id: string;
  bibleId: string;
  chapterId: string;
  content: unknown;
  copyright: string;
  savedAt: number;
  bible: BibliaApiItem;
  livros: BibliaApiLivro[];
}

export interface BibliaApiResultadoBusca {
  id: string;
  bibleId: string;
  bookId: string;
  chapterId: string;
  text: string;
  reference: string;
}

@Injectable({ providedIn: 'root' })
/** Guarda versões importadas localmente e concentra as chamadas autenticadas à API.Bible. */
export class BibliaService {
  /** Recupera a chave salva no navegador; ela não é incluída no código compilado. */
  lerChaveApi(): string {
    return localStorage.getItem(API_CHAVE_STORAGE) ?? '';
  }

  /** Persiste ou remove a chave privada apenas no armazenamento deste navegador. */
  salvarChaveApi(chave: string): void {
    const valor = chave.trim();
    if (valor) localStorage.setItem(API_CHAVE_STORAGE, valor);
    else localStorage.removeItem(API_CHAVE_STORAGE);
  }

  async validarChaveApi(chave: string): Promise<number> {
    return (await this.listarBiblesApi(chave)).length;
  }

  /** Consulta versões permitidas pela conta usando a chave informada. */
  async listarBiblesApi(chave = this.lerChaveApi()): Promise<BibliaApiItem[]> {
    const dados = await this.apiGet<{ data?: BibliaApiItem[] }>('/bibles', chave);
    return Array.isArray(dados.data) ? dados.data : [];
  }

  /** Busca livros e capítulos em uma chamada para preencher os seletores do leitor. */
  async listarLivrosApi(bibleId: string): Promise<BibliaApiLivro[]> {
    const dados = await this.apiGet<{ data?: BibliaApiLivro[] }>(`/bibles/${encodeURIComponent(bibleId)}/books?include-chapters=true`);
    return Array.isArray(dados.data) ? dados.data : [];
  }

  /** Busca o conteúdo estruturado do capítulo e os dados de atribuição da tradução. */
  async carregarCapituloApi(bibleId: string, chapterId: string): Promise<{ content: unknown; copyright: string; fumsToken?: string }> {
    const query = new URLSearchParams({ 'content-type': 'json', 'include-titles': 'true' });
    const dados = await this.apiGet<{ data?: { content?: unknown; copyright?: string }; meta?: { fumsToken?: string } }>(
      `/bibles/${encodeURIComponent(bibleId)}/chapters/${encodeURIComponent(chapterId)}?${query}`,
    );
    return { content: dados.data?.content ?? [], copyright: dados.data?.copyright ?? '', fumsToken: dados.meta?.fumsToken };
  }

  /** Guarda no aparelho um capítulo autorizado; respeita o limite de cache da API.Bible. */
  async salvarCapituloApiOffline(capitulo: Omit<BibliaApiCapituloOffline, 'id' | 'savedAt'>): Promise<void> {
    const quantidade = this.contarVersiculos(capitulo.content);
    if (quantidade >= 500) throw new Error('Este capítulo ultrapassa o limite de 499 versículos para armazenamento offline.');
    const db = await this.abrirBanco();
    try {
      await this.limparCacheApiExpirado(db);
      const existentes = await new Promise<BibliaApiCapituloOffline[]>((resolve, reject) => {
        const pedido = db.transaction(STORE_CAPITULOS_API, 'readonly').objectStore(STORE_CAPITULOS_API).getAll();
        pedido.onsuccess = () => resolve(pedido.result as BibliaApiCapituloOffline[]);
        pedido.onerror = () => reject(pedido.error ?? new Error('Não foi possível verificar o espaço offline.'));
      });
      const jaSalvos = existentes
        .filter((item) => item.bibleId === capitulo.bibleId && item.chapterId !== capitulo.chapterId)
        .reduce((total, item) => total + this.contarVersiculos(item.content), 0);
      if (jaSalvos + quantidade >= 500) {
        throw new Error('A API.Bible permite armazenar menos de 500 versículos consecutivos. Remova alguns capítulos salvos antes de baixar mais.');
      }
      await new Promise<void>((resolve, reject) => {
        const registro: BibliaApiCapituloOffline = {
          ...capitulo,
          id: `${capitulo.bibleId}|${capitulo.chapterId}`,
          savedAt: Date.now(),
        };
        const tx = db.transaction(STORE_CAPITULOS_API, 'readwrite');
        tx.objectStore(STORE_CAPITULOS_API).put(registro);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Não foi possível salvar o capítulo offline.'));
        tx.onabort = () => reject(tx.error ?? new Error('O salvamento offline foi cancelado.'));
      });
    } finally {
      db.close();
    }
  }

  /** Lista capítulos baixados que ainda estão dentro do prazo recomendado de cache. */
  async listarCapitulosApiOffline(): Promise<BibliaApiCapituloOffline[]> {
    const db = await this.abrirBanco();
    try {
      await this.limparCacheApiExpirado(db);
      return await new Promise((resolve, reject) => {
        const pedido = db.transaction(STORE_CAPITULOS_API, 'readonly').objectStore(STORE_CAPITULOS_API).getAll();
        pedido.onsuccess = () => resolve(pedido.result as BibliaApiCapituloOffline[]);
        pedido.onerror = () => reject(pedido.error ?? new Error('Não foi possível listar os capítulos offline.'));
      });
    } finally {
      db.close();
    }
  }

  /** Procura a cópia local do capítulo selecionado. */
  async buscarCapituloApiOffline(bibleId: string, chapterId: string): Promise<BibliaApiCapituloOffline | null> {
    const db = await this.abrirBanco();
    try {
      const registro = await new Promise<BibliaApiCapituloOffline | undefined>((resolve, reject) => {
        const pedido = db.transaction(STORE_CAPITULOS_API, 'readonly').objectStore(STORE_CAPITULOS_API).get(`${bibleId}|${chapterId}`);
        pedido.onsuccess = () => resolve(pedido.result as BibliaApiCapituloOffline | undefined);
        pedido.onerror = () => reject(pedido.error ?? new Error('Não foi possível abrir o capítulo offline.'));
      });
      if (!registro) return null;
      if (Date.now() - registro.savedAt > PRAZO_CACHE_API_MS) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_CAPITULOS_API, 'readwrite');
          tx.objectStore(STORE_CAPITULOS_API).delete(registro.id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
        return null;
      }
      return registro;
    } finally {
      db.close();
    }
  }

  /** Remove um capítulo offline quando o usuário quiser liberar espaço do cache. */
  async removerCapituloApiOffline(bibleId: string, chapterId: string): Promise<void> {
    const db = await this.abrirBanco();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CAPITULOS_API, 'readwrite');
        tx.objectStore(STORE_CAPITULOS_API).delete(`${bibleId}|${chapterId}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Não foi possível remover o capítulo offline.'));
      });
    } finally {
      db.close();
    }
  }

  /** Pesquisa palavras na versão online e devolve resultados paginados por 50 itens. */
  async pesquisarApi(bibleId: string, termo: string, offset = 0): Promise<{ resultados: BibliaApiResultadoBusca[]; total: number }> {
    const query = new URLSearchParams({ query: termo, limit: '50', offset: String(offset), sort: 'canonical' });
    const dados = await this.apiGet<{ data?: { verses?: BibliaApiResultadoBusca[]; total?: number } }>(
      `/bibles/${encodeURIComponent(bibleId)}/search?${query}`,
    );
    return { resultados: dados.data?.verses ?? [], total: dados.data?.total ?? 0 };
  }

  /** Aplica autenticação e mensagens comuns a todas as chamadas REST da API.Bible. */
  private async apiGet<T>(path: string, chave = this.lerChaveApi()): Promise<T> {
    if (!chave.trim()) throw new Error('Informe e salve sua chave da API.Bible.');
    const resposta = await fetch(`${API_BIBLE_URL}${path}`, {
      headers: { 'api-key': chave.trim(), 'Content-Type': 'text/plain' },
    });
    if (!resposta.ok) {
      if (resposta.status === 401 || resposta.status === 403) throw new Error('Chave inválida ou sem acesso a essa versão na API.Bible.');
      if (resposta.status === 429) throw new Error('Limite de chamadas da API.Bible atingido. Tente novamente mais tarde.');
      throw new Error(`A API.Bible respondeu com erro (${resposta.status}).`);
    }
    return await resposta.json() as T;
  }

  /** Abre o banco IndexedDB usado para guardar as versões importadas neste dispositivo. */
  private abrirBanco(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const pedido = indexedDB.open(DB_NOME, DB_VERSAO);
      pedido.onupgradeneeded = () => {
        if (!pedido.result.objectStoreNames.contains(STORE_VERSOES)) {
          pedido.result.createObjectStore(STORE_VERSOES, { keyPath: 'sigla' });
        }
        if (!pedido.result.objectStoreNames.contains(STORE_CAPITULOS_API)) {
          pedido.result.createObjectStore(STORE_CAPITULOS_API, { keyPath: 'id' });
        }
      };
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error ?? new Error('Não foi possível abrir o armazenamento da Bíblia.'));
    });
  }

  /** Remove cópias com mais de 14 dias, conforme a recomendação de cache da API.Bible. */
  private async limparCacheApiExpirado(db: IDBDatabase): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CAPITULOS_API, 'readwrite');
      const store = tx.objectStore(STORE_CAPITULOS_API);
      const pedido = store.openCursor();
      pedido.onsuccess = () => {
        const cursor = pedido.result;
        if (!cursor) return;
        const registro = cursor.value as BibliaApiCapituloOffline;
        if (Date.now() - registro.savedAt > PRAZO_CACHE_API_MS) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Não foi possível atualizar o cache offline.'));
    });
  }

  /** Conta IDs de versículos no JSON da API para impedir cache de capítulos extensos. */
  private contarVersiculos(valor: unknown): number {
    const ids = new Set<string>();
    const visitar = (item: unknown): void => {
      if (Array.isArray(item)) { item.forEach(visitar); return; }
      if (!item || typeof item !== 'object') return;
      const bloco = item as Record<string, unknown>;
      const attrs = bloco['attrs'] as Record<string, unknown> | undefined;
      if (typeof attrs?.['verseId'] === 'string') ids.add(attrs['verseId']);
      if (Array.isArray(bloco['items'])) visitar(bloco['items']);
    };
    visitar(valor);
    return ids.size;
  }

  /** Lê as versões que já foram importadas no navegador. */
  async listar(): Promise<BibliaVersao[]> {
    const db = await this.abrirBanco();
    try {
      return await new Promise((resolve, reject) => {
        const pedido = db.transaction(STORE_VERSOES, 'readonly').objectStore(STORE_VERSOES).getAll();
        pedido.onsuccess = () => resolve((pedido.result as BibliaVersao[]).sort((a, b) => a.sigla.localeCompare(b.sigla)));
        pedido.onerror = () => reject(pedido.error ?? new Error('Não foi possível listar as versões salvas.'));
      });
    } finally {
      db.close();
    }
  }

  /** Valida e salva um arquivo JSON de versão bíblica no IndexedDB. */
  async importar(arquivo: File): Promise<BibliaVersao[]> {
    let bruto: unknown;
    try {
      // Remove BOM UTF-8 comum em arquivos JSON baixados para Windows.
      bruto = JSON.parse((await arquivo.text()).replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('O arquivo precisa estar em JSON válido.');
    }
    const raiz = bruto as { versoes?: unknown[] } | null;
    const listaDeLivros = Array.isArray(bruto) && bruto.length > 0 && bruto.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const livro = item as Record<string, unknown>;
      return typeof livro['abbrev'] === 'string' && typeof livro['name'] === 'string' && Array.isArray(livro['chapters']);
    });
    // Também aceita catálogos bíblicos no formato bible-json: lista de livros com capítulos e versículos em arrays.
    const nomeDoArquivo = this.nomeVersaoPeloArquivo(arquivo.name);
    const entradas = listaDeLivros
      ? [{ nome: nomeDoArquivo, livros: bruto }]
      : Array.isArray(bruto) ? bruto : Array.isArray(raiz?.versoes) ? raiz.versoes : [bruto];
    const versoes = entradas.map((entrada) => this.normalizarVersao(entrada, nomeDoArquivo));
    if (!versoes.length) throw new Error('O arquivo não contém nenhuma versão bíblica.');

    const db = await this.abrirBanco();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_VERSOES, 'readwrite');
        for (const versao of versoes) tx.objectStore(STORE_VERSOES).put(versao);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Não foi possível salvar as versões.'));
        tx.onabort = () => reject(tx.error ?? new Error('A importação foi cancelada.'));
      });
      return versoes;
    } finally {
      db.close();
    }
  }

  /** Converte formatos de JSON aceitos para o modelo interno usado pelo leitor. */
  private normalizarVersao(valor: unknown, nomeDoArquivo = ''): BibliaVersao {
    if (!valor || typeof valor !== 'object') throw new Error('O arquivo precisa conter um objeto JSON com nome da versão e os textos bíblicos.');
    const raiz = valor as Record<string, unknown>;
    const nome = String(raiz['nome'] ?? raiz['name'] ?? raiz['nomeVersao'] ?? raiz['versionName'] ?? raiz['translation'] ?? nomeDoArquivo).trim();
    const siglaInformada = String(raiz['sigla'] ?? raiz['abbrev'] ?? raiz['code'] ?? raiz['versao'] ?? '').trim();
    const sigla = (siglaInformada || this.gerarSigla(nome)).toUpperCase();
    const livrosEntrada = raiz['livros'] ?? raiz['books'];
    if (!nome) throw new Error('Informe o nome da versão no arquivo (campo "nome" ou "name").');
    if (!livrosEntrada || typeof livrosEntrada !== 'object') throw new Error(`A versão ${nome} precisa conter os livros e seus textos.`);

    const listaLivros = Array.isArray(livrosEntrada)
      ? livrosEntrada.map((livro, indice) => [String(indice), livro] as [string, unknown])
      : Object.entries(livrosEntrada as Record<string, unknown>);
    const livros: BibliaLivro[] = listaLivros.map(([chaveLivro, livroValor], indiceLivro) => {
      const livro = livroValor && typeof livroValor === 'object' ? livroValor as Record<string, unknown> : {};
      const nomeLivro = String(livro['nome'] ?? livro['name'] ?? livro['livro'] ?? chaveLivro).trim();
      const capitulosEntrada = livro['capitulos'] ?? livro['chapters'] ?? livro['capítulos'];
      if (!nomeLivro || !capitulosEntrada || typeof capitulosEntrada !== 'object') throw new Error(`O livro ${nomeLivro || indiceLivro + 1} está sem capítulos.`);
      const listaCapitulos = Array.isArray(capitulosEntrada)
        ? capitulosEntrada.map((capitulo, indice) => [String(indice + 1), capitulo] as [string, unknown])
        : Object.entries(capitulosEntrada as Record<string, unknown>);
      const capitulos: BibliaCapitulo[] = listaCapitulos.map(([chaveCapitulo, capituloValor], indice) => {
        const capitulo = capituloValor && typeof capituloValor === 'object' && !Array.isArray(capituloValor)
          ? capituloValor as Record<string, unknown> : {};
        const numero = Number(capitulo['numero'] ?? capitulo['chapter'] ?? chaveCapitulo ?? indice + 1);
        const versiculosEntrada = Array.isArray(capituloValor)
          ? capituloValor
          : capitulo['versiculos'] ?? capitulo['verses'] ?? capitulo['versículos'] ?? capitulo['texto'] ?? capitulo['text'];
        if (!Number.isInteger(numero) || !versiculosEntrada || typeof versiculosEntrada !== 'object') throw new Error(`Capítulo inválido em ${nomeLivro}.`);
        const listaVersiculos = Array.isArray(versiculosEntrada)
          ? versiculosEntrada.map((versiculo, posicao) => [String(posicao + 1), versiculo] as [string, unknown])
          : Object.entries(versiculosEntrada as Record<string, unknown>);
        const versiculos = listaVersiculos.map(([chave, versiculoValor], posicao) => {
          const versiculo = versiculoValor && typeof versiculoValor === 'object'
            ? versiculoValor as Record<string, unknown> : {};
          const numeroVersiculo = Number(versiculo['numero'] ?? versiculo['verse'] ?? chave ?? posicao + 1);
          const texto = String(typeof versiculoValor === 'string'
            ? versiculoValor : versiculo['texto'] ?? versiculo['text'] ?? versiculo['content'] ?? '').replace(/\s+/g, ' ').trim();
          if (!Number.isInteger(numeroVersiculo) || numeroVersiculo < 1 || !texto) throw new Error(`Versículo inválido em ${nomeLivro} ${numero}.`);
          return { numero: numeroVersiculo, texto };
        }).sort((a, b) => a.numero - b.numero);
        if (!versiculos.length) throw new Error(`O capítulo ${nomeLivro} ${numero} não tem versículos.`);
        return { numero, versiculos };
      }).sort((a, b) => a.numero - b.numero);
      return { nome: nomeLivro, capitulos };
    });

    if (!livros.length) throw new Error(`A versão ${sigla} não tem livros.`);
    const ordem = new Map<string, number>(ORDEM_LIVROS_BIBLIA.map((livro, indice) => [this.normalizarNome(livro), indice] as [string, number]));
    livros.sort((a, b) => (ordem.get(this.normalizarNome(a.nome)) ?? Number.MAX_SAFE_INTEGER)
      - (ordem.get(this.normalizarNome(b.nome)) ?? Number.MAX_SAFE_INTEGER));
    const paisInformado = String(raiz['pais'] ?? raiz['country'] ?? raiz['countryName'] ?? raiz['originCountry'] ?? '').trim();
    const pais = paisInformado || (['ACF', 'NVI', 'NTLH'].includes(sigla) ? 'Brasil' : undefined);
    return { sigla, nome, pais, livros, importadaEm: Date.now() };
  }

  /** Gera uma sigla curta a partir do nome quando o arquivo não fornece uma. */
  private gerarSigla(nome: string): string {
    const palavras = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/gi) ?? [];
    const ignorar = new Set(['a', 'as', 'o', 'os', 'de', 'da', 'do', 'das', 'dos', 'e']);
    const iniciais = palavras.filter((palavra) => !ignorar.has(palavra.toLowerCase())).map((palavra) => palavra[0]).join('');
    return (iniciais || palavras.join('')).slice(0, 8).toUpperCase();
  }

  /** Usa o nome do arquivo como rótulo legível quando o JSON não informa a versão. */
  private nomeVersaoPeloArquivo(nomeArquivo: string): string {
    const nome = nomeArquivo.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const chave = nome.replace(/\s+/g, '').toUpperCase();
    const nomesConhecidos: Record<string, string> = {
      ACF: 'Almeida Corrigida Fiel',
      NVI: 'Nova Versão Internacional',
      NTLH: 'Nova Tradução na Linguagem de Hoje',
    };
    return nomesConhecidos[chave] ?? nome.replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase('pt-BR'));
  }

  /** Normaliza acentos e caixa para ordenar os livros bíblicos canônicos. */
  private normalizarNome(nome: string): string {
    return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
}

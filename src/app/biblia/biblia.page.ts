import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonBackButton,
  IonIcon, IonSelect, IonSelectOption, IonPopover, IonInput, IonNote, IonSpinner, IonTextarea,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookOutline, cloudDownloadOutline, chevronBackOutline, chevronForwardOutline, chevronDownOutline,
  volumeHighOutline, ellipsisVertical, pauseOutline, pencilOutline, chatbubbleOutline, searchOutline,
  copyOutline, shareSocialOutline, imageOutline,
} from 'ionicons/icons';
import { BibliaService } from '../core/biblia.service';
import type { BibliaApiCapituloOffline, BibliaApiItem, BibliaApiLivro, BibliaApiResultadoBusca, BibliaCapitulo, BibliaLivro, BibliaVersao, BibliaVersiculo } from '../core/biblia.service';

declare global {
  interface Window {
    fumsData?: IArguments[];
    fums?: (...args: unknown[]) => void;
  }
}

const VERSOES_CONHECIDAS = [
  { sigla: 'ACF', nome: 'Almeida Corrigida Fiel' },
  { sigla: 'NVI', nome: 'Nova Versão Internacional' },
  { sigla: 'NTLH', nome: 'Nova Tradução na Linguagem de Hoje' },
];

interface ResultadoBuscaBiblia {
  referencia: string;
  texto: string;
  numero: number;
  apiLivroId?: string;
  apiCapituloId?: string;
  livroLocal?: string;
  capituloLocal?: number;
}

interface GrupoVersoesApi {
  chave: string;
  titulo: string;
  versoes: OpcaoVersaoSeletor[];
}

type OpcaoVersaoSeletor =
  | { tipo: 'api'; id: string; nome: string; bible: BibliaApiItem }
  | { tipo: 'local'; id: string; nome: string; sigla: string; pais: string };

function opcaoApi(bible: BibliaApiItem): OpcaoVersaoSeletor {
  return { tipo: 'api', id: bible.id, nome: bible.abbreviationLocal || bible.abbreviation || bible.nameLocal || bible.name, bible };
}

@Component({
  selector: 'app-biblia',
  standalone: true,
  templateUrl: './biblia.page.html',
  styleUrls: ['../shared/pagina.scss', './biblia.page.scss'],
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonBackButton,
    IonIcon, IonSelect, IonSelectOption, IonPopover, IonInput, IonNote, IonSpinner,
  ],
})
/** Leitor bíblico com pesquisa, navegação, destaques e integração à API.Bible. */
export class BibliaPage implements OnInit {
  private readonly biblia = inject(BibliaService);
  private temporizadorAvisoApi: ReturnType<typeof setTimeout> | null = null;

  // Estado local mantém seleções e resultados sincronizados com o template Angular.
  readonly versoes = signal<BibliaVersao[]>([]);
  readonly versaoSelecionada = signal('');
  readonly livroSelecionado = signal('');
  readonly capituloSelecionado = signal(1);
  readonly busca = signal('');
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly chaveApi = signal('');
  readonly validandoApi = signal(false);
  readonly apiConectada = signal(false);
  readonly modoLocal = signal(false);
  readonly quantidadeBibles = signal(0);
  readonly biblesApi = signal<BibliaApiItem[]>([]);
  /** Agrupa primeiro NTLH/NVI/ACF e depois as demais traduções pelo país informado pela API. */
  readonly gruposBiblesApi = computed(() => this.organizarBiblesApi(this.biblesApi(), this.versoes()));
  readonly bibleApiSelecionada = signal('');
  readonly capitulosOffline = signal<BibliaApiCapituloOffline[]>([]);
  readonly biblesComOffline = computed(() => new Set(this.capitulosOffline().map((item) => item.bibleId)));
  readonly capituloJaSalvoOffline = computed(() => this.capitulosOffline().some((item) => item.bibleId === this.bibleApiSelecionada() && item.chapterId === this.capituloApiSelecionado()));
  readonly salvandoOffline = signal(false);
  readonly conteudoCapituloApi = signal<unknown>(null);
  readonly livrosApi = signal<BibliaApiLivro[]>([]);
  readonly capitulosApi = computed(() => this.livrosApi().find((livro) => livro.id === this.livroApiSelecionado())?.chapters.filter((capitulo) => /^\d+$/.test(capitulo.number)) ?? []);
  readonly livroApiSelecionado = signal('');
  readonly capituloApiSelecionado = signal('');
  readonly versiculosApi = signal<BibliaVersiculo[]>([]);
  readonly copyrightApi = signal('');
  readonly titulosApi = signal<string[]>([]);
  readonly carregandoApi = signal(false);
  readonly opcoesAbertas = signal(false);
  readonly falando = signal(false);
  readonly termoPesquisa = signal('');
  readonly pesquisaExecutada = signal(false);
  readonly resultadosPesquisa = signal<ResultadoBuscaBiblia[]>([]);
  readonly resultadosLocaisCompletos = signal<ResultadoBuscaBiblia[]>([]);
  readonly totalResultadosPesquisa = signal(0);
  readonly pesquisando = signal(false);
  readonly offsetPesquisa = signal(0);
  readonly versiculoSelecionado = signal<number | null>(null);
  readonly textoVersiculoSelecionado = signal('');
  readonly editandoNota = signal(false);
  readonly notaRascunho = signal('');
  readonly corDestaqueSelecionada = signal('#fff56b');
  readonly paletaCoresVisivel = signal(true);
  readonly corPersonalizada = signal('#a855f7');
  readonly destaques = signal<Record<string, string>>(this.lerArmazenamento('scale-biblia-destaques'));
  readonly notas = signal<Record<string, string>>(this.lerArmazenamento('scale-biblia-notas'));
  readonly coresDestaque = [
    { nome: 'Vermelho', valor: '#ef4444' }, { nome: 'Preto', valor: '#171717' },
    { nome: 'Azul', valor: '#3b82f6' }, { nome: 'Roxo', valor: '#8b5cf6' },
    { nome: 'Rosa', valor: '#ec4899' }, { nome: 'Amarelo', valor: '#facc15' },
    { nome: 'Verde', valor: '#22c55e' },
  ];
  readonly versoesConhecidas = VERSOES_CONHECIDAS;
  readonly versaoOnlineAtual = computed(() => this.biblesApi().find((bible) => bible.id === this.bibleApiSelecionada()) ?? null);
  readonly livroOnlineAtual = computed(() => this.livrosApi().find((livro) => livro.id === this.livroApiSelecionado()) ?? null);
  readonly capituloOnlineAtual = computed(() => this.capitulosApi().find((capitulo) => capitulo.id === this.capituloApiSelecionado()) ?? null);
  readonly versoesPendentes = computed(() => VERSOES_CONHECIDAS.filter((v) => !this.versoes().some((salva) => salva.sigla === v.sigla)));
  readonly siglasPendentes = computed(() => this.versoesPendentes().map((v) => v.sigla).join(', '));
  readonly versaoAtual = computed(() => this.versoes().find((v) => v.sigla === this.versaoSelecionada()) ?? null);
  readonly livroAtual = computed(() => this.versaoAtual()?.livros.find((l) => l.nome === this.livroSelecionado()) ?? null);
  readonly capitulos = computed(() => this.livroAtual()?.capitulos ?? []);
  readonly capituloAtual = computed(() => this.capitulos().find((c) => c.numero === this.capituloSelecionado()) ?? null);
  readonly versiculosVisiveis = computed(() => {
    const termo = this.busca().trim().toLocaleLowerCase('pt-BR');
    return (this.capituloAtual()?.versiculos ?? []).filter((v) => !termo || v.texto.toLocaleLowerCase('pt-BR').includes(termo));
  });

  constructor() {
    addIcons({ bookOutline, cloudDownloadOutline, chevronBackOutline, chevronForwardOutline, chevronDownOutline, volumeHighOutline, ellipsisVertical, pauseOutline, pencilOutline, chatbubbleOutline, copyOutline, shareSocialOutline, imageOutline, searchOutline });
  }

  async ngOnInit(): Promise<void> {
    this.chaveApi.set(this.biblia.lerChaveApi());
    await this.atualizarCapitulosOffline();
    if (this.chaveApi().trim()) await this.conectarApi();
    if (!this.apiConectada() && this.capitulosOffline().length) await this.ativarCatalogoOffline();
    await this.atualizarVersoes();
  }

  /** Reabre a última versão salva se a API estiver indisponível ao iniciar o app. */
  private async ativarCatalogoOffline(): Promise<void> {
    const registros = this.capitulosOffline();
    this.erro.set(null);
    const bibles = [...new Map<string, BibliaApiItem>(registros.map((item) => [item.bibleId, item.bible] as [string, BibliaApiItem])).values()];
    this.biblesApi.set(bibles);
    this.apiConectada.set(true);
    const bible = bibles.find((item) => item.id === this.bibleApiSelecionada()) ?? bibles[0];
    if (!bible) return;
    const capitulo = registros.find((item) => item.bibleId === bible.id);
    if (!capitulo) return;
    this.bibleApiSelecionada.set(bible.id);
    this.livrosApi.set(capitulo.livros);
    this.livroApiSelecionado.set(capitulo.chapterId.split('.')[0] ?? '');
    this.capituloApiSelecionado.set(capitulo.chapterId);
    this.aplicarCapituloApi(capitulo);
    this.aviso.set('Modo offline: capítulos salvos ficam disponíveis por até 14 dias.');
  }

  /** Atualiza a relação de capítulos guardados e remove os que expiraram. */
  private async atualizarCapitulosOffline(): Promise<void> {
    try { this.capitulosOffline.set(await this.biblia.listarCapitulosApiOffline()); }
    catch { this.capitulosOffline.set([]); }
  }

  /** Valida a chave, salva-a localmente e carrega a primeira versão disponível. */
  async conectarApi(): Promise<void> {
    const chave = this.chaveApi().trim();
    if (!chave) return;
    this.validandoApi.set(true);
    this.erro.set(null);
    this.aviso.set(null);
    if (this.temporizadorAvisoApi) clearTimeout(this.temporizadorAvisoApi);
    this.apiConectada.set(false);
    try {
      const bibles = await this.biblia.listarBiblesApi(chave);
      this.biblia.salvarChaveApi(chave);
      this.biblesApi.set(bibles);
      this.quantidadeBibles.set(bibles.length);
      this.apiConectada.set(true);
      const mensagem = 'Chave salva neste aparelho e validada com sucesso.';
      this.aviso.set(mensagem);
      // A confirmação é temporária para não ocupar a tela de leitura.
      this.temporizadorAvisoApi = setTimeout(() => {
        if (this.aviso() === mensagem) this.aviso.set(null);
        this.temporizadorAvisoApi = null;
      }, 5000);
      const selecaoValida = bibles.some((bible) => bible.id === this.bibleApiSelecionada());
      const preferida = bibles.find((bible) => /NTLH/i.test(`${bible.abbreviation ?? ''} ${bible.abbreviationLocal ?? ''} ${bible.nameLocal ?? ''}`))
        ?? bibles.find((bible) => /NVI/i.test(`${bible.abbreviation ?? ''} ${bible.abbreviationLocal ?? ''} ${bible.nameLocal ?? ''}`))
        ?? bibles.find((bible) => /ACF/i.test(`${bible.abbreviation ?? ''} ${bible.abbreviationLocal ?? ''} ${bible.nameLocal ?? ''}`))
        ?? bibles.find((bible) => /portugu[eê]s|portuguese/i.test(`${bible.language?.nameLocal ?? ''} ${bible.language?.name ?? ''}`))
        ?? bibles[0];
      if (preferida && !selecaoValida) await this.selecionarBibleApi(preferida.id);
    } catch (err) {
      this.erro.set(err instanceof Error ? err.message : 'Não foi possível validar a chave.');
    } finally {
      this.validandoApi.set(false);
    }
  }

  /** Mantém as três traduções brasileiras no topo e agrupa o catálogo restante por país. */
  private organizarBiblesApi(bibles: BibliaApiItem[], salvas: BibliaVersao[]): GrupoVersoesApi[] {
    const restantes = [...bibles];
    const grupos: GrupoVersoesApi[] = [];
    const principais: BibliaApiItem[] = [];
    const locaisPrincipais: Extract<OpcaoVersaoSeletor, { tipo: 'local' }>[] = salvas.map((versao) => ({
      tipo: 'local',
      id: `local:${versao.sigla}`,
      sigla: versao.sigla,
      nome: `${versao.nome} (${versao.sigla})`,
      pais: versao.pais || (['ACF', 'NVI', 'NTLH'].includes(versao.sigla) ? 'Brasil' : 'Outros países'),
    }));
    for (const sigla of ['NTLH', 'NVI', 'ACF']) {
      const indice = restantes.findIndex((bible) => {
        const identificadores = `${bible.abbreviation ?? ''} ${bible.abbreviationLocal ?? ''} ${bible.nameLocal ?? ''}`;
        return new RegExp(`(^|\\W)${sigla}(\\W|$)`, 'i').test(identificadores);
      });
      if (indice >= 0) principais.push(...restantes.splice(indice, 1));
    }
    if (principais.length || locaisPrincipais.length) grupos.push({
      chave: 'principais',
      titulo: 'Versões principais',
      versoes: [...principais.map(opcaoApi), ...locaisPrincipais],
    });

    const ehPais = (bible: BibliaApiItem, pais: 'brasil' | 'eua'): boolean => (bible.countries ?? []).some((country) => {
      const identificacao = `${country.id} ${country.name} ${country.nameLocal}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return pais === 'brasil'
        ? /(^|\W)(br|bra)(\W|$)/i.test(country.id) || identificacao.includes('brasil') || identificacao.includes('brazil')
        : /(^|\W)(us|usa)(\W|$)/i.test(country.id) || identificacao.includes('estados unidos') || identificacao.includes('united states');
    });
    const adicionarPais = (chave: string, titulo: string, selecionar: (bible: BibliaApiItem) => boolean): void => {
      const versoes = restantes.filter(selecionar);
      if (!versoes.length) return;
      grupos.push({ chave, titulo, versoes: versoes.sort((a, b) => this.nomeBiblia(a).localeCompare(this.nomeBiblia(b), 'pt-BR')).map(opcaoApi) });
      const ids = new Set(versoes.map((bible) => bible.id));
      for (let indice = restantes.length - 1; indice >= 0; indice--) {
        if (ids.has(restantes[indice]!.id)) restantes.splice(indice, 1);
      }
    };

    adicionarPais('brasil', 'Brasil', (bible) => ehPais(bible, 'brasil'));
    adicionarPais('eua', 'Estados Unidos', (bible) => ehPais(bible, 'eua'));

    const porPais = new Map<string, { titulo: string; versoes: BibliaApiItem[] }>();
    for (const bible of restantes) {
      const pais = bible.countries?.[0];
      const chave = pais?.id || pais?.name || 'outros';
      const titulo = pais?.nameLocal || pais?.name || 'Outros países';
      const grupo = porPais.get(chave) ?? { titulo, versoes: [] };
      grupo.versoes.push(bible);
      porPais.set(chave, grupo);
    }
    for (const [chave, grupo] of [...porPais.entries()].sort((a, b) => a[1].titulo.localeCompare(b[1].titulo, 'pt-BR'))) {
      grupos.push({ chave: `pais-${chave}`, titulo: grupo.titulo, versoes: grupo.versoes.sort((a, b) => this.nomeBiblia(a).localeCompare(this.nomeBiblia(b), 'pt-BR')).map(opcaoApi) });
    }

    // Cada versão importada aparece também no grupo de seu país de origem.
    for (const local of locaisPrincipais) {
      const paisKey = this.normalizarPais(local.pais);
      let grupo = grupos.find((item) => item.chave === `pais-${paisKey}` || this.normalizarPais(item.titulo) === paisKey);
      if (!grupo) {
        grupo = { chave: `pais-${paisKey}`, titulo: local.pais, versoes: [] };
        grupos.push(grupo);
      }
      if (!grupo.versoes.some((item) => item.id === local.id)) grupo.versoes.push(local);
    }
    // Preserve a ordem priorizada das versões principais; cada país fica em ordem alfabética.
    for (const grupo of grupos) {
      if (grupo.chave !== 'principais') grupo.versoes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    return grupos;
  }

  /** Agrupa nomes equivalentes de países, mesmo quando o arquivo usa outra grafia. */
  private normalizarPais(pais: string): string {
    const texto = pais.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (texto.includes('brasil') || texto.includes('brazil')) return 'brasil';
    if (texto.includes('estados unidos') || texto.includes('united states') || texto === 'eua' || texto === 'usa') return 'eua';
    return texto.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /** Abre uma versão importada ou uma versão entregue pela API.Bible. */
  selecionarOpcaoVersao(opcao: OpcaoVersaoSeletor): void {
    if (opcao.tipo === 'local') this.selecionarVersaoLocal(opcao.sigla);
    else void this.selecionarBibleApi(opcao.bible.id);
  }

  /** Escolhe o rótulo local, sigla ou nome da tradução para a ordenação do grupo. */
  private nomeBiblia(bible: BibliaApiItem): string {
    return bible.abbreviationLocal || bible.abbreviation || bible.nameLocal || bible.name;
  }

  /** Exibe a sigla da versão ativa no botão que abre o menu de versões da API. */
  nomeBibliaSelecionada(): string {
    if (this.modoLocal()) {
      const local = this.versoes().find((versao) => versao.sigla === this.versaoSelecionada());
      if (local) return local.sigla;
    }
    const bible = this.biblesApi().find((item) => item.id === this.bibleApiSelecionada());
    return bible ? this.nomeBiblia(bible) : 'Versão';
  }

  async selecionarBibleApi(id: string): Promise<void> {
    // Trocar para uma tradução da API encerra o modo local antes de mudar a seleção.
    this.modoLocal.set(false);
    this.limparPesquisa();
    this.bibleApiSelecionada.set(id);
    this.livrosApi.set([]);
    this.livroApiSelecionado.set('');
    this.capituloApiSelecionado.set('');
    this.versiculosApi.set([]);
    this.titulosApi.set([]);
    this.resultadosPesquisa.set([]);
    this.carregandoApi.set(true);
    this.erro.set(null);
    try {
      const livros = await this.biblia.listarLivrosApi(id);
      this.livrosApi.set(livros);
      const primeiro = livros[0];
      if (primeiro) {
        this.livroApiSelecionado.set(primeiro.id);
        const capitulo = primeiro.chapters?.find((item) => /^\d+$/.test(item.number));
        if (capitulo) {
          this.capituloApiSelecionado.set(capitulo.id);
          await this.carregarCapituloApi();
        }
      }
    } catch (err) {
      const offline = this.capitulosOffline().find((item) => item.bibleId === id);
      if (offline) {
        this.livrosApi.set(offline.livros);
        this.livroApiSelecionado.set(offline.chapterId.split('.')[0] ?? '');
        this.capituloApiSelecionado.set(offline.chapterId);
        this.aplicarCapituloApi(offline);
        this.aviso.set('Sem conexão: mostrando um capítulo salvo neste aparelho.');
      } else {
        this.erro.set(err instanceof Error ? err.message : 'Não foi possível carregar os livros dessa versão.');
      }
    } finally {
      this.carregandoApi.set(false);
    }
  }

  async selecionarLivroApi(id: string): Promise<void> {
    this.livroApiSelecionado.set(id);
    this.versiculoSelecionado.set(null);
    const capitulo = this.livrosApi().find((livro) => livro.id === id)?.chapters?.find((item) => /^\d+$/.test(item.number));
    this.capituloApiSelecionado.set(capitulo?.id ?? '');
    if (capitulo) await this.carregarCapituloApi();
  }

  async selecionarCapituloApi(id: string): Promise<void> {
    this.capituloApiSelecionado.set(id);
    this.versiculoSelecionado.set(null);
    await this.carregarCapituloApi();
  }

  private async carregarCapituloApi(): Promise<void> {
    const bibleId = this.bibleApiSelecionada();
    const chapterId = this.capituloApiSelecionado();
    if (!bibleId || !chapterId) return;
    this.carregandoApi.set(true);
    this.versiculosApi.set([]);
    this.copyrightApi.set('');
    this.erro.set(null);
    try {
      const resultado = await this.biblia.carregarCapituloApi(bibleId, chapterId);
      this.conteudoCapituloApi.set(resultado.content);
      this.versiculosApi.set(this.extrairVersiculosApi(resultado.content));
      this.titulosApi.set(this.extrairTitulosApi(resultado.content));
      this.copyrightApi.set(resultado.copyright);
      if (resultado.fumsToken) window.fums?.('trackView', resultado.fumsToken);
    } catch (err) {
      const offline = await this.biblia.buscarCapituloApiOffline(bibleId, chapterId).catch(() => null);
      if (offline) {
        this.aplicarCapituloApi(offline);
        this.aviso.set('Sem conexão: capítulo carregado do armazenamento offline.');
      } else {
        this.erro.set(err instanceof Error ? err.message : 'Não foi possível carregar esse capítulo.');
      }
    } finally {
      this.carregandoApi.set(false);
    }
  }

  /** Exibe um capítulo guardado localmente, preservando títulos e direitos autorais. */
  private aplicarCapituloApi(capitulo: Pick<BibliaApiCapituloOffline, 'content' | 'copyright'>): void {
    this.conteudoCapituloApi.set(capitulo.content);
    this.versiculosApi.set(this.extrairVersiculosApi(capitulo.content));
    this.titulosApi.set(this.extrairTitulosApi(capitulo.content));
    this.copyrightApi.set(capitulo.copyright);
  }

  /** Salva somente o capítulo aberto; a API.Bible limita o cache a menos de 500 versos. */
  async salvarCapituloOffline(): Promise<void> {
    const bible = this.biblesApi().find((item) => item.id === this.bibleApiSelecionada());
    const content = this.conteudoCapituloApi();
    if (!bible || !content) return;
    this.salvandoOffline.set(true);
    try {
      await this.biblia.salvarCapituloApiOffline({
        bibleId: bible.id,
        chapterId: this.capituloApiSelecionado(),
        content,
        copyright: this.copyrightApi(),
        bible,
        livros: this.livrosApi(),
      });
      await this.atualizarCapitulosOffline();
      this.aviso.set('Capítulo salvo para leitura offline por até 14 dias.');
    } catch (err) {
      this.erro.set(err instanceof Error ? err.message : 'Não foi possível salvar o capítulo offline.');
    } finally {
      this.salvandoOffline.set(false);
    }
  }

  /** Libera do aparelho a cópia offline do capítulo aberto. */
  async removerCapituloOffline(): Promise<void> {
    try {
      await this.biblia.removerCapituloApiOffline(this.bibleApiSelecionada(), this.capituloApiSelecionado());
      await this.atualizarCapitulosOffline();
      this.aviso.set('Cópia offline removida deste aparelho.');
    } catch (err) {
      this.erro.set(err instanceof Error ? err.message : 'Não foi possível remover o capítulo offline.');
    }
  }

  /** Pesquisa na versão selecionada, usando API remota ou dados importados localmente. */
  async pesquisarPalavra(): Promise<void> {
    const termo = this.termoPesquisa().trim();
    if (!termo) {
      this.limparPesquisa();
      return;
    }
    this.pesquisaExecutada.set(true);
    this.pesquisando.set(true);
    this.offsetPesquisa.set(0);
    this.erro.set(null);
    try {
      if (this.apiConectada() && !this.modoLocal()) {
        const resultado = await this.biblia.pesquisarApi(this.bibleApiSelecionada(), termo);
        this.resultadosPesquisa.set(resultado.resultados.map((item) => this.formatarResultadoApi(item)));
        this.resultadosLocaisCompletos.set([]);
        this.totalResultadosPesquisa.set(resultado.total);
      } else {
        const encontrados: ResultadoBuscaBiblia[] = [];
        const procurado = termo.toLocaleLowerCase('pt-BR');
        for (const livro of this.versaoAtual()?.livros ?? []) {
          for (const capitulo of livro.capitulos) {
            for (const versiculo of capitulo.versiculos) {
              if (versiculo.texto.toLocaleLowerCase('pt-BR').includes(procurado)) {
                encontrados.push({
                  referencia: `${livro.nome} ${capitulo.numero}:${versiculo.numero}`,
                  texto: versiculo.texto,
                  numero: versiculo.numero,
                  livroLocal: livro.nome,
                  capituloLocal: capitulo.numero,
                });
              }
            }
          }
        }
        this.resultadosLocaisCompletos.set(encontrados);
        this.resultadosPesquisa.set(encontrados.slice(0, 50));
        this.totalResultadosPesquisa.set(encontrados.length);
      }
    } catch (err) {
      this.erro.set(err instanceof Error ? err.message : 'Não foi possível pesquisar nessa versão.');
    } finally {
      this.pesquisando.set(false);
    }
  }

  limparPesquisa(): void {
    this.termoPesquisa.set('');
    this.resultadosPesquisa.set([]);
    this.resultadosLocaisCompletos.set([]);
    this.totalResultadosPesquisa.set(0);
    this.pesquisaExecutada.set(false);
  }

  async carregarMaisResultados(): Promise<void> {
    if (!(this.apiConectada() && !this.modoLocal())) {
      this.resultadosPesquisa.set(this.resultadosLocaisCompletos().slice(0, this.resultadosPesquisa().length + 50));
      return;
    }
    const proximoOffset = this.offsetPesquisa() + 50;
    this.pesquisando.set(true);
    try {
      const resultado = await this.biblia.pesquisarApi(this.bibleApiSelecionada(), this.termoPesquisa().trim(), proximoOffset);
      this.resultadosPesquisa.update((atuais) => [...atuais, ...resultado.resultados.map((item) => this.formatarResultadoApi(item))]);
      this.offsetPesquisa.set(proximoOffset);
      this.totalResultadosPesquisa.set(resultado.total);
    } catch (err) {
      this.erro.set(err instanceof Error ? err.message : 'Não foi possível carregar mais resultados.');
    } finally {
      this.pesquisando.set(false);
    }
  }

  /** Abre o capítulo encontrado e seleciona o versículo correspondente. */
  async abrirResultadoPesquisa(resultado: ResultadoBuscaBiblia): Promise<void> {
    this.limparPesquisa();
    if (resultado.apiLivroId && resultado.apiCapituloId) {
      this.livroApiSelecionado.set(resultado.apiLivroId);
      this.capituloApiSelecionado.set(resultado.apiCapituloId);
      await this.carregarCapituloApi();
    } else if (resultado.livroLocal && resultado.capituloLocal) {
      this.livroSelecionado.set(resultado.livroLocal);
      this.capituloSelecionado.set(resultado.capituloLocal);
    }
    const versiculo = this.apiConectada() && !this.modoLocal()
      ? this.versiculosApi().find((item) => item.numero === resultado.numero)
      : this.capituloAtual()?.versiculos.find((item) => item.numero === resultado.numero);
    if (versiculo) this.selecionarVersiculo(versiculo.numero, versiculo.texto);
  }

  private formatarResultadoApi(resultado: BibliaApiResultadoBusca): ResultadoBuscaBiblia {
    const numero = Number(resultado.id.split('.').at(-1));
    return {
      referencia: resultado.reference,
      texto: resultado.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      numero: Number.isInteger(numero) ? numero : 0,
      apiLivroId: resultado.bookId,
      apiCapituloId: resultado.chapterId,
    };
  }

  /** Percorre a lista canônica de capítulos, inclusive ao mudar de livro. */
  async navegarCapituloApi(delta: number): Promise<void> {
    const todos = this.livrosApi().flatMap((livro) => (livro.chapters ?? [])
      .filter((capitulo) => /^\d+$/.test(capitulo.number))
      .map((capitulo) => ({ livro, capitulo })));
    const indice = todos.findIndex(({ capitulo }) => capitulo.id === this.capituloApiSelecionado());
    const destino = todos[indice + delta];
    if (!destino) return;
    this.versiculoSelecionado.set(null);
    this.editandoNota.set(false);
    this.livroApiSelecionado.set(destino.livro.id);
    this.capituloApiSelecionado.set(destino.capitulo.id);
    await this.carregarCapituloApi();
  }

  apiCapituloDisponivel(delta: number): boolean {
    const todos = this.livrosApi().flatMap((livro) => (livro.chapters ?? []).filter((capitulo) => /^\d+$/.test(capitulo.number)));
    const indice = todos.findIndex((capitulo) => capitulo.id === this.capituloApiSelecionado());
    return indice + delta >= 0 && indice + delta < todos.length;
  }

  alternarOpcoes(): void {
    this.opcoesAbertas.update((abertas) => !abertas);
  }

  falarCapitulo(): void {
    if (!('speechSynthesis' in window)) {
      this.erro.set('A leitura em voz alta não está disponível neste navegador.');
      return;
    }
    if (this.falando()) {
      window.speechSynthesis.cancel();
      this.falando.set(false);
      return;
    }
    const texto = this.apiConectada() && !this.modoLocal()
      ? this.versiculosApi().map((versiculo) => `${versiculo.numero}. ${versiculo.texto}`).join(' ')
      : this.versiculosVisiveis().map((versiculo) => `${versiculo.numero}. ${versiculo.texto}`).join(' ');
    if (!texto) return;
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = 'pt-BR';
    fala.onend = () => this.falando.set(false);
    fala.onerror = () => this.falando.set(false);
    this.falando.set(true);
    window.speechSynthesis.speak(fala);
  }

  /** Abre as ferramentas de destaque e anotação para o versículo tocado. */
  selecionarVersiculo(numero: number, texto: string): void {
    this.versiculoSelecionado.set(numero);
    this.textoVersiculoSelecionado.set(texto);
    this.notaRascunho.set(this.notas()[this.chaveVersiculo(numero)] ?? '');
    this.editandoNota.set(false);
    this.paletaCoresVisivel.set(false);
  }

  fecharPainelVersiculo(): void {
    this.versiculoSelecionado.set(null);
    this.editandoNota.set(false);
    this.paletaCoresVisivel.set(false);
  }

  corVersiculo(numero: number): string | null {
    return this.destaques()[this.chaveVersiculo(numero)] ?? null;
  }

  /** Mantém o texto legível quando o destaque escolhido tem fundo escuro. */
  corTextoVersiculo(numero: number): string | null {
    const cor = this.corVersiculo(numero);
    if (!cor) return null;
    const hex = cor.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    const canais = [0, 2, 4].map((inicio) => parseInt(hex.slice(inicio, inicio + 2), 16) / 255)
      .map((valor) => valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4);
    const luminancia = 0.2126 * canais[0]! + 0.7152 * canais[1]! + 0.0722 * canais[2]!;
    return luminancia < 0.36 ? '#fff' : '#111';
  }

  /** Aplica a cor escolhida no seletor nativo do aparelho. */
  selecionarCorPersonalizada(evento: Event): void {
    const cor = (evento.target as HTMLInputElement).value;
    this.corPersonalizada.set(cor);
    this.aplicarDestaque(cor);
    this.paletaCoresVisivel.set(false);
  }

  /** Salva ou remove a cor de destaque no armazenamento local do aparelho. */
  aplicarDestaque(cor: string | null): void {
    const numero = this.versiculoSelecionado();
    if (numero === null) return;
    const chave = this.chaveVersiculo(numero);
    const atual = { ...this.destaques() };
    if (cor) atual[chave] = cor;
    else delete atual[chave];
    this.destaques.set(atual);
    localStorage.setItem('scale-biblia-destaques', JSON.stringify(atual));
    if (cor) this.corDestaqueSelecionada.set(cor);
  }

  destacarComCorSelecionada(): void {
    this.paletaCoresVisivel.update((visivel) => !visivel);
  }

  abrirNota(): void {
    this.editandoNota.set(true);
  }

  salvarNota(): void {
    const numero = this.versiculoSelecionado();
    if (numero === null) return;
    const chave = this.chaveVersiculo(numero);
    const atual = { ...this.notas() };
    const texto = this.notaRascunho().trim();
    if (texto) atual[chave] = texto;
    else delete atual[chave];
    this.notas.set(atual);
    localStorage.setItem('scale-biblia-notas', JSON.stringify(atual));
    this.editandoNota.set(false);
  }

  async copiarVersiculo(): Promise<void> {
    const texto = this.textoComReferencia();
    try {
      await navigator.clipboard.writeText(texto);
      this.aviso.set('Versículo copiado.');
    } catch {
      this.erro.set('Não foi possível copiar neste navegador.');
    }
  }

  async compartilharVersiculo(): Promise<void> {
    const texto = this.textoComReferencia();
    if (navigator.share) {
      try { await navigator.share({ title: this.referenciaVersiculo(), text: texto }); }
      catch { /* O usuário pode cancelar o compartilhamento. */ }
    } else {
      await this.copiarVersiculo();
    }
  }

  /** Desenha uma arte simples no canvas e baixa o versículo em PNG. */
  baixarImagemVersiculo(): void {
    const numero = this.versiculoSelecionado();
    if (numero === null) return;
    const canvas = document.createElement('canvas');
    const escala = 2;
    const largura = 1080;
    const margem = 72;
    const contexto = canvas.getContext('2d');
    if (!contexto) return;
    contexto.font = '30px Arial';
    const linhas = this.quebrarTexto(contexto, this.textoVersiculoSelecionado(), largura - margem * 2);
    const altura = margem * 2 + 66 + linhas.length * 44;
    canvas.width = largura * escala;
    canvas.height = altura * escala;
    contexto.scale(escala, escala);
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, largura, altura);
    contexto.fillStyle = '#4a4a4a';
    contexto.font = '600 24px Arial';
    contexto.fillText(this.referenciaVersiculo(), margem, margem + 24);
    contexto.fillStyle = '#171717';
    contexto.font = '30px Arial';
    linhas.forEach((linha, indice) => contexto.fillText(linha, margem, margem + 78 + indice * 44));
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.referenciaVersiculo().replaceAll(' ', '-')}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  chaveVersiculo(numero: number): string {
    const contexto = this.apiConectada() && !this.modoLocal()
      ? `${this.bibleApiSelecionada()}|${this.capituloApiSelecionado()}`
      : `${this.versaoSelecionada()}|${this.livroSelecionado()}|${this.capituloSelecionado()}`;
    return `${contexto}|${numero}`;
  }

  private referenciaVersiculo(): string {
    const livro = this.apiConectada() && !this.modoLocal() ? this.livroOnlineAtual()?.nameLocal || this.livroOnlineAtual()?.name : this.livroAtual()?.nome;
    const capitulo = this.apiConectada() && !this.modoLocal() ? this.capituloOnlineAtual()?.number : this.capituloSelecionado();
    return `${livro ?? ''} ${capitulo ?? ''}:${this.versiculoSelecionado() ?? ''}`.trim();
  }

  private textoComReferencia(): string {
    return `${this.referenciaVersiculo()} — ${this.textoVersiculoSelecionado()}`;
  }

  private lerArmazenamento(chave: string): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(chave) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  }

  private quebrarTexto(contexto: CanvasRenderingContext2D, texto: string, largura: number): string[] {
    const linhas: string[] = [];
    let linha = '';
    for (const palavra of texto.split(/\s+/)) {
      const teste = linha ? `${linha} ${palavra}` : palavra;
      if (contexto.measureText(teste).width > largura && linha) {
        linhas.push(linha);
        linha = palavra;
      } else linha = teste;
    }
    if (linha) linhas.push(linha);
    return linhas;
  }

  extrairTitulosApi(conteudo: unknown): string[] {
    if (!Array.isArray(conteudo)) return [];
    return conteudo
      .filter((bloco) => bloco && typeof bloco === 'object' && ['s1', 's2', 's3', 'd'].includes(String(((bloco as Record<string, unknown>)['attrs'] as Record<string, unknown> | undefined)?.['style'] ?? '')))
      .map((bloco) => this.textosDoBloco(bloco).trim())
      .filter(Boolean);
  }

  private textosDoBloco(valor: unknown): string {
    if (Array.isArray(valor)) return valor.map((item) => this.textosDoBloco(item)).join('');
    if (!valor || typeof valor !== 'object') return '';
    const bloco = valor as Record<string, unknown>;
    return (typeof bloco['text'] === 'string' ? bloco['text'] : '') + this.textosDoBloco(bloco['items']);
  }

  private extrairVersiculosApi(conteudo: unknown): BibliaVersiculo[] {
    const textos = new Map<number, string>();
    const percorrer = (valor: unknown): void => {
      if (Array.isArray(valor)) {
        valor.forEach(percorrer);
        return;
      }
      if (!valor || typeof valor !== 'object') return;
      const bloco = valor as Record<string, unknown>;
      const texto = bloco['text'];
      const atributos = bloco['attrs'] as Record<string, unknown> | undefined;
      const referencia = atributos?.['verseId'];
      if (typeof texto === 'string' && typeof referencia === 'string') {
        const numero = Number(referencia.split('.').at(-1));
        if (Number.isInteger(numero) && numero > 0) {
          const anterior = textos.get(numero) ?? '';
          // Algumas respostas JSON dividem o versículo em blocos sem espaço entre as palavras.
          const separador = anterior && texto && /[\p{L}\p{N}]$/u.test(anterior) && /^[\p{L}\p{N}]/u.test(texto) ? ' ' : '';
          textos.set(numero, `${anterior}${separador}${texto}`);
        }
      }
      if (bloco['items']) percorrer(bloco['items']);
    };
    percorrer(conteudo);
    return [...textos.entries()].sort(([a], [b]) => a - b).map(([numero, texto]) => ({
      numero,
      texto: texto.replace(/\s+/g, ' ').replace(/([,;:.!?])(?=[\p{L}\p{N}])/gu, '$1 ').trim(),
    }));
  }

  private async atualizarVersoes(): Promise<void> {
    try {
      const versoes = await this.biblia.listar();
      this.versoes.set(versoes);
      if (!versoes.some((v) => v.sigla === this.versaoSelecionada())) {
        const primeira = versoes[0];
        if (primeira) this.selecionarVersao(primeira.sigla);
      }
    } catch (err) {
      this.erro.set(err instanceof Error ? err.message : 'Não foi possível carregar as versões salvas.');
    }
  }

  selecionarVersao(sigla: string): void {
    this.limparPesquisa();
    const versao = this.versoes().find((v) => v.sigla === sigla);
    this.versaoSelecionada.set(sigla);
    const livro = versao?.livros[0];
    this.livroSelecionado.set(livro?.nome ?? '');
    this.capituloSelecionado.set(livro?.capitulos[0]?.numero ?? 1);
    this.busca.set('');
    this.versiculoSelecionado.set(null);
  }

  selecionarVersaoLocal(sigla: string): void {
    this.modoLocal.set(true);
    this.selecionarVersao(sigla);
    this.opcoesAbertas.set(false);
  }

  voltarParaApi(): void {
    this.modoLocal.set(false);
    this.opcoesAbertas.set(false);
  }

  selecionarLivro(nome: string): void {
    const livro = this.versaoAtual()?.livros.find((l) => l.nome === nome);
    this.livroSelecionado.set(nome);
    this.capituloSelecionado.set(livro?.capitulos[0]?.numero ?? 1);
    this.busca.set('');
    this.versiculoSelecionado.set(null);
  }

  selecionarCapitulo(numero: number): void {
    this.capituloSelecionado.set(Number(numero));
    this.busca.set('');
    this.versiculoSelecionado.set(null);
  }

  navegarCapitulo(delta: number): void {
    const livros = this.versaoAtual()?.livros ?? [];
    const capitulos = livros.flatMap((livro) => livro.capitulos.map((capitulo) => ({ livro, capitulo })));
    const indice = capitulos.findIndex(({ livro, capitulo }) => livro.nome === this.livroSelecionado() && capitulo.numero === this.capituloSelecionado());
    const destino = capitulos[indice + delta];
    if (!destino) return;
    this.livroSelecionado.set(destino.livro.nome);
    this.capituloSelecionado.set(destino.capitulo.numero);
    this.busca.set('');
    this.versiculoSelecionado.set(null);
    this.editandoNota.set(false);
  }

  anteriorDisponivel(): boolean {
    const capitulos = (this.versaoAtual()?.livros ?? []).flatMap((livro) => livro.capitulos.map((capitulo) => ({ livro, capitulo })));
    const indice = capitulos.findIndex(({ livro, capitulo }) => livro.nome === this.livroSelecionado() && capitulo.numero === this.capituloSelecionado());
    return indice > 0;
  }

  proximoDisponivel(): boolean {
    const capitulos = (this.versaoAtual()?.livros ?? []).flatMap((livro) => livro.capitulos.map((capitulo) => ({ livro, capitulo })));
    const indice = capitulos.findIndex(({ livro, capitulo }) => livro.nome === this.livroSelecionado() && capitulo.numero === this.capituloSelecionado());
    return indice >= 0 && indice < capitulos.length - 1;
  }

  async importarArquivo(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    this.carregando.set(true);
    this.erro.set(null);
    this.aviso.set(null);
    try {
      const importadas = await this.biblia.importar(arquivo);
      await this.atualizarVersoes();
      if (importadas[0]) this.selecionarVersao(importadas[0].sigla);
      this.aviso.set(`${importadas.length} versão(ões) importada(s) e salva(s) neste aparelho.`);
    } catch (err) {
      this.erro.set(err instanceof Error ? err.message : 'Não foi possível importar esse arquivo.');
    } finally {
      this.carregando.set(false);
    }
  }
}

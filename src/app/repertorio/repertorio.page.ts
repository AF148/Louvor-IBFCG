import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  computed,
  signal,
  effect,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonList, IonItem, IonLabel, IonInput,
  IonItemOption, IonItemSliding, IonItemOptions, IonModal, IonBadge,
  IonNote, IonTextarea, IonSearchbar, IonSpinner, IonChip,
  IonCheckbox, IonAlert,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, trashOutline, createOutline, playCircleOutline,
  cloudUploadOutline, documentTextOutline, saveOutline, closeOutline,
  musicalNotesOutline, videocamOutline, keyOutline,
  removeOutline, addOutline as addOutlineIcon, swapVerticalOutline,
  chevronDownOutline, appsOutline,
} from 'ionicons/icons';
import { StoreService } from '../core/store.service';
import { AuthService } from '../core/auth.service';
import { AudioService } from '../core/audio.service';
import { MidiaService } from '../core/midia.service';
import { CifraService, transpor, distancia } from '../core/cifra.service';
import type { ResultadoBusca } from '../core/cifra.service';
import type { Louvor } from '../core/models';

const TONS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

/** Remove caracteres invisíveis (zero-width space, BOM) vindos de cópias externas. */
function limparInvisiveis(texto: string): string {
  return texto.replace(/[\u200B-\u200D\uFEFF]/g, '');
}

/**
 * Normaliza texto para busca tolerante: minúsculas, sem acentos e sem
 * pontuação — 'Me Ama', 'me ama' e 'MeÃ¡ Ama' viram 'me ama'.
 */
function normalizarBusca(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Um token de acorde, ex.: C, Am, F#, Bb7, Cm(sus4), D9(11). */
const RE_ACORDE = /^[A-G](#|b)?(m|maj|min|dim|aug|sus\d|add\d|M|\d|\+|-|°)*(\(.*\))?$/;

/** Marcador de seção, ex.: [Intro], [Refrão] — convive na linha de acordes. */
const RE_MARCADOR = /^\[[^\]]*\]$/;

/** Formas de acordes conhecidas: posição em cada corda (6 → 1). -1 = muda, 0 = solta. */
interface Forma {
  pos: number[];
  barra?: { casa: number; de: number; ate: number };
}

const FORMAS: Record<string, Forma> = {
  'C': { pos: [-1, 3, 2, 0, 1, 0] },
  'Cm': { pos: [-1, 3, 5, 5, 4, 3], barra: { casa: 3, de: 1, ate: 5 } },
  'C7': { pos: [-1, 3, 2, 3, 1, 0] },
  'Cm7': { pos: [-1, 3, 5, 3, 4, 3], barra: { casa: 3, de: 1, ate: 5 } },
  'C#': { pos: [-1, 4, 6, 6, 5, 4], barra: { casa: 4, de: 1, ate: 5 } },
  'Db': { pos: [-1, 4, 6, 6, 5, 4], barra: { casa: 4, de: 1, ate: 5 } },
  'D': { pos: [-1, -1, 0, 2, 3, 2] },
  'Dm': { pos: [-1, -1, 0, 2, 3, 1] },
  'D7': { pos: [-1, -1, 0, 2, 1, 2] },
  'Dm7': { pos: [-1, -1, 0, 2, 1, 1] },
  'D#': { pos: [-1, 6, 5, 3, 4, 3], barra: { casa: 3, de: 1, ate: 5 } },
  'Eb': { pos: [-1, 6, 5, 3, 4, 3], barra: { casa: 3, de: 1, ate: 5 } },
  'E': { pos: [0, 2, 2, 1, 0, 0] },
  'Em': { pos: [0, 2, 2, 0, 0, 0] },
  'E7': { pos: [0, 2, 0, 1, 0, 0] },
  'Em7': { pos: [0, 2, 2, 0, 3, 0] },
  'F': { pos: [1, 3, 3, 2, 1, 1], barra: { casa: 1, de: 0, ate: 5 } },
  'Fm': { pos: [1, 3, 3, 1, 1, 1], barra: { casa: 1, de: 0, ate: 5 } },
  'F7': { pos: [1, 3, 1, 2, 1, 1], barra: { casa: 1, de: 0, ate: 5 } },
  'F#': { pos: [2, 4, 4, 3, 2, 2], barra: { casa: 2, de: 0, ate: 5 } },
  'Gb': { pos: [2, 4, 4, 3, 2, 2], barra: { casa: 2, de: 0, ate: 5 } },
  'G': { pos: [3, 2, 0, 0, 0, 3] },
  'G7': { pos: [3, 2, 0, 0, 0, 1] },
  'Gm': { pos: [3, 5, 5, 3, 3, 3], barra: { casa: 3, de: 0, ate: 5 } },
  'G#': { pos: [4, 6, 6, 5, 4, 4], barra: { casa: 4, de: 0, ate: 5 } },
  'Ab': { pos: [4, 6, 6, 5, 4, 4], barra: { casa: 4, de: 0, ate: 5 } },
  'A': { pos: [-1, 0, 2, 2, 2, 0] },
  'Am': { pos: [-1, 0, 2, 2, 1, 0] },
  'A7': { pos: [-1, 0, 2, 0, 2, 0] },
  'Am7': { pos: [-1, 0, 2, 0, 1, 0] },
  'A#': { pos: [-1, 1, 3, 3, 3, 1], barra: { casa: 1, de: 1, ate: 5 } },
  'Bb': { pos: [-1, 1, 3, 3, 3, 1], barra: { casa: 1, de: 1, ate: 5 } },
  'Bbm': { pos: [-1, 1, 3, 3, 2, 1], barra: { casa: 1, de: 1, ate: 5 } },
  'B7': { pos: [-1, 2, 1, 2, 0, 2] },
  'Bm': { pos: [-1, 2, 4, 4, 3, 2], barra: { casa: 2, de: 1, ate: 5 } },
  'Bm7': { pos: [-1, 2, 4, 2, 3, 2], barra: { casa: 2, de: 1, ate: 5 } },
};

const FORM_VAZIO = {
  titulo: '',
  artista: '',
  tom: '',
  bpm: null as number | null,
  letra: '',
  cifra: '',
  fonteCifra: '',
};

@Component({
  selector: 'app-repertorio',
  standalone: true,
  templateUrl: './repertorio.page.html',
  styleUrls: ['../shared/pagina.scss', '../shared/modal.scss'],
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
    IonIcon, IonList, IonItem, IonLabel, IonInput,
    IonItemOption, IonItemSliding, IonItemOptions, IonModal, IonBadge,
    IonNote, IonTextarea, IonSearchbar, IonSpinner, IonChip, IonCheckbox, IonAlert,
  ],
})
/** Exibe o repertório, cifras, transposição e ferramentas para apresentação musical. */
export class RepertorioPage implements OnInit, OnDestroy {
  /** Público porque o template mostra `store.erro()` como banner. */
  readonly store = inject(StoreService);
  readonly audio = inject(AudioService);
  /** Público porque o template esconde novo/editar/excluir para quem não logou. */
  readonly auth = inject(AuthService);
  /** Público porque o template usa `carregando()` para desabilitar o botão. */
  readonly cifraSvc = inject(CifraService);

  /** Editar o Repertório exige membro logado (e-mail/senha) — igual às regras. */
  readonly podeEditar = computed(() => !!this.auth.usuario());

  readonly modalAberto = signal(false);
  readonly detalheAberto = signal(false);
  readonly busca = signal('');
  readonly modoSelecaoLouvores = signal(false);
  readonly louvoresSelecionados = signal<Set<string>>(new Set());
  readonly confirmarExclusaoLote = signal(false);
  readonly enviando = signal(false);
  readonly emEdicao = signal<Louvor | null>(null);
  readonly rascunho = signal({ ...FORM_VAZIO });
  readonly aviso = signal<string | null>(null);
  readonly detalhe = signal<Louvor | null>(null);

  /** Estado para a visualização de cifra (transposição) */
  readonly transposicao = signal(0);
  readonly salvandoTransposicao = signal(false);
  readonly avisoTransposicao = signal<string | null>(null);

  /** Estado da visualização estilo Cifra Club (abas, painéis e rolagem) */
  readonly aba = signal<'principal' | 'letra' | 'mais'>('principal');
  readonly painel = signal<'tom' | 'rolagem' | 'midia' | 'opcoes' | null>(null);
  readonly rolagemAtiva = signal(false);
  readonly velocidade = signal(40);
  readonly tamanhoFonte = signal(15);

  // --- Mídia em partes no Firestore (sem Firebase Storage) ---
  /** Converte o atalho fs:// do louvor em object URL tocável. */
  private readonly midiaSvc = inject(MidiaService);
  /** URL já montada para o player do painel de mídia; null = ainda carregando. */
  readonly midiaUrl = signal<string | null>(null);
  readonly midiaCarregando = signal(false);
  readonly midiaErro = signal<string | null>(null);
  /** Qual atalho o efeito já pediu (campo comum: evita baixar duas vezes). */
  private midiaPedida: string | null = null;

  @ViewChild('areaRolagem') areaRolagem?: ElementRef<HTMLDivElement>;
  private elRolagem: HTMLElement | null = null;
  private timerRolagem?: number;

  readonly lista = computed(() => {
    const termo = normalizarBusca(this.busca());
    // Busca fuzzy: ignora caixa/accentos e casa por título OU artista
    // ('diante' acha os louvores do Diante do Trono).
    return [...this.store.louvores()]
      .filter((l) =>
        termo
          ? normalizarBusca(l.titulo).includes(termo) ||
            normalizarBusca(l.artista ?? '').includes(termo)
          : true,
      )
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  });
  readonly todosLouvoresSelecionados = computed(() =>
    this.lista().length > 0 && this.lista().every(l => this.louvoresSelecionados().has(l.id)),
  );

  /** Cifra já transposta, para exibir no detalhe. */
  readonly cifraExibida = computed(() => {
    const l = this.detalhe();
    if (!l?.cifra) return '';
    // Cifras antigas podem ter zero-width space do site de origem (U+200B),
    // que invisível mas quebra a detecção de linhas de acordes.
    return limparInvisiveis(transpor(l.cifra, this.transposicao()));
  });

  readonly tomAtual = computed(() => {
    const l = this.detalhe();
    if (!l?.tom) return null;
    return transpor(l.tom, this.transposicao());
  });

  /** Acordes únicos que aparecem na cifra (na ordem em que surgem). */
  readonly acordes = computed(() => {
    const vistos: string[] = [];
    for (const linha of this.cifraExibida().split(/\r?\n/)) {
      if (!this.ehLinhaAcordes(linha)) continue;
      for (const tok of linha.trim().split(/\s+/)) {
        const nome = tok.replace(/^[()|,]+|[()|,]+$/g, '');
        if (nome && !vistos.includes(nome)) vistos.push(nome);
      }
    }
    return vistos;
  });

  /** Diagramas dos acordes, para desenhar na fila rolável. */
  readonly diagramas = computed(() =>
    this.acordes().map((nome) => this.montarDiagrama(nome)),
  );

  /** Linhas da cifra marcadas com os acordes em destaque. */
  readonly linhasCifra = computed(() =>
    this.cifraExibida().split(/\r?\n/).map((linha) =>
      this.ehLinhaAcordes(linha)
        ? { acordes: true as const, html: this.marcarAcordes(linha) }
        : { acordes: false as const, html: '', texto: linha },
    ),
  );

  /** Linhas da letra (sem tratamento de acordes). */
  readonly linhasLetra = computed(() =>
    limparInvisiveis(this.detalhe()?.letra ?? '').split(/\r?\n/),
  );

  readonly avisoCifra = this.cifraSvc.aviso;

  constructor() {
    addIcons({
      addOutline, trashOutline, createOutline, playCircleOutline,
      cloudUploadOutline, documentTextOutline, saveOutline, closeOutline,
      musicalNotesOutline, videocamOutline, keyOutline,
      removeOutline, addOutlineIcon, swapVerticalOutline,
      chevronDownOutline, appsOutline,
    });

    // Baixa o arquivo em partes só quando o painel de mídia abre — baixar
    // tudo na lista gastaria dados à toa (os pedaços não têm faixa de stream).
    effect(() => {
      const url =
        this.painel() === 'midia' ? (this.detalhe()?.midia?.url ?? null) : null;
      if (!url) {
        this.midiaPedida = null;
        this.midiaUrl.set(null);
        this.midiaCarregando.set(false);
        this.midiaErro.set(null);
        return;
      }
      if (url === this.midiaPedida) return;
      this.midiaPedida = url;
      this.midiaUrl.set(null);
      this.midiaErro.set(null);
      this.midiaCarregando.set(true);
      void this.midiaSvc
        .resolver(url)
        .then((resolvida) => {
          if (this.midiaPedida === url) this.midiaUrl.set(resolvida);
        })
        .catch(() => {
          if (this.midiaPedida === url) {
            this.midiaErro.set('Não foi possível carregar o arquivo de mídia.');
          }
        })
        .finally(() => {
          if (this.midiaPedida === url) this.midiaCarregando.set(false);
        });
    });
  }

  ngOnInit(): void {
    void this.store.iniciar();
  }

  ngOnDestroy(): void {
    this.pararRolagem();
  }

  abrirNovo(): void {
    if (!this.podeEditar()) return;
    this.emEdicao.set(null);
    this.rascunho.set({ ...FORM_VAZIO });
    this.aviso.set(null);
    this.modalAberto.set(true);
  }

  abrirEdicao(l: Louvor): void {
    // Quem não logou abre o louvor apenas para consultar (sem salvar).
    this.emEdicao.set(l);
    this.rascunho.set({
      titulo: l.titulo,
      artista: l.artista ?? '',
      tom: l.tom ?? '',
      bpm: l.bpm ?? null,
      letra: l.letra ?? '',
      cifra: l.cifra ?? '',
      fonteCifra: l.fonteCifra ?? '',
    });
    this.aviso.set(null);
    this.modalAberto.set(true);
  }

  verDetalhe(l: Louvor): void {
    this.detalhe.set(l);
    this.transposicao.set(0);
    this.avisoTransposicao.set(null);
    this.aba.set('principal');
    this.painel.set(null);
    this.detalheAberto.set(true);
  }

  fechar(): void {
    this.modalAberto.set(false);
  }

  fecharDetalhe(): void {
    this.pararRolagem();
    this.painel.set(null);
    this.aba.set('principal');
    this.detalheAberto.set(false);
    this.transposicao.set(0);
    this.avisoTransposicao.set(null);
  }

  /** Fecha o detalhe e abre a edição do mesmo louvor. */
  editarDoDetalhe(l: Louvor): void {
    this.fecharDetalhe();
    this.abrirEdicao(l);
  }

  alterar<K extends keyof typeof FORM_VAZIO>(campo: K, valor: (typeof FORM_VAZIO)[K]): void {
    this.rascunho.update((r) => ({ ...r, [campo]: valor }));
  }

  /** Tenta preencher letra e cifra a partir das fontes externas. */
  async buscarExterno(): Promise<void> {
    const { titulo, artista } = this.rascunho();
    if (!titulo.trim() || !artista.trim()) {
      this.aviso.set('Informe o título e o artista antes de buscar.');
      return;
    }
    this.aviso.set(null);

    // Letra e cifra em paralelo: metade do tempo de espera na tela.
    // (Cifra primeiro na ordem do resultado, para o aviso priorizá-la.)
    const [cifra, letra] = await Promise.all([
      this.cifraSvc.buscarCifra(titulo, artista),
      this.cifraSvc.buscarLetra(titulo, artista),
    ]);
    if (cifra.cifra) {
      this.rascunho.update((v) => ({
        ...v,
        cifra: cifra.cifra!,
        fonteCifra: cifra.fonte ?? v.fonteCifra,
      }));
    }

    // A API de cifras devolve uma letra limpa e separada da cifra; priorize-a
    // para manter as estrofes e impedir que acordes apareçam no campo Letra.
    const letraUsada = cifra.letra ?? letra.letra;
    if (letraUsada) {
      this.rascunho.update((v) => ({ ...v, letra: letraUsada }));
    }

    this.aviso.set(this.mensagemBusca(cifra, letra, letraUsada));
  }

  /** Frase única para o resultado da busca, combinando as duas fontes. */
  private mensagemBusca(
    cifra: ResultadoBusca,
    letra: ResultadoBusca,
    letraUsada?: string,
  ): string {
    if (cifra.cifra && letraUsada) {
      return cifra.letra
        ? `Letra e cifra importadas de ${cifra.fonteNome ?? 'uma fonte de cifras'}.`
        : `Cifra importada de ${cifra.fonteNome ?? 'uma fonte de cifras'} e letra importada separadamente.`;
    }
    if (cifra.cifra) return `Cifra importada de ${cifra.fonteNome ?? 'uma fonte de cifras'} (sem letra — digite manualmente).`;
    if (letraUsada) {
      return letra.aviso
        ? `Letra importada. ${cifra.aviso ?? letra.aviso}`
        : 'Letra encontrada na fonte externa.';
    }
    return cifra.aviso ?? letra.aviso ?? 'Nada encontrado nas fontes externas.';
  }

  /**
   * Envia mp3 ou mp4 do dispositivo em partes ao Firestore e devolve a mídia pronta.
   * Sem Firebase configurado, usa object URL local para ouvir na hora.
   */
  async escolherArquivo(evento: Event): Promise<void> {
    if (!this.podeEditar()) return;
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;

    const ehVideo = arquivo.type.includes('mp4');
    this.enviando.set(true);
    this.aviso.set(null);
    try {
      const existente = this.emEdicao();
      if (!existente) {
        this.aviso.set('Salve o louvor antes de anexar o arquivo, para poder vinculá-lo.');
        return;
      }
      const caminho = `louvores/${existente.id}/${Date.now()}-${arquivo.name}`;
      const url = await this.store.enviarArquivo(caminho, arquivo);
      await this.store.atualizar<Louvor>('louvores', existente.id, {
        midia: { url, tipo: ehVideo ? 'mp4' : 'mp3', tamanho: arquivo.size },
        atualizadoEm: Date.now(),
      });
      this.aviso.set(ehVideo ? 'Vídeo mp4 anexado.' : 'Áudio mp3 anexado.');
    } catch {
      this.aviso.set('Falha ao enviar o arquivo. Verifique a conexão e tente de novo.');
    } finally {
      this.enviando.set(false);
    }
  }

  async salvar(): Promise<void> {
    if (!this.podeEditar()) return;
    const dados = this.rascunho();
    if (!dados.titulo.trim()) return;
    const existente = this.emEdicao();
    const item: Louvor = {
      id: existente?.id ?? crypto.randomUUID(),
      titulo: dados.titulo.trim(),
      artista: dados.artista.trim() || undefined,
      tom: dados.tom.trim() || undefined,
      bpm: dados.bpm ?? undefined,
      letra: dados.letra || undefined,
      cifra: dados.cifra || undefined,
      fonteCifra: dados.fonteCifra || undefined,
      midia: existente?.midia,
      criadoEm: existente?.criadoEm ?? Date.now(),
      atualizadoEm: Date.now(),
    };
    try {
      await this.store.salvar('louvores', item);
    } catch (err) {
      this.aviso.set(
        `Falha ao salvar: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    this.fechar();
  }

  async remover(l: Louvor): Promise<void> {
    if (!this.podeEditar()) return;
    if (l.midia?.url) {
      await this.store.removerArquivo(l.midia.url);
    }
    await this.store.remover('louvores', l.id);
    this.alternarSelecaoLouvor(l.id, false);
  }

  alternarSelecaoLouvor(id: string, selecionado: boolean): void {
    const ids = new Set(this.louvoresSelecionados());
    selecionado ? ids.add(id) : ids.delete(id);
    this.louvoresSelecionados.set(ids);
  }

  alternarTodosLouvores(selecionado: boolean): void {
    const ids = selecionado ? new Set(this.lista().map(l => l.id)) : new Set<string>();
    this.louvoresSelecionados.set(ids);
  }

  acionarExclusaoLouvores(): void {
    if (!this.podeEditar()) return;
    if (!this.modoSelecaoLouvores()) {
      this.modoSelecaoLouvores.set(true);
      return;
    }
    if (this.louvoresSelecionados().size) {
      this.confirmarExclusaoLote.set(true);
      return;
    }
    this.modoSelecaoLouvores.set(false);
  }

  async confirmarExclusaoLouvores(): Promise<void> {
    if (!this.podeEditar()) return;
    const selecionados = this.store.louvores().filter(l => this.louvoresSelecionados().has(l.id));
    try {
      await this.store.removerVarios('louvores', selecionados.map(louvor => louvor.id));
      await Promise.allSettled(
        selecionados
          .filter(louvor => !!louvor.midia?.url)
          .map(louvor => this.store.removerArquivo(louvor.midia!.url)),
      );
      this.louvoresSelecionados.set(new Set());
      this.modoSelecaoLouvores.set(false);
      this.confirmarExclusaoLote.set(false);
    } catch (err) {
      this.aviso.set(`Não foi possível excluir todos os louvores: ${err instanceof Error ? err.message : String(err)}`);
      this.confirmarExclusaoLote.set(false);
    }
  }

  async tocar(l: Louvor): Promise<void> {
    if (!l.midia) {
      this.aviso.set('Este louvor ainda não tem arquivo de mídia.');
      return;
    }
    // Sem fila: a barra de play existe só para os Kits.
    await this.audio.tocar(l, l.midia);
  }

  /** Toca um arquivo mp3/mp4 direto do dispositivo, sem enviar para a nuvem. */
  async tocarLocal(evento: Event, l: Louvor): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    await this.audio.tocarArquivoLocal(l, arquivo);
  }

  estaTocando(l: Louvor): boolean {
    return this.audio.tocando() && this.audio.atual()?.louvor.id === l.id;
  }

  // ===== Funcionalidades de transposição (do CifrasPage) =====

  ajustar(delta: number): void {
    this.transposicao.update((t) => Math.max(-12, Math.min(12, t + delta)));
  }

  zerar(): void {
    this.transposicao.set(0);
  }

  async salvarTransposicao(): Promise<void> {
    if (!this.podeEditar()) return;
    const l = this.detalhe();
    if (!l?.cifra) return;
    this.salvandoTransposicao.set(true);
    try {
      await this.store.atualizar<Louvor>('louvores', l.id, {
        cifra: this.cifraExibida(),
        tom: this.tomAtual() ?? l.tom,
        atualizadoEm: Date.now(),
      });
      this.avisoTransposicao.set('Cifra salva no tom escolhido.');
      this.detalhe.set({ ...l, cifra: this.cifraExibida(), tom: this.tomAtual() ?? l.tom });
    } finally {
      this.salvandoTransposicao.set(false);
    }
  }

  /** Passos de um tom para o outro, usado como sugestão de key change. */
  distanciaAte(tom: string): number {
    const atual = this.detalhe()?.tom;
    if (!atual) return 0;
    return distancia(atual, tom);
  }

  // ===== Visualização estilo Cifra Club (abas, painéis, rolagem) =====

  mudarAba(aba: 'principal' | 'letra' | 'mais'): void {
    this.aba.set(aba);
    this.pararRolagem();
  }

  alternarPainel(painel: 'tom' | 'rolagem' | 'midia' | 'opcoes'): void {
    // Ao abrir o player dentro do modal, pausa o player global (que fica escondido atrás dele).
    if (painel === 'midia' && this.painel() !== 'midia') this.audio.parar();
    this.painel.update((p) => (p === painel ? null : painel));
  }

  ajustarFonte(delta: number): void {
    this.tamanhoFonte.update((t) => Math.max(12, Math.min(24, t + delta)));
  }

  iniciarRolagem(): void {
    // O contêiner rolável é o único elemento que a rolagem automática move.
    const el =
      this.areaRolagem?.nativeElement ??
      document.querySelector<HTMLElement>('.pagina-cifra .cifra-rolagem');
    if (!el) return;
    this.elRolagem = el;
    this.rolagemAtiva.set(true);
    this.timerRolagem = window.setInterval(() => {
      const alvo = this.elRolagem;
      if (!alvo || !alvo.isConnected) {
        this.pararRolagem();
        return;
      }
      alvo.scrollTop += this.velocidade() / 10;
      // Só para quando chega de fato ao fim (elemento precisa estar rolável).
      const noFim =
        alvo.scrollHeight > alvo.clientHeight + 1 &&
        alvo.scrollTop + alvo.clientHeight >= alvo.scrollHeight - 1;
      if (noFim) this.pararRolagem();
    }, 100);
  }

  pararRolagem(): void {
    if (this.timerRolagem !== undefined) {
      clearInterval(this.timerRolagem);
      this.timerRolagem = undefined;
    }
    this.elRolagem = null;
    this.rolagemAtiva.set(false);
  }

  alternarRolagem(): void {
    if (this.rolagemAtiva()) this.pararRolagem();
    else this.iniciarRolagem();
  }

  /** Uma linha só de acordes (ex.: "C     G     Am"), aceitando marcadores
   *  de seção como [Intro] na mesma linha. */
  private ehLinhaAcordes(linha: string): boolean {
    const t = linha.trim();
    if (!t || !/[A-G]/.test(t)) return false;
    let temAcorde = false;
    for (const tok of t.split(/\s+/)) {
      // Remove só parênteses/vírgulas das pontas: "D9(11)" mantém o nome.
      const limpo = tok.replace(/^[()|,]+|[()|,]+$/g, '');
      if (!limpo) continue;
      if (RE_MARCADOR.test(limpo)) continue;
      if (!RE_ACORDE.test(limpo)) return false;
      temAcorde = true;
    }
    return temAcorde;
  }

  /** Envolve cada acorde da linha em um <span> colorido. */
  private marcarAcordes(linha: string): string {
    return linha.replace(
      /(^|[\s(])([A-G](?:#|b)?(?:m|maj|min|dim|aug|sus\d|add\d|M|\d|\+|-|°)*(?:\([^)\s]*\))?)(?=[\s)]|$)/g,
      '$1<span class="acorde">$2</span>',
    );
  }

  /** Monta os dados do diagrama de um acorde (null se a forma for desconhecida). */
  private montarDiagrama(nome: string) {
    const forma = FORMAS[nome];
    if (!forma) return { nome, pos: [], casaInicial: 1, barra: null, pontos: [], temGrade: false };

    const casas = forma.pos.filter((v) => v > 0);
    const casaInicial = casas.length ? Math.min(...casas) : 1;

    // Dedos: começa pelo dedo 1 (ou 2 quando há pestana na casa inicial).
    let dedo = forma.barra ? 2 : 1;
    const pontos: { s: number; casa: number; dedo: number }[] = [];
    const ordenadas = [...new Set(casas)].sort((a, b) => a - b);
    for (const casa of ordenadas) {
      forma.pos.forEach((v, s) => {
        if (v !== casa) return;
        if (forma.barra && casa === forma.barra.casa && s >= forma.barra.de && s <= forma.barra.ate) return;
        pontos.push({ s, casa, dedo: Math.min(dedo, 4) });
        dedo++;
      });
    }

    return { nome, pos: forma.pos, casaInicial, barra: forma.barra ?? null, pontos, temGrade: true };
  }
}

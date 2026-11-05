import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonList, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
  IonModal, IonNote,
  IonTextarea, IonSegment, IonSegmentButton,
  IonCard, IonCardHeader, IonCardContent, IonBadge,
  IonAlert, IonItemSliding, IonItemOptions, IonItemOption, IonAvatar,
  IonSpinner,
  IonCheckbox,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, trashOutline, createOutline, saveOutline, closeOutline,
  calendarOutline, timeOutline, peopleOutline, chevronForwardOutline,
  chevronBackOutline, listOutline, checkmarkCircleOutline,
  personOutline, documentAttachOutline,
} from 'ionicons/icons';
import { StoreService } from '../core/store.service';
import { AuthService } from '../core/auth.service';
import { PresencaService } from '../core/presenca.service';
import { AudioService, formatarDataExtenso, formatarData } from '../core/audio.service';
import { hojeISO } from '../core/aniversario.service';
import { PlanilhaService } from '../core/planilha.service';
import type { PreviasCulto, ResultadoPlanilha } from '../core/planilha.service';
import type { Culto, ItemRota, Participante, Papel, PlanilhaEscala, StatusCulto } from '../core/models';

interface FormCulto {
  data: string;
  hora: string;
  titulo: string;
  /** Opção escolhida no menu de títulos (ou 'outro' para digitar). */
  tituloOpcao: string;
  /** ids dos participantes escalados no vocal deste culto. */
  cantores: string[];
  ministrante: string;
  /** ids da equipe de transmissão/mídia (papel 'operador') neste culto. */
  midia: string[];
  som: string[];
  local: string;
  status: StatusCulto;
  observacoes: string;
}

interface DiaCalendario {
  data: string;
  numero: number;
  noMes: boolean;
  hoje: boolean;
  quantidade: number;
}

/** Títulos fixos oferecidos no formulário (valor → texto salvo). */
const TITULOS_FIXOS: Record<string, string> = {
  libertacao: 'Culto da Libertação',
  celebracao: 'Culto da Celebração',
};

const FORM_VAZIO: FormCulto = {
  data: hojeISO(),
  hora: '19:00',
  titulo: '',
  tituloOpcao: 'outro',
  cantores: [],
  ministrante: '',
  midia: [],
  som: [],
  local: '',
  status: 'planejado',
  observacoes: '',
};

const PAPEIS_ORDEM: Papel[] = ['instrumentista', 'cantor', 'operador', 'som', 'ministrante', 'outro'];

@Component({
  selector: 'app-escala',
  standalone: true,
  templateUrl: './escala.page.html',
  styleUrls: ['../shared/pagina.scss', '../shared/modal.scss'],
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
    IonIcon, IonList, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
    IonModal, IonNote,
    IonTextarea, IonSegment, IonSegmentButton,
    IonCard, IonCardHeader, IonCardContent, IonBadge,
    IonAlert, IonItemSliding, IonItemOptions, IonItemOption, IonAvatar,
    IonSpinner, IonCheckbox,
  ],
})
/** Gerencia cultos, equipes, escalas e planilhas associadas aos cultos. */
export class EscalaPage implements OnInit {
  readonly store = inject(StoreService);
  readonly audio = inject(AudioService);
  /** Posição da equipe: vem do Perfil de cada pessoa. */
  readonly presenca = inject(PresencaService);
  /** Público: o template usa `podeEditar()` para mostrar só a visão da escala. */
  readonly auth = inject(AuthService);
  private readonly planilha = inject(PlanilhaService);
  /** Libera importar/criar/editar/excluir cultos e planilhas (só administradores). */
  readonly podeEditar = computed(() => this.auth.ehAdmin());
  private readonly planilhaSalvaId = 'escala-louvor-atual';
  private arrastoPlanilha: { elemento: HTMLElement; pointerId: number; x: number; y: number; left: number; top: number } | null = null;

  readonly modalAberto = signal(false);
  readonly emEdicao = signal<Culto | null>(null);
  readonly rascunho = signal<FormCulto>({ ...FORM_VAZIO });
  readonly cultoExcluir = signal<Culto | null>(null);
  readonly modoSelecaoCultos = signal(false);
  readonly cultosSelecionados = signal<Set<string>>(new Set());
  readonly confirmarExclusaoLote = signal(false);
  readonly planilhaExcluirAberta = signal(false);
  readonly erroExclusao = signal<string | null>(null);
  readonly aba = signal<'lista' | 'calendario' | 'planilha' | 'equipe'>('lista');
  readonly mesCalendario = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly dataSelecionada = signal(hojeISO());

  /** Importação de planilha Excel/CSV. */
  readonly lendoPlanilha = signal(false);
  readonly previaPlanilha = signal<ResultadoPlanilha | null>(null);
  readonly importandoPlanilha = signal(false);
  readonly planilhaImportada = signal(false);
  readonly nomePlanilha = signal('Escala do louvor');
  readonly editandoPlanilha = signal(false);
  readonly backupTabelaPlanilha = signal<string[][] | null>(null);
  /** Resultado mostrado na página (o modal pode já ter fechado). */
  readonly resultadoPlanilha = signal<string | null>(null);
  readonly resultadoPlanilhaErro = signal(false);

  readonly cultos = computed(() =>
    [...this.store.cultos()].sort((a, b) => a.data.localeCompare(b.data)),
  );
  readonly todosCultosSelecionados = computed(() =>
    this.cultos().length > 0 && this.cultos().every(c => this.cultosSelecionados().has(c.id)),
  );
  readonly todosCultosDaPlanilhaSelecionados = computed(() => {
    const linhas = this.previaPlanilha()?.linhas ?? [];
    return linhas.length > 0 && linhas.every(l => this.cultosSelecionados().has(l.culto.id));
  });
  readonly cultosFuturos = computed(() =>
    this.cultos().filter((c) => c.data >= hojeISO()),
  );
  readonly cultosPassados = computed(() =>
    this.cultos().filter((c) => c.data < hojeISO()).reverse(),
  );
  readonly tituloMes = computed(() => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(this.mesCalendario()));
  readonly diasCalendario = computed<DiaCalendario[]>(() => {
    const mes = this.mesCalendario();
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const deslocamento = (inicio.getDay() + 6) % 7;
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1 - deslocamento);
    const hoje = hojeISO();
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(primeiro.getFullYear(), primeiro.getMonth(), primeiro.getDate() + i);
      const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { data, numero: d.getDate(), noMes: d.getMonth() === mes.getMonth(), hoje: data === hoje, quantidade: this.cultos().filter((c) => c.data === data).length };
    });
  });
  readonly cultosDoDia = computed(() => this.cultos().filter((c) => c.data === this.dataSelecionada()));

  readonly participantes = computed(() =>
    this.store.participantes().filter((p) => p.ativo),
  );
  readonly porPapel = computed(() => {
    const mapa: Record<string, Participante[]> = {
      instrumentista: [], cantor: [], operador: [], som: [], ministrante: [], outro: [],
    };
    // Agrupa pela posição vinda do Perfil de cada pessoa — o que ela mesma
    // escolhe — e não pelo campo do cadastro em Participantes.
    for (const p of this.participantes()) {
      const papel = this.presenca.posicaoDe(p);
      if (mapa[papel]) mapa[papel].push(p);
    }
    return mapa;
  });

  constructor() {
    addIcons({
      addOutline, trashOutline, createOutline, saveOutline, closeOutline,
      calendarOutline, timeOutline, peopleOutline, chevronForwardOutline,
      chevronBackOutline, listOutline, checkmarkCircleOutline,
      personOutline, documentAttachOutline,
    });
  }

  ngOnInit(): void {
    // Liga a leitura dos perfis (posição da equipe) junto com os dados.
    this.presenca.iniciar();
    void this.carregarPlanilhaSalva();
  }

  private async carregarPlanilhaSalva(): Promise<void> {
    await this.store.iniciar();
    try {
      const salva = await this.store.buscar<PlanilhaEscala>('planilhas', this.planilhaSalvaId);
      if (!salva || this.previaPlanilha()) return;
      this.nomePlanilha.set(salva.nome);
      this.planilhaImportada.set(salva.importada);
      this.aba.set('planilha');
      this.previaPlanilha.set({
        tabela: { cabecalhos: salva.cabecalhos, linhas: salva.dados.map((linha) => linha.valores) },
        linhas: salva.cultos.map((culto, i) => ({ culto, semParticipante: salva.semParticipantes[i]?.nomes ?? [] })),
        ignoradas: salva.ignoradas,
        colunasIgnoradas: salva.colunasIgnoradas,
      });
    } catch {
      // A lista de cultos continua disponível quando a persistência não puder ser acessada.
    }
  }

  private async persistirPlanilha(importada = this.planilhaImportada()): Promise<void> {
    const previa = this.previaPlanilha();
    if (!previa) return;
    const documento: PlanilhaEscala = {
      id: this.planilhaSalvaId,
      nome: this.nomePlanilha(),
      cabecalhos: previa.tabela.cabecalhos,
      dados: previa.tabela.linhas.map((valores) => ({ valores })),
      cultos: previa.linhas.map((item) => item.culto),
      semParticipantes: previa.linhas.map((item) => ({ nomes: item.semParticipante })),
      ignoradas: previa.ignoradas,
      colunasIgnoradas: previa.colunasIgnoradas,
      importada,
      atualizadoEm: Date.now(),
    };
    await this.store.salvar('planilhas', documento);
  }

  abrirNovo(): void {
    if (!this.podeEditar()) return;
    this.emEdicao.set(null);
    this.rascunho.set({ ...FORM_VAZIO });
    this.modalAberto.set(true);
  }

  abrirNovoNaData(data: string): void {
    if (!this.podeEditar()) return;
    this.abrirNovo();
    this.rascunho.set({ ...FORM_VAZIO, data });
  }

  mudarMes(delta: number): void {
    const atual = this.mesCalendario();
    this.mesCalendario.set(new Date(atual.getFullYear(), atual.getMonth() + delta, 1));
  }

  selecionarDia(dia: DiaCalendario): void {
    this.dataSelecionada.set(dia.data);
    if (!dia.noMes) this.mesCalendario.set(new Date(Number(dia.data.slice(0, 4)), Number(dia.data.slice(5, 7)) - 1, 1));
  }

  diaSelecionado(data: string): boolean { return this.dataSelecionada() === data; }

  isColunaMinistracao(cabecalho: string): boolean {
    return cabecalho.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('ministr');
  }

  iniciarArrastePlanilha(evento: PointerEvent): void {
    if (this.editandoPlanilha() || evento.button !== 0) return;
    const alvo = evento.target;
    if (alvo instanceof Element && alvo.closest('ion-button, ion-input, input, textarea, a')) return;
    const elemento = evento.currentTarget as HTMLElement;
    this.arrastoPlanilha = {
      elemento,
      pointerId: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
      left: elemento.scrollLeft,
      top: elemento.scrollTop,
    };
    elemento.setPointerCapture(evento.pointerId);
  }

  arrastarPlanilha(evento: PointerEvent): void {
    const arrasto = this.arrastoPlanilha;
    if (!arrasto || arrasto.pointerId !== evento.pointerId) return;
    arrasto.elemento.scrollLeft = arrasto.left - (evento.clientX - arrasto.x);
    arrasto.elemento.scrollTop = arrasto.top - (evento.clientY - arrasto.y);
  }

  encerrarArrastePlanilha(evento: PointerEvent): void {
    const arrasto = this.arrastoPlanilha;
    if (!arrasto || arrasto.pointerId !== evento.pointerId) return;
    if (arrasto.elemento.hasPointerCapture(evento.pointerId)) {
      arrasto.elemento.releasePointerCapture(evento.pointerId);
    }
    this.arrastoPlanilha = null;
  }

  abrirEdicao(c: Culto): void {
    // Não-administradores abrem o culto apenas para consultar (sem salvar).
    this.emEdicao.set(c);
    // Título fixo vira a opção correspondente no menu; o resto fica em 'outro'.
    const opcao = Object.entries(TITULOS_FIXOS).find(([, texto]) => texto === c.titulo)?.[0];
    this.rascunho.set({
      data: c.data,
      hora: c.hora,
      titulo: c.titulo,
      tituloOpcao: opcao ?? 'outro',
      cantores: (c.equipe ?? [])
        .filter((e) => e.papel === 'cantor')
        .map((e) => e.participanteId),
      ministrante: (c.equipe ?? []).find((e) => e.papel === 'ministrante')?.participanteId ?? '',
      midia: (c.equipe ?? []).filter((e) => e.papel === 'operador').map((e) => e.participanteId),
      som: (c.equipe ?? []).filter((e) => e.papel === 'som').map((e) => e.participanteId),
      local: c.local ?? '',
      status: c.status,
      observacoes: c.observacoes ?? '',
    });
    this.modalAberto.set(true);
  }

  /**
   * Escolheu um título fixo no menu: preenche o campo e esconde o texto
   * livre. Ao escolher 'outro', limpa para o usuário digitar o dele.
   */
  aoEscolherTitulo(opcao: string): void {
    const fixo = TITULOS_FIXOS[opcao];
    this.rascunho.set({
      ...this.rascunho(),
      tituloOpcao: opcao,
      titulo: fixo ?? '',
    });
  }

  /** Cantores ativos (sem cantores cadastrados, oferece a equipe toda). */
  readonly cantoresDisponiveis = computed(() => {
    const cantores = this.porPapel()['cantor'];
    return cantores.length ? cantores : this.participantes();
  });
  readonly ministrantesDisponiveis = computed(() => {
    const ministrantes = this.porPapel()['ministrante'];
    return ministrantes.length ? ministrantes : this.participantes();
  });

  fechar(): void {
    this.modalAberto.set(false);
  }

  async salvar(): Promise<void> {
    if (!this.podeEditar()) return;
    const dados = this.rascunho();
    if (!dados.titulo.trim() || !dados.data) return;
    const existente = this.emEdicao();

    // Atualiza as seleções do formulário e preserva os demais papéis escalados.
    const papeisEditados: Papel[] = ['cantor', 'ministrante', 'operador', 'som'];
    const equipe = (existente?.equipe ?? []).filter((e) => !papeisEditados.includes(e.papel));
    for (const [papel, ids] of [
      ['cantor', dados.cantores], ['operador', dados.midia], ['som', dados.som],
    ] as [Papel, string[]][]) {
      for (const id of ids) equipe.push({ participanteId: id, papel });
    }
    if (dados.ministrante) equipe.push({ participanteId: dados.ministrante, papel: 'ministrante' });

    // Só inclui os campos opcionais quando preenchidos: o Firestore rejeita
    // `undefined` e recusaria o culto inteiro.
    const item: Culto = {
      id: existente?.id ?? crypto.randomUUID(),
      data: dados.data,
      hora: dados.hora,
      titulo: dados.titulo.trim(),
      status: dados.status,
      rota: existente?.rota ?? [],
      equipe,
      criadoEm: existente?.criadoEm ?? Date.now(),
      atualizadoEm: Date.now(),
      ...(dados.local.trim() ? { local: dados.local.trim() } : {}),
      ...(dados.observacoes ? { observacoes: dados.observacoes } : {}),
    };
    try {
      await this.store.salvar('cultos', item);
    } catch (err) {
      this.erroExclusao.set(err instanceof Error ? err.message : String(err));
      return;
    }
    this.fechar();
  }

  async remover(c: Culto): Promise<void> {
    this.cultoExcluir.set(c);
  }

  async confirmarExclusao(): Promise<void> {
    if (!this.podeEditar()) return;
    const c = this.cultoExcluir();
    if (!c) return;
    try {
      await this.store.remover('cultos', c.id);
    } catch (err) {
      this.erroExclusao.set(err instanceof Error ? err.message : String(err));
      this.cultoExcluir.set(null);
      return;
    }
    this.alternarSelecaoCulto(c.id, false);
    const previa = this.previaPlanilha();
    if (previa) {
      const idx = previa.linhas.findIndex((item) => item.culto.id === c.id);
      if (idx >= 0) {
        const linhas = previa.linhas.filter((item) => item.culto.id !== c.id);
        const linhasTabela = previa.tabela.linhas.filter((_, i) => i !== idx);
        this.previaPlanilha.set({ ...previa, linhas, tabela: { ...previa.tabela, linhas: linhasTabela } });
        void this.persistirPlanilha().catch((err: unknown) => {
          this.mostrarResultadoNaPagina(err instanceof Error ? err.message : 'Falha ao atualizar a planilha salva.', true);
        });
      }
    }
    this.cultoExcluir.set(null);
  }

  alternarSelecaoCulto(id: string, selecionado: boolean): void {
    const ids = new Set(this.cultosSelecionados());
    selecionado ? ids.add(id) : ids.delete(id);
    this.cultosSelecionados.set(ids);
  }

  alternarTodosCultos(selecionado: boolean): void {
    this.cultosSelecionados.set(selecionado ? new Set(this.cultos().map(c => c.id)) : new Set<string>());
  }

  acionarExclusaoCultos(): void {
    if (!this.podeEditar()) return;
    if (!this.modoSelecaoCultos()) {
      this.modoSelecaoCultos.set(true);
      return;
    }
    if (this.cultosSelecionados().size) {
      this.confirmarExclusaoLote.set(true);
      return;
    }
    this.modoSelecaoCultos.set(false);
  }

  alternarTodosCultosDaPlanilha(selecionado: boolean): void {
    const ids = new Set(this.cultosSelecionados());
    for (const linha of this.previaPlanilha()?.linhas ?? []) {
      selecionado ? ids.add(linha.culto.id) : ids.delete(linha.culto.id);
    }
    this.cultosSelecionados.set(ids);
  }

  async confirmarExclusaoCultosSelecionados(): Promise<void> {
    if (!this.podeEditar()) return;
    const idsSelecionados = this.cultosSelecionados();
    const alvos = this.store.cultos().filter(c => idsSelecionados.has(c.id));
    try {
      await this.store.removerVarios('cultos', alvos.map(culto => culto.id));

      const previa = this.previaPlanilha();
      if (previa) {
        const linhas = previa.linhas.filter(l => !idsSelecionados.has(l.culto.id));
        const linhasTabela = previa.linhas
          .map((l, indice) => ({ l, indice }))
          .filter(({ l }) => !idsSelecionados.has(l.culto.id))
          .map(({ indice }) => previa.tabela.linhas[indice]);
        this.previaPlanilha.set({ ...previa, linhas, tabela: { ...previa.tabela, linhas: linhasTabela } });
        await this.persistirPlanilha();
      }

      this.cultosSelecionados.set(new Set());
      this.modoSelecaoCultos.set(false);
      this.confirmarExclusaoLote.set(false);
    } catch (err) {
      this.mostrarResultadoNaPagina(
        `Não foi possível excluir todos os cultos: ${err instanceof Error ? err.message : String(err)}`,
        true,
      );
      this.confirmarExclusaoLote.set(false);
    }
  }

  pedirExclusaoPlanilha(): void {
    if (!this.podeEditar()) return;
    this.planilhaExcluirAberta.set(true);
  }

  iniciarEdicaoPlanilha(tabela: string[][]): void {
    if (!this.podeEditar()) return;
    this.backupTabelaPlanilha.set(tabela.map((linha) => [...linha]));
    this.editandoPlanilha.set(true);
  }

  cancelarEdicaoPlanilha(): void {
    const previa = this.previaPlanilha();
    const backup = this.backupTabelaPlanilha();
    if (previa && backup) this.previaPlanilha.set({ ...previa, tabela: { ...previa.tabela, linhas: backup } });
    this.editandoPlanilha.set(false);
    this.backupTabelaPlanilha.set(null);
  }

  async salvarEdicaoPlanilha(): Promise<void> {
    if (!this.podeEditar()) return;
    const previa = this.previaPlanilha();
    if (!previa) return;
    const atualizaCultosImportados = this.planilhaImportada();
    const interpretada = this.planilha.interpretarTabela(previa.tabela.cabecalhos, previa.tabela.linhas);
    if (interpretada.linhas.length !== previa.tabela.linhas.length) {
      this.mostrarResultadoNaPagina('Confira a coluna Data: todas as linhas precisam ter uma data válida.', true);
      return;
    }
    if (atualizaCultosImportados) {
      try {
        for (let i = 0; i < previa.linhas.length; i++) {
          const original = previa.linhas[i].culto;
          const convertido = interpretada.linhas[i].culto;
          const cabecalhos = previa.tabela.cabecalhos.map((h) => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
          const temColuna = (p: RegExp) => cabecalhos.some((h) => p.test(h));
          const item: Culto = {
            ...convertido,
            id: original.id,
            hora: temColuna(/hora|horario/) ? convertido.hora : original.hora,
            status: temColuna(/status/) ? convertido.status : original.status,
            rota: original.rota,
            criadoEm: original.criadoEm,
            atualizadoEm: Date.now(),
            ...(!temColuna(/local|igreja|templo/) && original.local ? { local: original.local } : {}),
            ...(!temColuna(/ausencia|falta/) && original.observacoes ? { observacoes: original.observacoes } : {}),
          };
          await this.store.salvar('cultos', item);
          if (temColuna(/local|igreja|templo/) && !convertido.local) {
            await this.store.removerCampos('cultos', original.id, ['local']);
          }
          if (temColuna(/ausencia|falta/) && !convertido.observacoes) {
            await this.store.removerCampos('cultos', original.id, ['observacoes']);
          }
          interpretada.linhas[i].culto.id = original.id;
        }
      } catch (err) {
        this.mostrarResultadoNaPagina(err instanceof Error ? err.message : 'Não foi possível salvar as alterações.', true);
        return;
      }
    }
    this.previaPlanilha.set({ ...interpretada, tabela: previa.tabela });
    this.editandoPlanilha.set(false);
    this.backupTabelaPlanilha.set(null);
    this.mostrarResultadoNaPagina(
      atualizaCultosImportados
        ? 'Alterações salvas na planilha e nos cultos.'
        : 'Alterações salvas na planilha aberta. Importe os cultos para gravá-los na escala.',
      false,
    );
    try {
      await this.persistirPlanilha();
    } catch (err) {
      this.mostrarResultadoNaPagina(err instanceof Error ? err.message : 'Falha ao guardar a planilha no aplicativo.', true);
    }
  }

  async descartarPlanilha(): Promise<void> {
    if (!this.podeEditar()) return;
    try {
      await this.store.remover('planilhas', this.planilhaSalvaId);
    } catch (err) {
      this.mostrarResultadoNaPagina(err instanceof Error ? err.message : 'Não foi possível excluir a planilha salva.', true);
      this.planilhaExcluirAberta.set(false);
      return;
    }
    this.previaPlanilha.set(null);
    this.planilhaImportada.set(false);
    this.nomePlanilha.set('Escala do louvor');
    this.editandoPlanilha.set(false);
    this.backupTabelaPlanilha.set(null);
    this.planilhaExcluirAberta.set(false);
  }

  cancelarExclusao(): void {
    this.cultoExcluir.set(null);
  }

  formatarData = formatarData;
  formatarDataExtenso = formatarDataExtenso;

  getRota(culto: Culto): ItemRota[] {
    return culto.rota?.length ? culto.rota : this.rotaPadrao();
  }

  private rotaPadrao(): ItemRota[] {
    return PAPEIS_ORDEM.map((papel, idx) => ({ ordem: idx, titulo: this.labelPapel(papel), papel }));
  }

  trackByPapel = (_: number, item: ItemRota) => item.titulo;

  labelPapel(papel: string): string {
    const labels: Record<string, string> = {
      instrumentista: 'Instrumentista',
      cantor: 'Cantor',
      operador: 'Operador',
      som: 'Som',
      ministrante: 'Ministrante',
      outro: 'Outro',
    };
    return labels[papel] ?? papel;
  }

  iconePapel(papel: string): string {
    const icons: Record<string, string> = {
      instrumentista: 'musical-notes-outline',
      cantor: 'person-outline',
      operador: 'videocam-outline',
      som: 'volume-high-outline',
      ministrante: 'book-outline',
      outro: 'ellipsis-horizontal-outline',
    };
    return icons[papel] ?? 'musical-notes-outline';
  }

  corStatus(s: string): string {
    switch (s) {
      case 'confirmado': return 'success';
      case 'realizado': return 'primary';
      default: return 'medium';
    }
  }

  /** Lê uma planilha (.xlsx/.xls/.csv) e abre os dados na aba Planilha. */
  async escolherPlanilha(evento: Event): Promise<void> {
    if (!this.podeEditar()) return;
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;

    this.lendoPlanilha.set(true);
    this.resultadoPlanilha.set(null);
    this.planilhaImportada.set(false);
    this.editandoPlanilha.set(false);
    this.backupTabelaPlanilha.set(null);
    try {
      const resultado = await this.planilha.ler(arquivo);
      if (!resultado.linhas.length) {
        // Sem prévia para abrir, o aviso precisa aparecer na própria página.
        this.mostrarResultadoNaPagina(
          'Nenhum culto legível na planilha. Confira se há uma coluna de datas preenchida.',
          true,
        );
        return;
      }
      this.nomePlanilha.set(arquivo.name);
      this.previaPlanilha.set(resultado);
      this.aba.set('planilha');
      try {
        await this.persistirPlanilha(false);
        this.mostrarResultadoNaPagina('Planilha salva no aplicativo.', false);
      } catch (err) {
        this.mostrarResultadoNaPagina(err instanceof Error ? err.message : 'Planilha aberta, mas não foi possível salvá-la no aplicativo.', true);
      }
    } catch (err) {
      this.mostrarResultadoNaPagina(
        err instanceof Error ? err.message : 'Não foi possível ler a planilha.',
        true,
      );
    } finally {
      this.lendoPlanilha.set(false);
    }
  }

  /** Mostra um aviso na página (sobrevive ao fechamento do modal). */
  private mostrarResultadoNaPagina(texto: string, erro: boolean): void {
    this.resultadoPlanilhaErro.set(erro);
    this.resultadoPlanilha.set(texto);
  }

  fecharPrevia(): void {
    this.previaPlanilha.set(null);
    this.planilhaImportada.set(false);
  }

  /** Nomes que não casaram com participantes já cadastrados. */
  nomesSemCadastro(previa: ResultadoPlanilha): string[] {
    const vistos: string[] = [];
    for (const { semParticipante } of previa.linhas) {
      for (const nome of semParticipante) {
        if (!vistos.some((n) => n.toLowerCase() === nome.toLowerCase())) vistos.push(nome);
      }
    }
    return vistos;
  }

  linhasComEquipe(previa: ResultadoPlanilha): PreviasCulto[] {
    return previa.linhas.filter((l) => l.culto.equipe.length > 0);
  }

  async confirmarImportacao(): Promise<void> {
    if (!this.podeEditar()) return;
    const previa = this.previaPlanilha();
    if (!previa) return;
    this.importandoPlanilha.set(true);
    try {
      const { salvos, pulados } = await this.planilha.importar(previa.linhas);
      const semCadastro = this.nomesSemCadastro(previa).length;
      const partes = [`Importação concluída: ${salvos} culto(s) salvo(s).`];
      if (pulados) partes.push(`${pulados} já existiam e foram pulados.`);
      if (semCadastro) {
        partes.push(
          `${semCadastro} nome(s) não estão na equipe — cadastre em Participantes para atribuí-los.`,
        );
      }
      this.planilhaImportada.set(true);
      await this.persistirPlanilha(true);
      this.mostrarResultadoNaPagina(partes.join(' '), false);
    } catch (err) {
      this.mostrarResultadoNaPagina(
        err instanceof Error ? err.message : 'Falha ao importar a planilha.',
        true,
      );
    } finally {
      this.importandoPlanilha.set(false);
    }
  }
}

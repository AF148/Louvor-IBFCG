import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonList, IonItem, IonLabel, IonInput,
  IonItemOption, IonItemSliding, IonItemOptions, IonModal, IonBadge,
  IonNote, IonSelect, IonSelectOption, IonAlert, IonCard, IonCardHeader,
  IonCardTitle, IonCardContent, IonAvatar, IonChip,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, trashOutline, createOutline, saveOutline, closeOutline,
  peopleOutline, personAddOutline, cafeOutline, callOutline,
  mailOutline, musicalNotesOutline, personOutline,
  radioButtonOn, radioButtonOff,
} from 'ionicons/icons';
import { StoreService } from '../core/store.service';
import { AuthService } from '../core/auth.service';
import { PresencaService } from '../core/presenca.service';
import type { Participante, Papel } from '../core/models';

const PAPEIS: { value: Papel; label: string; icone: string }[] = [
  { value: 'instrumentista', label: 'Instrumentista', icone: 'musical-notes-outline' },
  { value: 'cantor', label: 'Cantor', icone: 'person-outline' },
  { value: 'operador', label: 'Operador', icone: 'videocam-outline' },
  { value: 'som', label: 'Som', icone: 'volume-high-outline' },
  { value: 'ministrante', label: 'Ministrante', icone: 'book-outline' },
  { value: 'outro', label: 'Outro', icone: 'ellipsis-horizontal-outline' },
];

interface FormParticipante {
  nome: string;
  papel: Papel;
  telefone: string;
  email: string;
  nascimento: string;
  ativo: boolean;
  observacoes: string;
}

const FORM_VAZIO: FormParticipante = {
  nome: '',
  papel: 'cantor',
  telefone: '',
  email: '',
  nascimento: '',
  ativo: true,
  observacoes: '',
};

@Component({
  selector: 'app-participantes',
  standalone: true,
  templateUrl: './participantes.page.html',
  styleUrls: ['../shared/pagina.scss', '../shared/modal.scss'],
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
    IonIcon, IonList, IonItem, IonLabel, IonInput,
    IonItemOption, IonItemSliding, IonItemOptions, IonModal, IonBadge,
    IonNote, IonSelect, IonSelectOption, IonAlert, IonCard, IonCardHeader,
    IonCardTitle, IonCardContent, IonAvatar, IonChip,
  ],
})
/** Mantém a lista de participantes e as funções usadas para montar as escalas. */
export class ParticipantesPage implements OnInit, AfterViewInit {
  readonly store = inject(StoreService);
  /** Público: o template esconde novo/editar/excluir para não-administradores. */
  readonly auth = inject(AuthService);
  /** Posição (vinda do Perfil) e presença online/offline de cada pessoa. */
  readonly presenca = inject(PresencaService);
  readonly podeEditar = computed(() => this.auth.ehAdmin());

  readonly modalAberto = signal(false);
  readonly emEdicao = signal<Participante | null>(null);
  readonly rascunho = signal<FormParticipante>({ ...FORM_VAZIO });
  readonly aviso = signal<string | null>(null);
  readonly participanteExcluir = signal<Participante | null>(null);
  readonly erroExclusao = signal<string | null>(null);
  readonly filtroPapel = signal<Papel | 'todos'>('todos');

  /** Barra horizontal dos filtros (arrastável). */
  @ViewChild('barraFiltros') barraFiltros?: ElementRef<HTMLDivElement>;
  /** Evita que o scroll programático (centralizar) dispare a troca de filtro. */
  private programandoScroll = false;
  private timerSincronia?: ReturnType<typeof setTimeout>;

  /** Nome inteiro do filtro atual — sempre visível na linha de status. */
  readonly rotuloFiltro = computed(() => {
    const f = this.filtroPapel();
    return f === 'todos' ? 'Todos' : this.labelPapel(f);
  });

  readonly participantes = computed(() => {
    // O filtro usa a posição vinda do Perfil da pessoa, não o campo do cadastro.
    const base = this.filtroPapel() === 'todos'
      ? this.store.participantes()
      : this.store.participantes().filter((p) => this.presenca.posicaoDe(p) === this.filtroPapel());
    return [...base].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  readonly aniversariantes = computed(() => {
    const hoje = new Date();
    const mesDia = `${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    return this.store.participantes()
      .filter((p) => p.nascimento?.endsWith(mesDia))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  readonly papeis = PAPEIS;

  constructor() {
    addIcons({
      addOutline, trashOutline, createOutline, saveOutline, closeOutline,
      peopleOutline, personAddOutline, cafeOutline, callOutline,
      mailOutline, musicalNotesOutline, personOutline,
      radioButtonOn, radioButtonOff,
    });
  }

  ngOnInit(): void {
    void this.store.iniciar();
    this.presenca.iniciar();
  }

  ngAfterViewInit(): void {
    // Começa com a barra no início ("Todos" visível).
    window.setTimeout(() => this.centralizar(this.filtroPapel()), 0);
  }

  /** Seleciona um filtro e leva a pílula para o centro da barra. */
  selecionar(valor: Papel | 'todos'): void {
    this.filtroPapel.set(valor);
    this.centralizar(valor);
  }

  /** Usuário começou a arrastar a barra de filtros. */
  aoPressionarBarra(): void {
    this.programandoScroll = false;
  }

  /**
   * Ao parar de rolar (arrasto do usuário), o filtro passa a ser o da pílula
   * mais centralizada — é assim que "arrastar" troca o filtro.
   */
  aoRolarBarra(): void {
    if (this.programandoScroll) return;
    if (this.timerSincronia) clearTimeout(this.timerSincronia);
    this.timerSincronia = setTimeout(() => {
      const barra = this.barraFiltros?.nativeElement;
      if (!barra) return;
      const meio = barra.getBoundingClientRect().left + barra.clientWidth / 2;
      let melhor: Papel | 'todos' | null = null;
      let melhorDist = Infinity;
      for (const b of barra.querySelectorAll<HTMLButtonElement>('button.filtro')) {
        const r = b.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - meio);
        if (d < melhorDist) {
          melhorDist = d;
          melhor = (b.dataset['valor'] ?? 'todos') as Papel | 'todos';
        }
      }
      if (melhor && melhor !== this.filtroPapel()) this.filtroPapel.set(melhor);
    }, 120);
  }

  /** Centraliza a pílula de um filtro dentro da barra (scroll suave). */
  private centralizar(valor: Papel | 'todos'): void {
    const barra = this.barraFiltros?.nativeElement;
    if (!barra) return;
    const alvo = [...barra.querySelectorAll<HTMLButtonElement>('button.filtro')]
      .find((b) => b.dataset['valor'] === valor);
    if (!alvo) return;
    this.programandoScroll = true;
    barra.scrollTo({
      left: Math.max(0, alvo.offsetLeft - (barra.clientWidth - alvo.offsetWidth) / 2),
      behavior: 'smooth',
    });
    if (this.timerSincronia) clearTimeout(this.timerSincronia);
    window.setTimeout(() => (this.programandoScroll = false), 450);
  }

  /** Posição da pessoa: o Papel que ela escolheu no Perfil. */
  posicaoDe(p: Participante): Papel {
    return this.presenca.posicaoDe(p);
  }

  /** Verdadeiro se a pessoa estiver conectada agora. */
  estaOnline(p: Participante): boolean {
    return this.presenca.estaOnline(p);
  }

  /** "online agora" / "visto há 3 min"; vazio para quem nunca entrou. */
  ultimoAcesso(p: Participante): string {
    return this.presenca.ultimoAcesso(p);
  }

  abrirNovo(): void {
    if (!this.podeEditar()) return;
    this.emEdicao.set(null);
    this.rascunho.set({ ...FORM_VAZIO });
    this.aviso.set(null);
    this.modalAberto.set(true);
  }

  abrirEdicao(p: Participante): void {
    // Não-administradores abrem o participante apenas para consultar.
    this.emEdicao.set(p);
    this.rascunho.set({
      nome: p.nome,
      papel: p.papel,
      telefone: p.telefone ?? '',
      email: p.email ?? '',
      nascimento: p.nascimento ?? '',
      ativo: p.ativo,
      observacoes: p.observacoes ?? '',
    });
    this.aviso.set(null);
    this.modalAberto.set(true);
  }

  fechar(): void {
    this.modalAberto.set(false);
  }

  async salvar(): Promise<void> {
    if (!this.podeEditar()) return;
    const dados = this.rascunho();
    if (!dados.nome.trim()) return;
    const existente = this.emEdicao();
    const item: Participante = {
      id: existente?.id ?? crypto.randomUUID(),
      nome: dados.nome.trim(),
      papel: dados.papel,
      telefone: dados.telefone.trim() || undefined,
      email: dados.email.trim() || undefined,
      nascimento: dados.nascimento || undefined,
      ativo: dados.ativo,
      observacoes: dados.observacoes.trim() || undefined,
      criadoEm: existente?.criadoEm ?? Date.now(),
    };
    try {
      await this.store.salvar('participantes', item);
    } catch (err) {
      this.aviso.set(`Falha ao salvar: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.fechar();
  }

  async remover(p: Participante): Promise<void> {
    this.participanteExcluir.set(p);
  }

  confirmarExclusao(): void {
    if (!this.podeEditar()) return;
    const p = this.participanteExcluir();
    if (!p) return;
    this.store.remover('participantes', p.id);
    this.participanteExcluir.set(null);
  }

  cancelarExclusao(): void {
    this.participanteExcluir.set(null);
  }

  labelPapel(papel: Papel): string {
    return PAPEIS.find((x) => x.value === papel)?.label ?? papel;
  }

  iconePapel(papel: Papel): string {
    return PAPEIS.find((x) => x.value === papel)?.icone ?? 'musical-notes-outline';
  }
}

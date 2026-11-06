import { Component, effect, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonCard, IonCardContent, IonChip, IonLabel, IonModal,
  IonInput, IonTextarea, IonSpinner, IonNote, IonActionSheet, IonBadge,
  IonSelect, IonSelectOption,
  type ActionSheetButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  personCircleOutline, createOutline, mailOutline, logOutOutline,
  musicalNotesOutline, peopleOutline, calendarOutline, closeOutline,
  checkmarkOutline, shieldCheckmarkOutline, cameraOutline, imageOutline,
  trashOutline, colorPaletteOutline,
} from 'ionicons/icons';
import type { Papel, Usuario } from '../core/models';
import { AuthService } from '../core/auth.service';
import { BANNERS_PERFIL, comprimirImagem, fundoCapa } from '../core/imagem.util';

/** Papéis oferecidos no seletor do modal de edição. */
const PAPEIS: { value: Papel; label: string }[] = [
  { value: 'ministrante', label: 'Ministrante (líder)' },
  { value: 'cantor', label: 'Cantor(a)' },
  { value: 'instrumentista', label: 'Instrumentista' },
  { value: 'operador', label: 'Operador(a) de transmissão' },
  { value: 'som', label: 'Equipe de som' },
  { value: 'outro', label: 'Outro' },
];

@Component({
  selector: 'app-perfil',
  standalone: true,
  templateUrl: './perfil.page.html',
  styleUrls: ['../shared/pagina.scss', './perfil.page.scss'],
  imports: [
    FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
    IonButton, IonIcon, IonCard, IonCardContent, IonChip, IonLabel, IonModal,
    IonInput, IonTextarea, IonSpinner, IonNote, IonActionSheet, IonBadge,
    IonSelect, IonSelectOption,
  ],
})
/** Permite editar os dados, a foto e as preferências da conta atual. */
export class PerfilPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('capaInput') private capaInput?: ElementRef<HTMLInputElement>;

  readonly perfil = signal<Usuario | null>(null);
  readonly carregandoPerfil = signal(false);
  readonly modalEdicao = signal(false);
  readonly nome = signal('');
  readonly sobreMim = signal('');
  readonly habilidades = signal<string[]>([]);
  /** Papel escolhido no modal ('' = ainda não definido). */
  readonly papel = signal<Papel | ''>('');
  /** Personalização (rascunhos do modal; gravados só em salvar()). */
  readonly fotoUrl = signal<string | null>(null);
  readonly bannerUrl = signal<string | null>(null);
  readonly bannerGradiente = signal<string>(BANNERS_PERFIL[0].css);
  readonly salvando = signal(false);
  /** Troca direta pela capa/avatar (fora do modal de edição). */
  readonly salvandoImagem = signal(false);
  /** Enviando o reenvio do e-mail de confirmação. */
  readonly enviandoConfirmacao = signal(false);
  readonly acaoCapa = signal(false);
  readonly aviso = signal<string | null>(null);
  readonly habilidadesDisponiveis = [
    'Ministrante', 'Vocalista', 'Instrumentista', 'Tecladista', 'Violão',
    'Guitarra', 'Baixista', 'Baterista', 'Operação de áudio', 'Transmissão',
  ];
  readonly banners = BANNERS_PERFIL;
  readonly papeis = PAPEIS;

  constructor() {
    addIcons({
      personCircleOutline, createOutline, mailOutline, logOutOutline,
      musicalNotesOutline, peopleOutline, calendarOutline, closeOutline,
      checkmarkOutline, shieldCheckmarkOutline, cameraOutline, imageOutline,
      trashOutline, colorPaletteOutline,
    });
    effect(() => {
      const user = this.auth.usuario();
      if (user) void this.carregarPerfil(user.uid);
      else this.perfil.set(null);
    });
  }

  private async carregarPerfil(uid: string): Promise<void> {
    this.carregandoPerfil.set(true);
    try {
      this.perfil.set(await this.auth.buscarPerfil(uid));
    } catch {
      this.perfil.set(null);
    } finally {
      this.carregandoPerfil.set(false);
    }
  }

  abrirEdicao(): void {
    const usuario = this.auth.usuario();
    const perfil = this.perfil();
    this.nome.set(perfil?.nome ?? usuario?.displayName ?? '');
    this.sobreMim.set(perfil?.sobreMim ?? '');
    this.habilidades.set(perfil?.habilidades ?? []);
    this.papel.set(perfil?.papel ?? '');
    this.fotoUrl.set(perfil?.fotoUrl ?? null);
    this.bannerUrl.set(perfil?.bannerUrl ?? null);
    this.bannerGradiente.set(perfil?.bannerGradiente ?? BANNERS_PERFIL[0].css);
    this.aviso.set(null);
    this.modalEdicao.set(true);
  }

  /**
   * Acesso à tela de login/cadastro (`/login`). O `criar` só pré-seleciona
   * a aba certa; quem decide se entra ou cadastra é o usuário lá.
   */
  irParaLogin(criar = false): void {
    void this.router.navigate(['/login'], {
      queryParams: criar ? { criar: '1', returnUrl: '/perfil' } : { returnUrl: '/perfil' },
    });
  }

  alternarHabilidade(habilidade: string): void {
    const atuais = this.habilidades();
    this.habilidades.set(atuais.includes(habilidade)
      ? atuais.filter((item) => item !== habilidade)
      : [...atuais, habilidade]);
  }

  /** Escolhe e compacta a foto de perfil (1:1, até 512px). */
  async escolherFoto(evento: Event): Promise<void> {
    const arquivo = this.arquivoDe(evento);
    if (!arquivo) return;
    try {
      this.fotoUrl.set(await comprimirImagem(arquivo, 512, 512));
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível usar essa imagem.');
    }
  }

  /** Escolhe e compacta a imagem da capa (bandeira, até 1200×630). */
  async escolherBanner(evento: Event): Promise<void> {
    const arquivo = this.arquivoDe(evento);
    if (!arquivo) return;
    try {
      this.bannerUrl.set(await comprimirImagem(arquivo, 1200, 630));
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível usar essa imagem.');
    }
  }

  removerFoto(): void {
    this.fotoUrl.set(null);
  }

  removerBanner(): void {
    this.bannerUrl.set(null);
  }

  /**
   * Troca a foto tocando no avatar da página: escolhe, compacta e grava na
   * hora, sem abrir o modal de edição.
   */
  async trocarFotoDireto(evento: Event): Promise<void> {
    const arquivo = this.arquivoDe(evento);
    if (!arquivo) return;
    try {
      this.salvandoImagem.set(true);
      this.aviso.set(null);
      await this.gravarImagem('foto', await comprimirImagem(arquivo, 512, 512));
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível trocar a foto.');
    } finally {
      this.salvandoImagem.set(false);
    }
  }

  /**
   * Troca a imagem da capa tocando na área da página (quando a ação escolhe
   * "Imagem"); o gradiente segue pelo modal de edição.
   */
  async trocarCapaDireto(evento: Event): Promise<void> {
    const arquivo = this.arquivoDe(evento);
    if (!arquivo) return;
    try {
      this.salvandoImagem.set(true);
      this.aviso.set(null);
      await this.gravarImagem('capa', await comprimirImagem(arquivo, 1200, 630));
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível trocar a capa.');
    } finally {
      this.salvandoImagem.set(false);
    }
  }

  /** Escolhe uma cor nova para a capa direto pela página. */
  async escolherGradienteDireto(gradiente: string): Promise<void> {
    try {
      this.salvandoImagem.set(true);
      this.aviso.set(null);
      await this.gravarImagem('gradiente', gradiente);
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível salvar a capa.');
    } finally {
      this.salvandoImagem.set(false);
    }
  }

  /** Botões do action sheet da capa: imagem da galeria ou um gradiente pronto. */
  capaBotoes(): ActionSheetButton[] {
    return [
      { text: 'Escolher imagem', icon: 'image-outline', handler: () => this.capaInput?.nativeElement.click() },
      ...this.banners.map((banner) => ({
        text: banner.nome,
        icon: 'color-palette-outline',
        handler: () => void this.escolherGradienteDireto(banner.css),
      })),
      { text: 'Cancelar', role: 'cancel' },
    ];
  }

  /** Grava só a parte visual, mantendo o resto do perfil como está. */
  private async gravarImagem(
    campo: 'foto' | 'capa' | 'gradiente',
    valor: string,
  ): Promise<void> {
    const user = this.auth.usuario();
    if (!user) return;
    const perfil = this.perfil();
    await this.auth.atualizarPerfil({
      nome: perfil?.nome ?? user.displayName ?? '',
      sobreMim: perfil?.sobreMim ?? '',
      habilidades: perfil?.habilidades ?? [],
      fotoUrl: campo === 'foto' ? valor : perfil?.fotoUrl,
      bannerUrl: campo === 'capa' ? valor : perfil?.bannerUrl,
      bannerGradiente: campo === 'gradiente' ? valor : perfil?.bannerGradiente,
    });
    await this.carregarPerfil(user.uid);
  }

  escolherGradiente(gradiente: string): void {
    this.bannerGradiente.set(gradiente);
    this.bannerUrl.set(null); // cor escolhida substitui a imagem da capa
  }

  /** Fundo da capa no modal, refletindo as mudanças em tempo real. */
  get capaPrevia(): string {
    return fundoCapa(this.bannerUrl() ?? undefined, this.bannerGradiente());
  }

  private arquivoDe(evento: Event): File | null {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0] ?? null;
    input.value = '';
    return arquivo;
  }

  async salvar(): Promise<void> {
    this.salvando.set(true);
    this.aviso.set(null);
    try {
      await this.auth.atualizarPerfil({
        nome: this.nome(),
        sobreMim: this.sobreMim(),
        habilidades: this.habilidades(),
        papel: this.papel() || undefined,
        fotoUrl: this.fotoUrl() ?? undefined,
        bannerUrl: this.bannerUrl() ?? undefined,
        bannerGradiente: this.bannerGradiente(),
      });
      const uid = this.auth.usuario()?.uid;
      if (uid) await this.carregarPerfil(uid);
      this.modalEdicao.set(false);
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      this.salvando.set(false);
    }
  }

  async sair(): Promise<void> {
    await this.auth.sair();
    await this.router.navigateByUrl('/home');
  }

  /** Reenvia o e-mail de verificação para a caixa de entrada. */
  async reenviarConfirmacao(): Promise<void> {
    this.enviandoConfirmacao.set(true);
    this.aviso.set(null);
    try {
      await this.auth.reenviarConfirmacao();
      this.aviso.set('E-mail de confirmação reenviado. Confira sua caixa de entrada.');
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível reenviar o e-mail.');
    } finally {
      this.enviandoConfirmacao.set(false);
    }
  }

  /** Recarrega a conta após o clique no link de confirmação. */
  async verificarConfirmacao(): Promise<void> {
    this.aviso.set(null);
    try {
      await this.auth.atualizarConfirmacao();
      if (!this.auth.emailConfirmado()) {
        this.aviso.set('Ainda não confirmado. Abra o link que enviamos para o seu e-mail.');
      }
    } catch {
      this.aviso.set('Não foi possível verificar agora. Tente novamente.');
    }
  }

  get iniciais(): string {
    const nome = this.perfil()?.nome ?? this.auth.nomeExibicao;
    return nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase();
  }

  /** CSS de fundo da capa do perfil (imagem > gradiente escolhido > padrão). */
  get fundoCapaPerfil(): string {
    return fundoCapa(this.perfil()?.bannerUrl, this.perfil()?.bannerGradiente);
  }

  /** Iniciais para a prévia do modal, usando o nome que está sendo editado. */
  get iniciaisEdicao(): string {
    const nome = this.nome() || this.perfil()?.nome || this.auth.nomeExibicao;
    return nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  }
}

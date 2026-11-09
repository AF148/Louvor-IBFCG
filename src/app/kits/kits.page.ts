import { Component, OnDestroy, ViewChild, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonList, IonItem, IonLabel, IonNote, IonSearchbar,
  IonModal, IonInput, IonTextarea, IonSpinner, IonAlert,
  IonItemSliding, IonItemOptions, IonItemOption, IonProgressBar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, trashOutline, saveOutline, closeOutline, micOutline,
  stopOutline, playCircleOutline, pauseCircleOutline, musicalNotesOutline,
  personCircleOutline, timerOutline, folderOpenOutline,
  checkmarkCircleOutline, videocamOutline,
} from 'ionicons/icons';
import { StoreService } from '../core/store.service';
import { AuthService } from '../core/auth.service';
import { AudioService, formatarTempo } from '../core/audio.service';
import type { Trilha } from '../core/audio.service';
import { GravadorService, blobParaArquivo } from '../core/gravador.service';
import { YoutubeService, thumbnailYouTube } from '../core/youtube.service';
import { YoutubePlayerModalComponent } from '../shared/youtube-player-modal.component';
import type { FaixaKit, KitMusical, VideoYouTube } from '../core/models';

/** Faixa gravada ainda não salva (rascunho do modal de gravação). */
interface FaixaRascunho {
  id: string;
  titulo: string;
  blob: Blob;
  duracao: number;
  previewUrl: string;
}

const FORM_VAZIO = { titulo: '', descricao: '' };

/**
 * Área de Kit vocal: somente administradores (doc em `admins/{uid}`)
 * gravam kits de músicas pelo microfone do aparelho e os outros
 * membros ouvem pelo player global do app.
 */
@Component({
  selector: 'app-kits',
  standalone: true,
  templateUrl: './kits.page.html',
  styleUrls: ['../shared/pagina.scss', '../shared/modal.scss', './kits.page.scss'],
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
    IonIcon, IonList, IonItem, IonLabel, IonNote, IonSearchbar,
    IonModal, IonInput, IonTextarea, IonSpinner, IonAlert,
    IonItemSliding, IonItemOptions, IonItemOption, IonProgressBar,
    YoutubePlayerModalComponent,
  ],
})
/** Lista kits vocais, grava novas faixas e controla a reprodução. */
export class KitsPage implements OnDestroy {
  readonly store = inject(StoreService);
  readonly auth = inject(AuthService);
  readonly audio = inject(AudioService);
  readonly gravador = inject(GravadorService);
  readonly youtube = inject(YoutubeService);

  @ViewChild(YoutubePlayerModalComponent) player?: YoutubePlayerModalComponent;

  readonly busca = signal('');
  readonly gravacaoAberta = signal(false);
  readonly rascunho = signal({ ...FORM_VAZIO });
  /** id do kit a que as faixas do rascunho serão acrescentadas (null = kit novo). */
  readonly kitAlvoId = signal<string | null>(null);
  readonly faixasRascunho = signal<FaixaRascunho[]>([]);
  /** Blob da última gravação pronta, ainda não batizada como faixa. */
  readonly ultimaGravacao = signal<Blob | null>(null);
  /** URL do áudio escolhido de fora (gravado em outro aplicativo). */
  readonly arquivoExternoUrl = signal<string | null>(null);
  /** Duração medida do arquivo externo (0 quando o formato não informa). */
  readonly duracaoExterna = signal(0);
  readonly tituloFaixa = signal('');
  /** Link colado do vídeo do YouTube que acompanha o kit (vazio = sem vídeo). */
  readonly linkVideo = signal('');
  readonly enviando = signal(false);
  readonly erroModal = signal<string | null>(null);
  readonly kitDetalheId = signal<string | null>(null);
  readonly kitExcluir = signal<KitMusical | null>(null);
  readonly faixaExcluir = signal<FaixaKit | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly avisoErro = signal(false);

  /** Só administradores grava (e apaga) kits — igual às regras do Firestore. */
  readonly podeGravar = computed(() => this.auth.ehAdmin());

  readonly kits = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    return [...this.store.kits()]
      .filter((k) => (termo ? k.titulo.toLowerCase().includes(termo) : true))
      .sort((a, b) => b.criadoEm - a.criadoEm);
  });

  /** Kit aberto no modal de detalhe, acompanhando a escuta em tempo real. */
  readonly kitDetalhe = computed(() => {
    const id = this.kitDetalheId();
    return id ? this.store.kits().find((k) => k.id === id) ?? null : null;
  });

  /** Kit cujas faixas serão acrescentadas na gravação atual. */
  readonly kitAlvo = computed(() => {
    const id = this.kitAlvoId();
    return id ? this.store.kits().find((k) => k.id === id) ?? null : null;
  });

  readonly podeSalvar = computed(() => {
    const alvo = this.kitAlvo();
    const temTitulo = !!alvo || !!this.rascunho().titulo.trim();
    // Salva com faixa nova OU só atualizando o vídeo do kit já existente.
    const temConteudo = this.faixasRascunho().length > 0 || !!this.linkVideo().trim();
    return temTitulo && temConteudo;
  });

  /** ID extraído do link colado; null quando o link ainda não é válido. */
  readonly videoId = computed(() => this.youtube.extrairVideoId(this.linkVideo()));

  /** Há link escrito mas ainda inválido (aviso ao lado do campo). */
  readonly videoIdValido = computed(() => !!this.videoId());

  formatarTempo = formatarTempo;

  /** Data de criação (timestamp em ms) como 'DD/MM/AAAA'. */
  dataCriacao(ts: number): string {
    return new Date(ts).toLocaleDateString('pt-BR');
  }

  constructor() {
    addIcons({
      addOutline, trashOutline, saveOutline, closeOutline, micOutline,
      stopOutline, playCircleOutline, pauseCircleOutline, musicalNotesOutline,
      personCircleOutline, timerOutline, folderOpenOutline,
      checkmarkCircleOutline, videocamOutline,
    });
  }

  ngOnDestroy(): void {
    this.descartarRascunho();
    this.gravador.cancelar();
  }

  // --- Gravação ---

  /** Abre o modal de gravação; com `kit`, acrescenta faixas nele. */
  abrirGravacao(kit?: KitMusical): void {
    if (!this.podeGravar()) return;
    this.rascunho.set({ ...FORM_VAZIO });
    this.kitAlvoId.set(kit?.id ?? null);
    // Já gravado: mostra o link que o kit já tem, pra editar sem perder.
    this.linkVideo.set(kit?.videoId ? `https://www.youtube.com/watch?v=${kit.videoId}` : '');
    this.erroModal.set(null);
    this.gravacaoAberta.set(true);
  }

  fecharGravacao(): void {
    if (this.gravador.gravando()) this.gravador.cancelar();
    else this.gravador.limpar();
    this.limparArquivoExterno();
    this.descartarRascunho();
    this.erroModal.set(null);
    this.gravacaoAberta.set(false);
    this.kitAlvoId.set(null);
    this.linkVideo.set('');
  }

  async iniciarGravacao(): Promise<void> {
    this.ultimaGravacao.set(null);
    this.limparArquivoExterno();
    this.erroModal.set(null);
    await this.gravador.iniciar();
    if (this.gravador.erro()) this.erroModal.set(this.gravador.erro());
  }

  async pararGravacao(): Promise<void> {
    const blob = await this.gravador.parar();
    if (blob) this.ultimaGravacao.set(blob);
    else if (this.gravador.erro()) this.erroModal.set(this.gravador.erro());
  }

  /** Prévia da faixa atual: gravação do microfone ou arquivo externo. */
  readonly urlPrevia = computed(
    () => this.arquivoExternoUrl() ?? this.gravador.urlGravacao(),
  );

  /**
   * Escolhe um áudio já gravado em outro aplicativo (gravação, nota de voz,
   * download) e o usa como faixa do kit, sem passar pelo microfone.
   */
  async escolherArquivoExterno(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    if (arquivo.type && !arquivo.type.startsWith('audio/')) {
      this.erroModal.set('Escolha um arquivo de áudio (mp3, m4a, wav...).');
      return;
    }
    this.erroModal.set(null);
    this.ultimaGravacao.set(null);
    this.gravador.limpar();
    this.limparArquivoExterno();
    const url = URL.createObjectURL(arquivo);
    this.arquivoExternoUrl.set(url);
    this.ultimaGravacao.set(arquivo);
    this.duracaoExterna.set(await this.medirDuracao(url));
    // Sugere o nome do arquivo como título da faixa.
    if (!this.tituloFaixa().trim()) {
      this.tituloFaixa.set(arquivo.name.replace(/\.[^.]+$/, ''));
    }
  }

  /** Duração real do arquivo escolhido; 0 quando o navegador não informa. */
  private async medirDuracao(url: string): Promise<number> {
    return new Promise((resolve) => {
      const audio = new Audio();
      let resolvido = false;
      const concluir = (duracao: number) => {
        if (resolvido) return;
        resolvido = true;
        audio.removeAttribute('src');
        resolve(Number.isFinite(duracao) && duracao > 0 ? duracao : 0);
      };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => concluir(audio.duration);
      audio.onerror = () => concluir(0);
      audio.src = url;
      // Rede lenta: não deixa o fluxo preso esperando o cabeçalho do arquivo.
      setTimeout(() => concluir(audio.duration), 8000);
    });
  }

  private limparArquivoExterno(): void {
    const url = this.arquivoExternoUrl();
    if (url) URL.revokeObjectURL(url);
    this.arquivoExternoUrl.set(null);
    this.duracaoExterna.set(0);
  }

  /** Fixa a gravação atual como faixa do rascunho (precisa de título). */
  adicionarFaixa(): void {
    const blob = this.ultimaGravacao();
    const titulo = this.tituloFaixa().trim();
    if (!blob || !titulo) return;
    const externo = !!this.arquivoExternoUrl();
    const faixa: FaixaRascunho = {
      id: crypto.randomUUID(),
      titulo,
      blob,
      duracao: externo ? this.duracaoExterna() : this.gravador.duracaoSegundos(),
      // Object URL próprio: o do gravador é revogado em `limpar()`.
      previewUrl: URL.createObjectURL(blob),
    };
    this.faixasRascunho.update((lista) => [...lista, faixa]);
    this.tituloFaixa.set('');
    this.ultimaGravacao.set(null);
    this.gravador.limpar();
    this.limparArquivoExterno();
  }

  removerFaixaRascunho(id: string): void {
    const removida = this.faixasRascunho().find((f) => f.id === id);
    if (removida) URL.revokeObjectURL(removida.previewUrl);
    this.faixasRascunho.update((lista) => lista.filter((f) => f.id !== id));
  }

  /** Envia as faixas em partes ao Firestore e grava (ou completa) o kit. */
  async salvar(): Promise<void> {
    const pendentes = this.faixasRascunho();
    const alvo = this.kitAlvo();
    const dados = this.rascunho();
    const link = this.linkVideo().trim();
    // Nada novo: nem faixa pendente nem vídeo colado.
    if (!pendentes.length && !link) return;
    if (!alvo && !dados.titulo.trim()) return;

    this.enviando.set(true);
    this.erroModal.set(null);
    try {
      // Link escrito mas inválido: avisa antes de gastar o envio das faixas.
      if (link && !this.videoId()) {
        throw new Error('O link do vídeo do YouTube não é válido. Cole o link completo.');
      }
      const agora = Date.now();
      const kitId = alvo?.id ?? crypto.randomUUID();
      const faixasNovas: FaixaKit[] = [];
      for (const f of pendentes) {
        const arquivo = blobParaArquivo(f.blob, f.titulo);
        const url = await this.store.enviarArquivo(`kits/${kitId}/${arquivo.name}`, arquivo);
        faixasNovas.push({
          id: f.id,
          titulo: f.titulo,
          url,
          criadoEm: agora,
          ...(f.duracao > 0 ? { duracaoSegundos: f.duracao } : {}),
        });
      }

      const descricao = dados.descricao.trim();
      const autorId = this.auth.usuario()?.uid;
      const autorNome = this.auth.perfil()?.nome ?? this.auth.nomeExibicao;
      const kit: KitMusical = {
        id: kitId,
        titulo: alvo?.titulo ?? dados.titulo.trim(),
        faixas: [...(alvo?.faixas ?? []), ...faixasNovas],
        criadoEm: alvo?.criadoEm ?? agora,
        atualizadoEm: agora,
        // Opcionais só com valor: o Firestore rejeita `undefined`.
        ...((alvo?.descricao ?? descricao) ? { descricao: alvo?.descricao ?? descricao } : {}),
        ...((alvo?.autorId ?? autorId) ? { autorId: alvo?.autorId ?? autorId } : {}),
        ...((alvo?.autorNome ?? autorNome) ? { autorNome: alvo?.autorNome ?? autorNome } : {}),
        // Vídeo do YouTube: `null` apaga o que estava salvo (merge preserva
        // os demais campos, então null é a forma de limpar).
        videoId: this.videoId() ?? null,
      };
      await this.store.salvar('kits', kit);

      this.avisoErro.set(false);
      if (!faixasNovas.length) {
        // Só o vídeo foi mexido: não fala em faixa.
        this.aviso.set(`Vídeo do kit "${kit.titulo}" salvo.`);
      } else {
        this.aviso.set(
          alvo
            ? `${faixasNovas.length} faixa(s) acrescentada(s) ao kit "${kit.titulo}".`
            : `Kit "${kit.titulo}" salvo com ${kit.faixas.length} faixa(s).`,
        );
      }
      this.fecharGravacao();
    } catch (err) {
      this.erroModal.set(
        err instanceof Error
          ? `Falha ao enviar: ${err.message}`
          : 'Falha ao enviar as faixas. Verifique a conexão.',
      );
    } finally {
      this.enviando.set(false);
    }
  }

  private descartarRascunho(): void {
    for (const f of this.faixasRascunho()) URL.revokeObjectURL(f.previewUrl);
    this.faixasRascunho.set([]);
    this.ultimaGravacao.set(null);
    this.limparArquivoExterno();
    this.tituloFaixa.set('');
  }

  // --- Escuta ---

  abrirDetalhe(kit: KitMusical): void {
    this.kitDetalheId.set(kit.id);
  }

  fecharDetalhe(): void {
    this.kitDetalheId.set(null);
  }

  /** Toca a primeira faixa do kit pelo player global. */
  tocarKit(kit: KitMusical): void {
    const primeira = kit.faixas[0];
    if (primeira) void this.tocarFaixa(kit, primeira);
  }

  /** Abre o vídeo do YouTube do kit no player embutido do app. */
  tocarVideo(kit: KitMusical): void {
    const videoId = kit.videoId;
    if (!videoId) return;
    const video: VideoYouTube = { videoId, titulo: kit.titulo, posicao: 0 };
    this.player?.abrir([video], 0);
  }

  /** Miniatura do vídeo servida pelo YouTube (não gasta cota da API). */
  thumbnail(videoId: string): string {
    return thumbnailYouTube(videoId);
  }

  /** Toca uma faixa pelo player global (continua ao trocar de tela). */
  async tocarFaixa(kit: KitMusical, faixa: FaixaKit): Promise<void> {
    if (this.estaTocando(faixa)) {
      this.audio.parar();
      return;
    }
    // Fila = todas as faixas do kit: ⏮/⏭ no player pulam entre elas.
    // `emKit` liga a barra de play (só os Kits têm barra visível).
    const alvo = this.trilhaFaixa(kit, faixa);
    await this.audio.tocar(
      alvo.louvor,
      alvo.midia,
      this.faixasDe(kit).map((f) => this.trilhaFaixa(kit, f)),
      true,
    );
  }

  /** Monta a trilha navegável (louvor + mídia) de uma faixa do kit. */
  private trilhaFaixa(kit: KitMusical, faixa: FaixaKit): Trilha {
    return {
      louvor: {
        id: faixa.id,
        titulo: faixa.titulo,
        criadoEm: faixa.criadoEm,
        atualizadoEm: kit.atualizadoEm,
      },
      midia: {
        url: faixa.url,
        tipo: 'mp3',
        ...(faixa.duracaoSegundos ? { duracaoSegundos: faixa.duracaoSegundos } : {}),
      },
    };
  }

  estaTocando(faixa: FaixaKit): boolean {
    return this.audio.tocando() && this.audio.atual()?.midia.url === faixa.url;
  }

  faixasDe(kit: KitMusical): FaixaKit[] {
    return kit.faixas ?? [];
  }

  podeExcluir(): boolean {
    // As regras do Firestore negam kit para não-administradores,
    // então a UI esconde o excluir em vez de deixar a exclusão falhar.
    return this.podeGravar();
  }

  // --- Exclusões ---

  pedirExclusao(kit: KitMusical): void {
    this.kitExcluir.set(kit);
  }

  cancelarExclusao(): void {
    this.kitExcluir.set(null);
  }

  async confirmarExclusao(): Promise<void> {
    const kit = this.kitExcluir();
    this.kitExcluir.set(null);
    if (!kit) return;
    try {
      for (const faixa of this.faixasDe(kit)) {
        await this.store.removerArquivo(faixa.url);
      }
      await this.store.remover('kits', kit.id);
      if (this.kitDetalheId() === kit.id) this.fecharDetalhe();
      this.avisoErro.set(false);
      this.aviso.set(`Kit "${kit.titulo}" excluído.`);
    } catch (err) {
      this.avisoErro.set(true);
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível excluir o kit.');
    }
  }

  pedirExclusaoFaixa(faixa: FaixaKit): void {
    this.faixaExcluir.set(faixa);
  }

  cancelarExclusaoFaixa(): void {
    this.faixaExcluir.set(null);
  }

  async confirmarExclusaoFaixa(): Promise<void> {
    const faixa = this.faixaExcluir();
    this.faixaExcluir.set(null);
    const kit = this.kitDetalhe();
    if (!faixa || !kit) return;
    try {
      const restantes = this.faixasDe(kit).filter((f) => f.id !== faixa.id);
      await this.store.atualizar<KitMusical>('kits', kit.id, {
        faixas: restantes,
        atualizadoEm: Date.now(),
      });
      await this.store.removerArquivo(faixa.url);
      if (this.audio.atual()?.midia.url === faixa.url) this.audio.parar();
    } catch (err) {
      this.avisoErro.set(true);
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível excluir a faixa.');
    }
  }

  limparAviso(): void {
    this.aviso.set(null);
    this.avisoErro.set(false);
  }
}

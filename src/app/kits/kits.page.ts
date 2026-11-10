import { Component, OnDestroy, ViewChild, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonList, IonItem, IonLabel, IonNote, IonSearchbar,
  IonModal, IonInput, IonTextarea, IonSpinner, IonAlert,
  IonItemSliding, IonItemOptions, IonItemOption, IonProgressBar,
  IonCheckbox, IonThumbnail,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, trashOutline, saveOutline, closeOutline, micOutline,
  stopOutline, playCircleOutline, pauseCircleOutline, musicalNotesOutline,
  personCircleOutline, timerOutline, folderOpenOutline,
  checkmarkCircleOutline, videocamOutline, logoYoutube,
  cloudDownloadOutline, chevronForwardOutline,
} from 'ionicons/icons';
import { StoreService } from '../core/store.service';
import { AuthService } from '../core/auth.service';
import { AudioService, formatarTempo } from '../core/audio.service';
import type { Trilha } from '../core/audio.service';
import { GravadorService, blobParaArquivo } from '../core/gravador.service';
import { MidiaService } from '../core/midia.service';
import { YoutubeService, thumbnailYouTube } from '../core/youtube.service';
import { YoutubePlayerModalComponent } from '../shared/youtube-player-modal.component';
import type {
  FaixaKit, KitMusical, Louvor, Playlist, TipoMidia, VideoKitRef, VideoYouTube,
} from '../core/models';

/**
 * Faixa ainda não salva (rascunho do modal de gravação). Tem `blob` quando
 * vem da gravação/arquivo escolhido, ou `url` quando referencia o áudio de
 * um louvor do repertório (aí `louvorId` marca a origem).
 */
interface FaixaRascunho {
  id: string;
  titulo: string;
  blob?: Blob;
  url?: string;
  tipo?: TipoMidia;
  louvorId?: string;
  duracao: number;
  /** Object URL tocável na lista; vazio até resolver (`fs://` do repertório). */
  previewUrl: string;
  /** true quando o preview é nosso (revogável); false para URL compartilhada. */
  previewPropria?: boolean;
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
    IonCheckbox, IonThumbnail,
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
  private readonly midia = inject(MidiaService);

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
  /** Vídeos do YouTube escolhidos para o kit (o do kit, ao editar). */
  readonly videosRascunho = signal<VideoKitRef[]>([]);
  /** Buffer do campo de link: um vídeo por vez, adicionado pelo botão. */
  readonly linkVideo = signal('');
  /** Seletor de louvores do repertório (empilha sobre o modal de gravação). */
  readonly seletorRepertorioAberto = signal(false);
  readonly buscaRepertorio = signal('');
  /** Seletor de vídeos de playlist para levar ao kit. */
  readonly seletorVideosAberto = signal(false);
  /** Playlist aberta no passo 2 do seletor (lista escolhida ou carregada por link). */
  readonly playlistSelecionada = signal<{ nome: string; videos: VideoYouTube[] } | null>(null);
  readonly videosEscolhidos = signal<string[]>([]);
  readonly linkPlaylist = signal('');
  readonly importandoPlaylist = signal(false);
  readonly erroSeletor = signal<string | null>(null);
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
    // Kit novo: basta o título — dá pra criar vazio e ir montando depois.
    if (!alvo) return !!this.rascunho().titulo.trim();
    // Kit existente: salva só quando há faixa nova OU mudança nos vídeos.
    return (
      this.faixasRascunho().length > 0 ||
      !this.mesmosVideos(this.videosRascunho(), this.videosDoKit(alvo))
    );
  });

  /** ID extraído do link colado; null quando o link ainda não é válido. */
  readonly videoId = computed(() => this.youtube.extrairVideoId(this.linkVideo()));

  /** Há link escrito mas ainda inválido (aviso ao lado do campo). */
  readonly videoIdValido = computed(() => !!this.videoId());

  /** Louvores do repertório que têm áudio, filtrados pela busca do seletor. */
  readonly louvoresRepertorio = computed(() => {
    const termo = this.buscaRepertorio().trim().toLowerCase();
    return this.store
      .louvores()
      .filter((l) => !!l.midia?.url)
      .filter(
        (l) =>
          !termo ||
          l.titulo.toLowerCase().includes(termo) ||
          (l.artista ?? '').toLowerCase().includes(termo),
      )
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  });

  /** Playlists importadas do YouTube que têm vídeos para levar ao kit. */
  readonly playlistsComVideo = computed(() =>
    this.store.playlists().filter((p) => !!p.itensYouTube?.length),
  );

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
      checkmarkCircleOutline, videocamOutline, logoYoutube,
      cloudDownloadOutline, chevronForwardOutline,
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
    // Já gravado: começa com os vídeos que o kit já tem, pra editar sem perder.
    this.videosRascunho.set(
      (kit ? this.videosDoKit(kit) : []).map((v) => ({ ...v })),
    );
    this.linkVideo.set('');
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
    this.videosRascunho.set([]);
    this.fecharSeletorRepertorio();
    this.fecharSeletorVideos();
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
   * Escolhe um ou mais áudios já gravados em outro aplicativo (gravação,
   * nota de voz, download) como faixas do kit, sem passar pelo microfone.
   *
   * Um arquivo só segue o fluxo de prévia/nome; vários entram direto na
   * lista do rascunho com o nome do arquivo, e dá pra renomear depois.
   */
  async escolherArquivoExterno(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivos = Array.from(input.files ?? []);
    input.value = '';
    if (!arquivos.length) return;
    if (arquivos.some((a) => a.type && !a.type.startsWith('audio/'))) {
      this.erroModal.set('Escolha arquivos de áudio (mp3, m4a, wav...).');
      return;
    }
    this.erroModal.set(null);

    if (arquivos.length === 1) {
      const arquivo = arquivos[0];
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
      return;
    }

    // Vários arquivos: entra tudo na lista de uma vez, já com duração.
    this.ultimaGravacao.set(null);
    this.gravador.limpar();
    this.limparArquivoExterno();
    for (const arquivo of arquivos) {
      const url = URL.createObjectURL(arquivo);
      const duracao = await this.medirDuracao(url);
      const titulo =
        arquivo.name.replace(/\.[^.]+$/, '').trim() ||
        `Faixa ${this.faixasRascunho().length + 1}`;
      this.faixasRascunho.update((lista) => [
        ...lista,
        { id: crypto.randomUUID(), titulo, blob: arquivo, duracao, previewUrl: url, previewPropria: true },
      ]);
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
      previewPropria: true,
    };
    this.faixasRascunho.update((lista) => [...lista, faixa]);
    this.tituloFaixa.set('');
    this.ultimaGravacao.set(null);
    this.gravador.limpar();
    this.limparArquivoExterno();
  }

  removerFaixaRascunho(id: string): void {
    const removida = this.faixasRascunho().find((f) => f.id === id);
    if (removida) this.revogarPreview(removida);
    this.faixasRascunho.update((lista) => lista.filter((f) => f.id !== id));
  }

  /** Renomeia uma faixa do rascunho direto na lista. */
  renomearFaixaRascunho(id: string, titulo: string): void {
    this.faixasRascunho.update((lista) =>
      lista.map((f) => (f.id === id ? { ...f, titulo } : f)),
    );
  }

  /** Revoga só o object URL que é nosso (o do repertório é compartilhado). */
  private revogarPreview(faixa: FaixaRascunho): void {
    if (faixa.previewPropria && faixa.previewUrl) {
      URL.revokeObjectURL(faixa.previewUrl);
    }
  }

  // --- Louvores do repertório ---

  /** Abre o seletor de louvores do repertório (empilha sobre a gravação). */
  abrirSeletorRepertorio(): void {
    this.buscaRepertorio.set('');
    this.erroModal.set(null);
    this.seletorRepertorioAberto.set(true);
  }

  fecharSeletorRepertorio(): void {
    this.seletorRepertorioAberto.set(false);
  }

  /** Louvor já presente no rascunho (o seletor mostra o✓). */
  louvorNoRascunho(louvor: Louvor): boolean {
    return this.faixasRascunho().some((f) => f.louvorId === louvor.id);
  }

  /**
   * Adiciona (ou remove, se já estiver) o áudio de um louvor do repertório
   * como faixa do kit. O arquivo continua sendo do repertório: a faixa só
   * referencia a URL, marcada com `louvorId` pra nunca apagar o original.
   */
  alternarLouvor(louvor: Louvor): void {
    const midia = louvor.midia;
    if (!midia?.url) return;

    const existente = this.faixasRascunho().find((f) => f.louvorId === louvor.id);
    if (existente) {
      this.removerFaixaRascunho(existente.id);
      return;
    }

    const faixa: FaixaRascunho = {
      id: crypto.randomUUID(),
      titulo: louvor.titulo,
      url: midia.url,
      tipo: midia.tipo,
      louvorId: louvor.id,
      duracao: midia.duracaoSegundos ?? 0,
      // `fs://` ainda não é tocável: resolve no próximo passo.
      previewUrl: '',
      previewPropria: false,
    };
    this.faixasRascunho.update((lista) => [...lista, faixa]);

    // Resolve o atalho fs:// em object URL compartilhado (cache do MidiaService).
    void this.midia
      .resolver(midia.url)
      .then((url) =>
        this.faixasRascunho.update((lista) =>
          lista.map((f) => (f.id === faixa.id ? { ...f, previewUrl: url } : f)),
        ),
      )
      .catch(() => {
        // Sem prévia o playback no kit ainda funciona (o player resolve sozinho).
      });
  }

  // --- Vídeos do YouTube ---

  /** Vídeos do kit (lê a lista nova; cai no `videoId` legado). */
  videosDoKit(kit: KitMusical): VideoKitRef[] {
    if (kit.videos?.length) return kit.videos;
    return kit.videoId ? [{ videoId: kit.videoId }] : [];
  }

  /** Compara por ordem e id: título/canal não contam como mudança. */
  private mesmosVideos(a: VideoKitRef[], b: VideoKitRef[]): boolean {
    return a.length === b.length && a.every((v, i) => v.videoId === b[i].videoId);
  }

  /** Adiciona o vídeo do link colado ao rascunho (um por vez). */
  async adicionarVideo(): Promise<void> {
    const id = this.videoId();
    if (!id) return;
    if (this.videosRascunho().some((v) => v.videoId === id)) {
      this.erroModal.set('Este vídeo já está no kit.');
      return;
    }
    this.erroModal.set(null);
    this.linkVideo.set('');
    this.videosRascunho.update((lista) => [
      ...lista,
      { videoId: id, titulo: 'Vídeo do YouTube' },
    ]);
    // Título de cortesia via oEmbed (sem cota de API); se falhar, fica o genérico.
    const info = await this.tituloDoVideo(id);
    this.videosRascunho.update((lista) =>
      lista.map((v) =>
        v.videoId === id
          ? { ...v, titulo: info.titulo, ...(info.canal ? { canal: info.canal } : {}) }
          : v,
      ),
    );
  }

  removerVideoRascunho(videoId: string): void {
    this.videosRascunho.update((lista) => lista.filter((v) => v.videoId !== videoId));
  }

  /** Busca título/canal do vídeo no oEmbed público do YouTube. */
  private async tituloDoVideo(videoId: string): Promise<{ titulo: string; canal?: string }> {
    try {
      const url =
        'https://www.youtube.com/oembed?format=json&url=' +
        encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
      const resp = await fetch(url);
      if (resp.ok) {
        const dados = (await resp.json()) as { title?: string; author_name?: string };
        if (dados.title) {
          return { titulo: dados.title, ...(dados.author_name ? { canal: dados.author_name } : {}) };
        }
      }
    } catch {
      // Sem rede/CORS: o título genérico já está gravado.
    }
    return { titulo: 'Vídeo do YouTube' };
  }

  // --- Seletor de vídeos de playlist ---

  /** Passo 1: lista as playlists com vídeo (e o campo de link). */
  abrirSeletorVideos(): void {
    this.playlistSelecionada.set(null);
    this.videosEscolhidos.set([]);
    this.linkPlaylist.set('');
    this.erroSeletor.set(null);
    this.seletorVideosAberto.set(true);
  }

  fecharSeletorVideos(): void {
    this.seletorVideosAberto.set(false);
    this.playlistSelecionada.set(null);
    this.videosEscolhidos.set([]);
    this.linkPlaylist.set('');
    this.erroSeletor.set(null);
  }

  /** Passo 2: abre a playlist escolhida já com tudo marcado. */
  escolherPlaylist(p: Playlist): void {
    this.playlistSelecionada.set({ nome: p.nome, videos: p.itensYouTube ?? [] });
    this.videosEscolhidos.set((p.itensYouTube ?? []).map((v) => v.videoId));
    this.erroSeletor.set(null);
  }

  /** Carrega os vídeos de uma playlist colando o link (importação direta). */
  async carregarPlaylistPorLink(): Promise<void> {
    const id = this.youtube.extrairPlaylistId(this.linkPlaylist().trim());
    if (!id) {
      this.erroSeletor.set('Link inválido. Cole o link da playlist do YouTube.');
      return;
    }
    this.importandoPlaylist.set(true);
    this.erroSeletor.set(null);
    const videos = await this.youtube.importarPlaylist(id);
    this.importandoPlaylist.set(false);
    if (!videos.length) {
      this.erroSeletor.set(this.youtube.erro() ?? 'Nenhum vídeo encontrado nesta playlist.');
      return;
    }
    this.playlistSelecionada.set({ nome: 'Playlist do YouTube', videos });
    this.videosEscolhidos.set(videos.map((v) => v.videoId));
    this.linkPlaylist.set('');
  }

  definirVideoEscolhido(videoId: string, marcado: boolean): void {
    this.videosEscolhidos.update((ids) =>
      marcado
        ? ids.includes(videoId)
          ? ids
          : [...ids, videoId]
        : ids.filter((i) => i !== videoId),
    );
  }

  /** Leva os vídeos marcados para o rascunho do kit (sem duplicar). */
  adicionarVideosEscolhidos(): void {
    const playlist = this.playlistSelecionada();
    if (!playlist) return;
    const atuais = new Set(this.videosRascunho().map((v) => v.videoId));
    const novos = playlist.videos
      .filter((v) => this.videosEscolhidos().includes(v.videoId) && !atuais.has(v.videoId))
      .map<VideoKitRef>((v) => ({
        videoId: v.videoId,
        titulo: v.titulo,
        ...(v.canal ? { canal: v.canal } : {}),
      }));
    if (novos.length) this.videosRascunho.update((lista) => [...lista, ...novos]);
    this.fecharSeletorVideos();
  }

  /** Envia as faixas em partes ao Firestore e grava (ou completa) o kit. */
  async salvar(): Promise<void> {
    const pendentes = this.faixasRascunho();
    const alvo = this.kitAlvo();
    const dados = this.rascunho();
    const videos = this.videosRascunho();
    const videosMudaram = !alvo || !this.mesmosVideos(videos, this.videosDoKit(alvo));
    // Kit novo só precisa de título; kit existente precisa ter algo novo.
    if (!alvo && !dados.titulo.trim()) return;
    if (alvo && !pendentes.length && !videosMudaram) return;

    this.enviando.set(true);
    this.erroModal.set(null);
    try {
      const agora = Date.now();
      const kitId = alvo?.id ?? crypto.randomUUID();
      const faixasNovas: FaixaKit[] = [];
      for (const f of pendentes) {
        // Faixa do repertório já tem URL; gravação/arquivo é enviado agora.
        let url = f.url ?? '';
        if (f.blob) {
          const arquivo = blobParaArquivo(f.blob, f.titulo);
          url = await this.store.enviarArquivo(`kits/${kitId}/${arquivo.name}`, arquivo);
        }
        if (!url) continue;
        faixasNovas.push({
          id: f.id,
          titulo: f.titulo,
          url,
          criadoEm: agora,
          ...(f.tipo && f.tipo !== 'mp3' ? { tipo: f.tipo } : {}),
          ...(f.louvorId ? { louvorId: f.louvorId } : {}),
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
        // Vídeos: lista nova; `videoId: null` apaga o campo legado de vídeo único
        // (merge preserva os demais campos, então null é a forma de limpar).
        videos: videos.map((v) => ({
          videoId: v.videoId,
          ...(v.titulo ? { titulo: v.titulo } : {}),
          ...(v.canal ? { canal: v.canal } : {}),
        })),
        videoId: null,
      };
      await this.store.salvar('kits', kit);

      this.avisoErro.set(false);
      if (!alvo) {
        this.aviso.set(
          faixasNovas.length
            ? `Kit "${kit.titulo}" criado com ${kit.faixas.length} faixa(s). Use o + do kit para acrescentar mais.`
            : `Kit "${kit.titulo}" criado. Use o + do kit para acrescentar faixas e vídeos.`,
        );
      } else if (!faixasNovas.length) {
        // Só os vídeos foram mexidos: não fala em faixa.
        this.aviso.set(`Vídeos do kit "${kit.titulo}" atualizados.`);
      } else {
        this.aviso.set(
          `${faixasNovas.length} faixa(s) acrescentada(s) ao kit "${kit.titulo}".`,
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
    for (const f of this.faixasRascunho()) this.revogarPreview(f);
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

  /** Abre os vídeos do kit no player embutido, a partir do índice tocado. */
  tocarVideo(kit: KitMusical, indice = 0): void {
    const videos = this.videosDoKit(kit);
    if (!videos.length) return;
    const lista: VideoYouTube[] = videos.map((v, i) => ({
      videoId: v.videoId,
      titulo: v.titulo ?? 'Vídeo do YouTube',
      ...(v.canal ? { canal: v.canal } : {}),
      posicao: i,
    }));
    this.player?.abrir(lista, Math.min(Math.max(0, indice), lista.length - 1));
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
        tipo: faixa.tipo ?? 'mp3',
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

  /**
   * true quando o arquivo foi enviado para o kit (`fs://kits|...`).
   * URLs do repertório (`fs://louvores|...`) não são apagáveis daqui.
   */
  private arquivoDoKit(url: string): boolean {
    return url.startsWith('fs://kits|');
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
        // Só apaga o arquivo se ele for do kit (nunca o do repertório).
        if (this.arquivoDoKit(faixa.url)) await this.store.removerArquivo(faixa.url);
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
      // Só apaga o arquivo se ele for do kit (nunca o do repertório).
      if (this.arquivoDoKit(faixa.url)) await this.store.removerArquivo(faixa.url);
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

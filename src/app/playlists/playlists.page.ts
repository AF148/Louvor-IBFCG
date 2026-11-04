import { Component, OnInit, inject, computed, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonList, IonItem, IonLabel, IonInput,
  IonItemOption, IonItemSliding, IonItemOptions, IonModal, IonBadge,
  IonNote, IonSearchbar, IonTextarea, IonThumbnail,
  IonReorderGroup, IonReorder, IonAlert, IonSpinner,
  IonCheckbox,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, trashOutline, createOutline, playCircleOutline,
  saveOutline, closeOutline, listOutline, reorderThreeOutline,
  musicalNotesOutline, cloudDownloadOutline, logoYoutube,
} from 'ionicons/icons';
import { StoreService } from '../core/store.service';
import { AuthService } from '../core/auth.service';
import { AudioService } from '../core/audio.service';
import { CifraService } from '../core/cifra.service';
import { DeepLinkService } from '../core/deep-link.service';
import { thumbnailYouTube, formatarDuracao } from '../core/youtube.service';
import { YoutubePlayerModalComponent } from '../shared/youtube-player-modal.component';
import type { Playlist, ItemPlaylist, Louvor, VideoYouTube } from '../core/models';

const FORM_PLAYLIST = {
  nome: '',
  descricao: '',
};

@Component({
  selector: 'app-playlists',
  standalone: true,
  templateUrl: './playlists.page.html',
  styleUrls: ['../shared/pagina.scss', '../shared/modal.scss', './playlists.page.scss'],
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
    IonIcon, IonList, IonItem, IonLabel, IonInput,
    IonItemOption, IonItemSliding, IonItemOptions, IonModal, IonBadge,
    IonNote, IonSearchbar, IonTextarea, IonThumbnail,
    IonReorderGroup, IonReorder, IonAlert, IonSpinner, IonCheckbox,
    YoutubePlayerModalComponent,
  ],
})
/** Cria e edita playlists de louvor e coleções de vídeos do YouTube. */
export class PlaylistsPage implements OnInit {
  readonly store = inject(StoreService);
  /** Público: o template esconde novo/editar/excluir para quem não logou. */
  readonly auth = inject(AuthService);
  readonly audio = inject(AudioService);
  readonly cifraSvc = inject(CifraService);
  readonly deepLink = inject(DeepLinkService);

  /** Editar playlists exige membro logado (e-mail/senha) — igual às regras. */
  readonly podeEditar = computed(() => !!this.auth.usuario());

  @ViewChild(YoutubePlayerModalComponent) player?: YoutubePlayerModalComponent;

  readonly modalAberto = signal(false);
  readonly editorAberto = signal(false);
  readonly busca = signal('');
  readonly modoSelecaoPlaylists = signal(false);
  readonly playlistsSelecionadas = signal<Set<string>>(new Set());
  readonly confirmarExclusaoLote = signal(false);
  readonly enviando = signal(false);
  readonly emEdicao = signal<Playlist | null>(null);
  readonly rascunho = signal({ ...FORM_PLAYLIST });
  readonly playlistEditando = signal<Playlist | null>(null);
  readonly itemArrastando = signal<ItemPlaylist | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly erroExclusao = signal<string | null>(null);
  readonly playlistExcluir = signal<Playlist | null>(null);
  /** Alerta com o campo para colar o link do YouTube. */
  readonly importarAberto = signal(false);
  /** Lista de vídeos de uma playlist importada do YouTube. */
  readonly videosAberto = signal(false);
  readonly playlistVideos = signal<Playlist | null>(null);
  readonly editorVideosAberto = signal(false);
  readonly playlistEditandoVideos = signal<Playlist | null>(null);
  /** Campo do alerta de importação (objeto estável: não recriar por ciclo). */
  readonly campoLink = [{ name: 'link', placeholder: 'https://www.youtube.com/playlist?list=...' }];
  /** Botões do alerta de importação (objeto estável). */
  readonly botoesImportacao = [
    { text: 'Cancelar', role: 'cancel' as const },
    {
      text: 'Importar',
      handler: (dados: { link?: string }) => {
        void this.importarLink(dados?.link ?? '');
      },
    },
  ];

  readonly playlists = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    return [...this.store.playlists()]
      .filter((p) => (termo ? p.nome.toLowerCase().includes(termo) : true))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });
  readonly todasPlaylistsSelecionadas = computed(() =>
    this.playlists().length > 0 && this.playlists().every(p => this.playlistsSelecionadas().has(p.id)),
  );

  readonly louvoresDisponiveis = computed(() =>
    this.store.louvores().sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')),
  );

  constructor() {
    addIcons({
      addOutline, trashOutline, createOutline, playCircleOutline,
      saveOutline, closeOutline, listOutline, reorderThreeOutline,
      musicalNotesOutline, cloudDownloadOutline, logoYoutube,
    });
  }

  ngOnInit(): void {
    void this.store.iniciar();
  }

  abrirNova(): void {
    if (!this.podeEditar()) return;
    this.emEdicao.set(null);
    this.rascunho.set({ ...FORM_PLAYLIST });
    this.aviso.set(null);
    this.modalAberto.set(true);
  }

  abrirEdicao(p: Playlist): void {
    // Quem não logou abre a playlist apenas para consultar (sem salvar).
    this.emEdicao.set(p);
    this.rascunho.set({ nome: p.nome, descricao: p.descricao ?? '' });
    this.aviso.set(null);
    this.modalAberto.set(true);
  }

  abrirEditor(p: Playlist): void {
    if (!this.podeEditar()) return;
    this.playlistEditando.set({ ...p, itens: [...(p.itens ?? [])] });
    this.editorAberto.set(true);
  }

  fechar(): void {
    this.modalAberto.set(false);
  }

  fecharEditor(): void {
    this.editorAberto.set(false);
    this.playlistEditando.set(null);
    this.itemArrastando.set(null);
  }

  async salvar(): Promise<void> {
    if (!this.podeEditar()) return;
    const dados = this.rascunho();
    if (!dados.nome.trim()) return;
    const existente = this.emEdicao();
    const item: Playlist = {
      id: existente?.id ?? crypto.randomUUID(),
      nome: dados.nome.trim(),
      itens: existente?.itens ?? [],
      criadoEm: existente?.criadoEm ?? Date.now(),
      atualizadoEm: Date.now(),
      // Só inclui opcionais com valor: o Firestore rejeita `undefined`.
      ...(dados.descricao.trim() ? { descricao: dados.descricao.trim() } : {}),
      // Preserva a origem YouTube (apagar `itensYouTube` perderia os vídeos).
      ...(existente?.origem ? { origem: existente.origem } : {}),
      ...(existente?.linkYouTube ? { linkYouTube: existente.linkYouTube } : {}),
      ...(existente?.itensYouTube ? { itensYouTube: existente.itensYouTube } : {}),
      ...(existente?.data ? { data: existente.data } : {}),
    };
    try {
      await this.store.salvar('playlists', item);
    } catch (err) {
      this.aviso.set(`Falha ao salvar: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.fechar();
  }

  async remover(p: Playlist): Promise<void> {
    this.playlistExcluir.set(p);
  }

  async confirmarExclusao(): Promise<void> {
    if (!this.podeEditar()) return;
    const p = this.playlistExcluir();
    if (!p) return;
    await this.store.remover('playlists', p.id);
    this.alternarSelecaoPlaylist(p.id, false);
    this.playlistExcluir.set(null);
  }

  alternarSelecaoPlaylist(id: string, selecionado: boolean): void {
    const ids = new Set(this.playlistsSelecionadas());
    selecionado ? ids.add(id) : ids.delete(id);
    this.playlistsSelecionadas.set(ids);
  }

  alternarTodasPlaylists(selecionado: boolean): void {
    this.playlistsSelecionadas.set(selecionado ? new Set(this.playlists().map(p => p.id)) : new Set<string>());
  }

  acionarExclusaoPlaylists(): void {
    if (!this.podeEditar()) return;
    if (!this.modoSelecaoPlaylists()) {
      this.modoSelecaoPlaylists.set(true);
      return;
    }
    if (this.playlistsSelecionadas().size) {
      this.confirmarExclusaoLote.set(true);
      return;
    }
    this.modoSelecaoPlaylists.set(false);
  }

  async confirmarExclusaoPlaylists(): Promise<void> {
    if (!this.podeEditar()) return;
    const selecionadas = this.store.playlists().filter(p => this.playlistsSelecionadas().has(p.id));
    try {
      await this.store.removerVarios('playlists', selecionadas.map(playlist => playlist.id));
      this.playlistsSelecionadas.set(new Set());
      this.modoSelecaoPlaylists.set(false);
      this.confirmarExclusaoLote.set(false);
    } catch (err) {
      this.erroExclusao.set(err instanceof Error ? err.message : String(err));
      this.confirmarExclusaoLote.set(false);
    }
  }

  cancelarExclusao(): void {
    this.playlistExcluir.set(null);
  }

  // --- Editor de itens da playlist ---
  get itensEditor() {
    return this.playlistEditando()?.itens ?? [];
  }

  adicionarLouvor(l: Louvor): void {
    const playlist = this.playlistEditando();
    if (!playlist) return;
    const jaExiste = playlist.itens.some((i) => i.louvorId === l.id);
    if (jaExiste) return;
    playlist.itens.push({
      louvorId: l.id,
      posicao: playlist.itens.length,
    });
    this.playlistEditando.set({ ...playlist });
  }

  removerItem(idx: number): void {
    const playlist = this.playlistEditando();
    if (!playlist) return;
    playlist.itens.splice(idx, 1);
    // reindexar posições
    playlist.itens.forEach((item, i) => item.posicao = i);
    this.playlistEditando.set({ ...playlist });
  }

  reordenar(ev: CustomEvent): void {
    const playlist = this.playlistEditando();
    if (!playlist) return;
    const arr = [...playlist.itens];
    const [movido] = arr.splice(ev.detail.from, 1);
    arr.splice(ev.detail.to, 0, movido);
    arr.forEach((item, i) => item.posicao = i);
    playlist.itens = arr;
    this.playlistEditando.set({ ...playlist });
    ev.detail.complete();
  }

  async salvarPlaylist(): Promise<void> {
    if (!this.podeEditar()) return;
    const p = this.playlistEditando();
    if (!p) return;
    try {
      await this.store.atualizar<Playlist>('playlists', p.id, {
        itens: p.itens,
        atualizadoEm: Date.now(),
      });
      this.fecharEditor();
    } catch (err) {
      this.aviso.set(`Falha ao salvar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async tocarItem(item: ItemPlaylist): Promise<void> {
    const louvores = this.store.louvores();
    const l = louvores.find((x) => x.id === item.louvorId);
    // Sem fila: a barra de play existe só para os Kits.
    if (l?.midia) await this.audio.tocar(l, l.midia);
  }

  getLouvorInfo(item: ItemPlaylist): Louvor | undefined {
    return this.store.louvores().find((x) => x.id === item.louvorId);
  }

  estaTocando(item: ItemPlaylist): boolean {
    return this.audio.tocando() && this.audio.atual()?.louvor.id === item.louvorId;
  }

  // --- Importação do YouTube ---

  /** Abre o alerta com o campo para colar o link. */
  abrirImportacao(): void {
    if (!this.podeEditar()) return;
    this.importarAberto.set(true);
  }

  private async importarLink(link: string): Promise<void> {
    const url = link.trim();
    if (!url) return;
    // DeepLinkService monta a playlist, salva no Firestore e deixa a
    // mensagem em `mensagem()` (exibida no banner da página).
    const nova = await this.deepLink.importarLink(url);
    // Importou: já abre a lista de vídeos para tocar direto.
    if (nova && this.videosDe(nova).length) {
      this.playlistVideos.set(nova);
      this.videosAberto.set(true);
    }
  }

  /** Toque na linha da playlist: vídeos do YouTube ou editor de louvores. */
  abrirDetalhe(p: Playlist): void {
    if (p.origem === 'youtube' && this.videosDe(p).length) {
      this.playlistVideos.set(p);
      this.videosAberto.set(true);
      return;
    }
    this.abrirEditor(p);
  }

  abrirEditorConteudo(p: Playlist): void {
    if (!this.podeEditar()) return;
    if (p.origem === 'youtube') {
      this.playlistEditandoVideos.set({ ...p, itensYouTube: [...this.videosDe(p)] });
      this.editorVideosAberto.set(true);
      return;
    }
    this.abrirEditor(p);
  }

  fecharEditorVideos(): void {
    this.editorVideosAberto.set(false);
    this.playlistEditandoVideos.set(null);
  }

  reordenarVideos(ev: CustomEvent): void {
    const playlist = this.playlistEditandoVideos();
    if (!playlist) return;
    const videos = [...this.videosDe(playlist)];
    const [movido] = videos.splice(ev.detail.from, 1);
    videos.splice(ev.detail.to, 0, movido);
    videos.forEach((video, index) => video.posicao = index);
    this.playlistEditandoVideos.set({ ...playlist, itensYouTube: videos });
    ev.detail.complete();
  }

  removerVideoYoutube(indice: number): void {
    const playlist = this.playlistEditandoVideos();
    if (!playlist) return;
    const videos = this.videosDe(playlist).filter((_, i) => i !== indice);
    videos.forEach((video, index) => video.posicao = index);
    this.playlistEditandoVideos.set({ ...playlist, itensYouTube: videos });
  }

  async salvarVideosYoutube(): Promise<void> {
    if (!this.podeEditar()) return;
    const playlist = this.playlistEditandoVideos();
    if (!playlist) return;
    try {
      await this.store.atualizar<Playlist>('playlists', playlist.id, {
        itensYouTube: this.videosDe(playlist),
        atualizadoEm: Date.now(),
      });
      this.fecharEditorVideos();
    } catch (err) {
      this.aviso.set(`Falha ao salvar vídeos: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  fecharVideos(): void {
    this.videosAberto.set(false);
    this.playlistVideos.set(null);
  }

  /** Fecha o banner de resultado da importação. */
  limparMensagem(): void {
    this.deepLink.limparMensagem();
  }

  // --- Reprodução dos vídeos do YouTube ---

  /** Vídeos da playlist importada (vazio para playlists locais). */
  videosDe(p: Playlist): VideoYouTube[] {
    return p.itensYouTube ?? [];
  }

  /** Toca a playlist do YouTube a partir do vídeo `inicio`, no app. */
  tocarYouTube(p: Playlist, inicio = 0): void {
    const videos = this.videosDe(p);
    if (!videos.length) return;
    this.player?.abrir(videos, Math.min(Math.max(0, inicio), videos.length - 1));
  }

  /** Miniatura do vídeo servida pelo YouTube (não gasta cota da API). */
  thumbnail(videoId: string): string {
    return thumbnailYouTube(videoId);
  }

  /** Duração do vídeo no formato 'm:ss'. */
  duracao(segundos?: number): string {
    return formatarDuracao(segundos);
  }
}

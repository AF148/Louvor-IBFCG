import {
  Component,
  OnInit,
  AfterViewInit,
  inject,
  ViewChild,
  ElementRef,
  signal,
} from '@angular/core';
import { Router, NavigationEnd, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import {
  IonApp,
  IonMenu,
  IonMenuButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonMenuToggle,
  IonRouterOutlet,
  IonIcon,
  IonFooter,
  IonToolbar,
  IonButton,
  IonProgressBar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  play,
  pause,
  chevronBackOutline,
  chevronForwardOutline,
  playSkipBackOutline,
  playSkipForwardOutline,
  closeOutline,
  cloudOfflineOutline,
  cloudDoneOutline,
  bookOutline,
  homeOutline,
  calendarOutline,
  listOutline,
  peopleOutline,
  personCircleOutline,
  musicalNotesOutline,
} from 'ionicons/icons';
import { StoreService } from './core/store.service';
import { AudioService, formatarTempo } from './core/audio.service';
import { VersiculoService } from './core/versiculo.service';
import { DeepLinkService } from './core/deep-link.service';
import { AuthService } from './core/auth.service';

interface NavItem {
  rota: string;
  icone: string;
  label: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [
    IonApp,
    IonMenu,
    IonMenuButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonMenuToggle,
    IonRouterOutlet,
    IonIcon,
    IonFooter,
    IonToolbar,
    IonButton,
    IonProgressBar,
    RouterLink,
  ],
})
/** Componente raiz que coordena o menu lateral, abas e player global. */
export class AppComponent implements OnInit, AfterViewInit {
  readonly store = inject(StoreService);
  readonly audio = inject(AudioService);
  readonly versiculo = inject(VersiculoService);
  readonly deepLink = inject(DeepLinkService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('audioEl') audioRef?: ElementRef<HTMLAudioElement>;

  formatarTempo = formatarTempo;

  /** Itens de navegação - fonte única para menu lateral e barra inferior */
  readonly navItems: NavItem[] = [
    { rota: '/home', icone: 'home-outline', label: 'Início' },
    { rota: '/repertorio', icone: 'book-outline', label: 'Repertório' },
    { rota: '/biblia', icone: 'book-outline', label: 'Bíblia' },
    { rota: '/escala', icone: 'calendar-outline', label: 'Escala' },
    { rota: '/playlists', icone: 'list-outline', label: 'Playlists' },
    { rota: '/kits', icone: 'musical-notes-outline', label: 'Kit vocal' },
    { rota: '/participantes', icone: 'people-outline', label: 'Participantes' },
    { rota: '/perfil', icone: 'person-circle-outline', label: 'Perfil' },
  ];

  /** Itens principais que aparecem na barra inferior. */
  readonly bottomNavItems: NavItem[] = [
    { rota: '/home', icone: 'home-outline', label: 'Início' },
    { rota: '/repertorio', icone: 'book-outline', label: 'Repertório' },
    { rota: '/escala', icone: 'calendar-outline', label: 'Escala' },
  ];

  /** Rota ativa atual */
  readonly rotaAtiva = signal<string>('/home');

  constructor() {
    addIcons({
      play,
      pause,
      chevronBackOutline,
      chevronForwardOutline,
      playSkipBackOutline,
      playSkipForwardOutline,
      closeOutline,
      cloudOfflineOutline,
      cloudDoneOutline,
      bookOutline,
      homeOutline,
      calendarOutline,
      listOutline,
      peopleOutline,
      personCircleOutline,
      musicalNotesOutline,
    });

    // Sincroniza rota ativa com o Router
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event) => {
      this.rotaAtiva.set(event.urlAfterRedirects.split('?')[0] || '/home');
    });

    // Define valor inicial
    this.rotaAtiva.set(this.router.url.split('?')[0] || '/home');
  }

  /** Verifica se um item está ativo */
  isAtivo(rota: string): boolean {
    return this.rotaAtiva() === rota;
  }

  async ngOnInit(): Promise<void> {
    this.auth.iniciar();
    await Promise.all([this.store.iniciar(), this.versiculo.carregar()]);
    await this.deepLink.iniciar();
    this.vigiarModaisTravados();
  }

  ngAfterViewInit(): void {
    if (this.audioRef) {
      this.audio.registrar(this.audioRef.nativeElement);
    }
  }

  /**
   * Trava de segurança contra modal "congelado": se a janela/aba perde o
   * foco no meio da abertura de um modal, o navegador pausa as animações e o
   * Ionic nunca termina de abrir (fica uma tela preta sem conteúdo). Quando a
   * página volta a ficar visível, detecta esse estado e recarrega para
   * destravar. (No app de celular isso não costuma ocorrer — a janela do
   * navegador em segundo plano é o caso real.)
   */
  private vigiarModaisTravados(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      window.setTimeout(() => {
        const travado = [...document.querySelectorAll('ion-modal')].some(
          (m) =>
            (m as unknown as { isOpen?: boolean }).isOpen === true &&
            getComputedStyle(m).display === 'none',
        );
        if (travado) window.location.reload();
      }, 1500);
    });
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonGrid, IonRow, IonCol, IonSpinner,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  listOutline, calendarOutline,
  peopleOutline, bookOutline, bookmarkOutline, alertCircleOutline, musicalNotesOutline } from 'ionicons/icons';
import { RouterLink } from '@angular/router';
import { StoreService } from '../core/store.service';
import { VersiculoService } from '../core/versiculo.service';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.page.html',
  styleUrls: ['../shared/pagina.scss', './home.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonSpinner,
    RouterLink,
  ],
})
/** Tela inicial com os atalhos e resumos principais do aplicativo. */
export class HomePage implements OnInit {
  readonly store = inject(StoreService);
  readonly versiculo = inject(VersiculoService);

  readonly cards = signal<{ titulo: string; descricao: string; rota: string; icone: string; cor: string }[]>([
    { titulo: 'Repertório', descricao: 'Louvores, cifras, vídeos e transposição', rota: '/repertorio', icone: 'book-outline', cor: 'primary' },
    { titulo: 'Escala', descricao: 'Organização de cultos e equipes', rota: '/escala', icone: 'calendar-outline', cor: 'success' },
    { titulo: 'Playlists', descricao: 'YouTube e ordem de louvores', rota: '/playlists', icone: 'list-outline', cor: 'warning' },
    { titulo: 'Participantes', descricao: 'Equipe, aniversários e contatos', rota: '/participantes', icone: 'people-outline', cor: 'danger' },
  ]);

  constructor() {
    addIcons({bookmarkOutline,alertCircleOutline,musicalNotesOutline,listOutline,calendarOutline,peopleOutline,bookOutline,});
  }

  ngOnInit(): void {
    void this.store.iniciar();
    void this.versiculo.carregar();
  }
}

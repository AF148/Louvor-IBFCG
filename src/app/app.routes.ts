import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/** Mapa das telas e regras de acesso usadas pelo roteador Angular. */
export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'repertorio',
    loadComponent: () => import('./repertorio/repertorio.page').then((m) => m.RepertorioPage),
  },
  {
    path: 'biblia',
    loadComponent: () => import('./biblia/biblia.page').then((m) => m.BibliaPage),
  },
  {
    path: 'escala',
    loadComponent: () => import('./escala/escala.page').then((m) => m.EscalaPage),
  },
  {
    path: 'playlists',
    loadComponent: () => import('./playlists/playlists.page').then((m) => m.PlaylistsPage),
  },
  {
    // Kit vocal: líder grava, membros ouvem.
    path: 'kits',
    loadComponent: () => import('./kits/kits.page').then((m) => m.KitsPage),
  },
  {
    path: 'participantes',
    loadComponent: () => import('./participantes/participantes.page').then((m) => m.ParticipantesPage),
  },
  {
    // Tela de acesso: entrar com conta existente ou criar uma nova.
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    // Só com conta logada: sem login o guard manda para /login e, depois
    // do acesso, o usuário volta para cá (returnUrl).
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./perfil/perfil.page').then((m) => m.PerfilPage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];

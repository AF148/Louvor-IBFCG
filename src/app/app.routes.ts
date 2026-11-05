import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/**
 * Mapa das telas e regras de acesso usadas pelo roteador Angular.
 *
 * Não há login anônimo: **todas** as telas de trabalho exigem conta
 * (e-mail/senha). Sem sessão o `authGuard` manda para `/login` e guarda o
 * `returnUrl` para a pessoa voltar para onde estava depois do acesso.
 */
export const routes: Routes = [
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'repertorio',
    canActivate: [authGuard],
    loadComponent: () => import('./repertorio/repertorio.page').then((m) => m.RepertorioPage),
  },
  {
    path: 'biblia',
    canActivate: [authGuard],
    loadComponent: () => import('./biblia/biblia.page').then((m) => m.BibliaPage),
  },
  {
    path: 'escala',
    canActivate: [authGuard],
    loadComponent: () => import('./escala/escala.page').then((m) => m.EscalaPage),
  },
  {
    path: 'playlists',
    canActivate: [authGuard],
    loadComponent: () => import('./playlists/playlists.page').then((m) => m.PlaylistsPage),
  },
  {
    // Kit vocal: líder grava, membros ouvem.
    path: 'kits',
    canActivate: [authGuard],
    loadComponent: () => import('./kits/kits.page').then((m) => m.KitsPage),
  },
  {
    // Equipe: qualquer logado vê a lista; só administradores editam.
    path: 'participantes',
    canActivate: [authGuard],
    loadComponent: () => import('./participantes/participantes.page').then((m) => m.ParticipantesPage),
  },
  {
    // Tela de acesso: entrar com conta existente ou criar uma nova.
    // Fica fora do guard — é justamente o destino de quem não tem sessão.
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
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

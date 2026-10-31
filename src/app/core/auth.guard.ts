import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guarda da área de perfil: sem conta cadastrada (ou logada) não passa.
 *
 * Espera a sessão inicial ficar conhecida antes de decidir — sem isso o
 * guard rodaria antes do Firebase restaurar a sessão salva e mandaria até
 * usuário logado para a tela de login toda vez que abrisse o app.
 *
 * O usuário anônimo (que o `initFirebase` cria só para leitura dos dados)
 * não vale como login: só conta e-mail/senha.
 */
/** Protege rotas privadas e devolve a pessoa não autenticada para a tela de login. */
export const authGuard: CanActivateFn = async (estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.aguardarPronto();
  return auth.estaLogado
    ? true
    : router.createUrlTree(['/login'], {
        queryParams: { returnUrl: estado.url },
      });
};

import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guarda de área privada: sem conta cadastrada (ou logada) não passa.
 *
 * Espera a sessão inicial ficar conhecida antes de decidir — sem isso o
 * guard rodaria antes do Firebase restaurar a sessão salva e mandaria até
 * usuário logado para a tela de login toda vez que abrisse o app.
 *
 * Não existe login anônimo: só conta e-mail/senha vale como acesso.
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

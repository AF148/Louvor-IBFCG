import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonInput, IonNote, IonSpinner, IonSegment, IonSegmentButton,
  IonLabel,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline, personCircleOutline, logInOutline, personAddOutline,
} from 'ionicons/icons';
import { AuthService } from '../core/auth.service';
import { isFirebaseConfigured } from '../core/firebase';

/**
 * Tela de acesso: entrar com conta existente ou criar uma nova.
 *
 * É a porta de entrada para o `/perfil`, que é protegido pelo `authGuard`
 * (sem login o guard redireciona para cá). Depois do acesso o usuário
 * volta para a rota de onde veio (`returnUrl`), que por padrão é o perfil.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    FormsModule, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonButton, IonIcon, IonInput, IonNote, IonSpinner,
    IonSegment, IonSegmentButton, IonLabel,
  ],
})
/** Reúne as ações de entrada e criação de conta do usuário. */
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);

  readonly modo = signal<'entrar' | 'criar'>('entrar');
  readonly nome = signal('');
  readonly email = signal('');
  readonly senha = signal('');
  readonly aviso = signal<string | null>(null);
  readonly firebaseConfigurado = isFirebaseConfigured();

  /** Para onde voltar depois do acesso (o guard manda a rota original aqui). */
  private readonly returnUrl: string;

  constructor() {
    addIcons({
      closeOutline, personCircleOutline, logInOutline, personAddOutline,
    });
    this.returnUrl =
      this.rota.snapshot.queryParamMap.get('returnUrl') ?? '/perfil';
    // '?criar=1' chega do link "Criar conta" do perfil.
    this.modo.set(
      this.rota.snapshot.queryParamMap.get('criar') === '1' ? 'criar' : 'entrar',
    );
    // Já tem sessão ativa? Nem mostra o formulário.
    void this.auth.aguardarPronto().then(() => {
      if (this.auth.estaLogado) {
        void this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
      }
    });
  }

  aoTrocarModo(ev: Event): void {
    const valor = (ev as CustomEvent).detail?.value as 'entrar' | 'criar' | undefined;
    if (valor) {
      this.modo.set(valor);
      this.aviso.set(null);
    }
  }

  async enviar(): Promise<void> {
    this.aviso.set(null);
    const email = this.email().trim();
    const senha = this.senha();
    if (!email || !senha) {
      this.aviso.set('Informe e-mail e senha.');
      return;
    }
    try {
      if (this.modo() === 'criar') {
        const nome = this.nome().trim();
        if (!nome) {
          this.aviso.set('Informe seu nome para criar a conta.');
          return;
        }
        await this.auth.cadastrar(nome, email, senha);
      } else {
        await this.auth.entrar(email, senha);
      }
      await this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : 'Não foi possível entrar.');
    }
  }

  fechar(): void {
    void this.router.navigateByUrl('/home', { replaceUrl: true });
  }
}

import { Injectable, OnDestroy, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, firestore, isFirebaseConfigured } from './firebase';
import type { Papel, Usuario } from './models';

/**
 * Autenticação com Firebase Authentication e perfil no Firestore.
 *
 * Usa o SDK puro do Firebase (mesma base do `StoreService`), inicializado
 * de forma preguiçosa em `core/firebase.ts`. A sessão persiste sozinha
 * pelo SDK (localStorage no navegador, IndexedDB no app nativo).
 */
@Injectable({ providedIn: 'root' })
/** Mantém o estado de autenticação e agrupa as ações de login, cadastro e saída. */
export class AuthService implements OnDestroy {
  /** Usuário logado por e-mail/senha. Ignora o usuário anônimo que o
   *  `initFirebase` cria só para liberar a leitura dos dados. */
  readonly usuario = signal<User | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  /** Foto do perfil em data URL, para o avatar global (canto superior). */
  readonly fotoPerfil = signal<string | null>(null);
  /** Perfil (`usuarios/{uid}`) do usuário logado, incluindo o `papel`. */
  readonly perfil = signal<Usuario | null>(null);
  /**
   * Verdadeiro quando o uid logado tem um documento em `admins/{uid}`.
   * Libera a edição da Escala, Participantes e Kits musicais; os itens
   * editáveis por qualquer membro (Repertório, Playlists) usam `estaLogado`.
   */
  readonly ehAdmin = signal(false);
  /**
   * uids de todos os administradores (`admins` é legível por membros).
   * Usado em Participantes para exibir o selo e promover/remover pelo app.
   */
  readonly adminsUids = signal<ReadonlySet<string>>(new Set());
  /**
   * E-mail da conta atual já confirmado (`user.emailVerified`).
   * Usado pela Perfil para exibir o selo "E-mail confirmado" e o botão
   * de reenvio enquanto for falso.
   */
  readonly emailConfirmado = signal(false);

  private iniciado = false;
  private removerEscuta?: () => void;
  private removerEscutaAdmin?: () => void;
  private removerEscutaRoster?: () => void;

  /**
   * Observa a sessão para manter o `usuario` atualizado.
   * Idempotente e seguro sem credenciais configuradas.
   */
  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;
    if (!isFirebaseConfigured()) return;
    this.removerEscuta = onAuthStateChanged(auth(), (user) => {
      const logado = user && !user.isAnonymous ? user : null;
      this.usuario.set(logado);
      this.emailConfirmado.set(logado?.emailVerified ?? false);
      if (logado) {
        void this.carregarFoto(logado.uid);
        this.escutarAdmin(logado.uid);
        this.escutarRosterAdmins();
      } else {
        this.fotoPerfil.set(null);
        this.perfil.set(null);
        this.ehAdmin.set(false);
        this.adminsUids.set(new Set());
        this.removerEscutaAdmin?.();
        this.removerEscutaAdmin = undefined;
        this.removerEscutaRoster?.();
        this.removerEscutaRoster = undefined;
      }
    });
  }

  /**
   * Acompanha `admins/{uid}` para manter o `ehAdmin` atualizado.
   * A escrita nessa coleção é restrita às regras: só quem **já é**
   * administrador promove ou remove (nada de auto-promoção pelo app).
   */
  private escutarAdmin(uid: string): void {
    this.removerEscutaAdmin?.();
    this.removerEscutaAdmin = undefined;
    if (!isFirebaseConfigured()) return;
    this.removerEscutaAdmin = onSnapshot(
      doc(firestore(), 'admins', uid),
      (snap) => this.ehAdmin.set(snap.exists()),
      () => this.ehAdmin.set(false),
    );
  }

  /** Lista geral de administradores (leitura liberada a membros pelas regras). */
  private escutarRosterAdmins(): void {
    this.removerEscutaRoster?.();
    this.removerEscutaRoster = undefined;
    if (!isFirebaseConfigured()) return;
    this.removerEscutaRoster = onSnapshot(
      collection(firestore(), 'admins'),
      (snap) => this.adminsUids.set(new Set(snap.docs.map((d) => d.id))),
      () => this.adminsUids.set(new Set()),
    );
  }

  /**
   * Promove uma conta a administrador gravando `admins/{uid}`.
   * As regras do Firestore só aceitam a escrita de quem já é admin —
   * um eventual erro de permissão vira a mensagem abaixo.
   */
  async promoverAdmin(uid: string): Promise<void> {
    if (!this.ehAdmin()) throw new Error('Somente administradores podem promover.');
    await setDoc(doc(firestore(), 'admins', uid), {
      criadoEm: Date.now(),
      criadoPor: this.usuario()?.uid ?? '',
    });
  }

  /** Remove um administrador; bloqueia deixar a equipe sem nenhum. */
  async removerAdmin(uid: string): Promise<void> {
    if (!this.ehAdmin()) throw new Error('Somente administradores podem remover administradores.');
    if (this.adminsUids().has(uid) && this.adminsUids().size <= 1) {
      throw new Error('Este é o último administrador. Promova outro antes de remover.');
    }
    await deleteDoc(doc(firestore(), 'admins', uid));
  }

  ngOnDestroy(): void {
    this.removerEscuta?.();
    this.removerEscutaAdmin?.();
    this.removerEscutaRoster?.();
  }

  /**
   * Resolve quando a sessão inicial já é conhecida (sessão salva restaurada
   * ou ausência dela). Usado pelo guard de rotas para não redirecionar para
   * /login antes da hora.
   */
  aguardarPronto(): Promise<void> {
    this.iniciar();
    if (!isFirebaseConfigured()) return Promise.resolve();
    return auth().authStateReady().catch(() => undefined);
  }

  /** Verdadeiro quando há um login por e-mail/senha ativo. */
  get estaLogado(): boolean {
    return !!this.usuario();
  }

  /** Nome de exibição do usuário, quando disponível. */
  get nomeExibicao(): string {
    return (
      this.usuario()?.displayName ??
      this.usuario()?.email ??
      'Usuário'
    );
  }

  /** Entra com e-mail e senha já cadastrados. */
  async entrar(email: string, senha: string): Promise<User> {
    this.erro.set(null);
    this.carregando.set(true);
    try {
      const credencial = await signInWithEmailAndPassword(auth(), email, senha);
      const user = credencial.user;
      this.usuario.set(user);
      this.emailConfirmado.set(user.emailVerified);
      // Não reenvia o e-mail de verificação no login: um envio a cada
      // tentativa faz o Gmail tratar a mensagem como spam. O reenvio
      // fica no cadastro e no botão da tela de Perfil.
      return user;
    } catch (err) {
      throw this.tratarErro(err);
    } finally {
      this.carregando.set(false);
    }
  }

  /**
   * Cria uma conta nova, define o nome de exibição e grava o
   * perfil do usuário no Firestore (`usuarios/{uid}`).
   */
  async cadastrar(
    nome: string,
    email: string,
    senha: string,
    papel?: Papel,
  ): Promise<Usuario> {
    this.erro.set(null);
    this.carregando.set(true);
    try {
      const credencial = await createUserWithEmailAndPassword(
        auth(),
        email,
        senha,
      );
      const user = credencial.user;
      await updateProfile(user, { displayName: nome.trim() });
      // Um único e-mail de confirmação no cadastro. Falha de envio não
      // impede criar a conta; o reenvio fica no Perfil.
      void this.reenviarConfirmacao();

      const agora = Date.now();
      const perfil: Usuario = {
        uid: user.uid,
        nome: nome.trim(),
        email: user.email ?? email,
        papel,
        criadoEm: agora,
        atualizadoEm: agora,
      };
      await this.salvarPerfil(perfil);
      this.usuario.set(user);
      this.emailConfirmado.set(user.emailVerified);
      return perfil;
    } catch (err) {
      throw this.tratarErro(err);
    } finally {
      this.carregando.set(false);
    }
  }

  /** Grava (ou atualiza) o perfil no Firestore usando o uid como id. */
  async salvarPerfil(perfil: Usuario): Promise<void> {
    await setDoc(doc(firestore(), 'usuarios', perfil.uid), perfil, {
      merge: true,
    });
  }

  /** Carrega os dados complementares do perfil da conta atual. */
  async buscarPerfil(uid: string): Promise<Usuario | null> {
    const snap = await getDoc(doc(firestore(), 'usuarios', uid));
    return snap.exists() ? (snap.data() as Usuario) : null;
  }

  /** Sincroniza o avatar global com a foto gravada no perfil. */
  private async carregarFoto(uid: string): Promise<void> {
    try {
      const perfil = await this.buscarPerfil(uid);
      this.perfil.set(perfil);
      this.fotoPerfil.set(perfil?.fotoUrl ?? null);
    } catch {
      // Sem rede ou sem regra de leitura: mantém o ícone padrão.
    }
  }

  /** Atualiza nome público e os campos de apresentação do perfil. */
  async atualizarPerfil(
    dados: Pick<Usuario, 'nome' | 'sobreMim' | 'habilidades'> &
      Partial<Pick<Usuario, 'fotoUrl' | 'bannerUrl' | 'bannerGradiente' | 'papel'>>,
  ): Promise<void> {
    const user = this.usuario();
    if (!user) throw new Error('Entre na sua conta para editar o perfil.');
    const nome = dados.nome.trim();
    if (!nome) throw new Error('Informe seu nome.');
    await updateProfile(user, { displayName: nome });
    const agora = Date.now();
    const existente = await this.buscarPerfil(user.uid);
    await this.salvarPerfil({
      uid: user.uid,
      nome,
      email: user.email ?? '',
      sobreMim: dados.sobreMim?.trim() ?? '',
      habilidades: dados.habilidades,
      papel: dados.papel ?? existente?.papel,
      // `?? null` porque o Firestore grava `null` como "limpar o campo";
      // `undefined` seria simplesmente descartado pelo merge.
      fotoUrl: dados.fotoUrl ?? null,
      bannerUrl: dados.bannerUrl ?? null,
      bannerGradiente: dados.bannerGradiente ?? null,
      criadoEm: existente?.criadoEm ?? agora,
      atualizadoEm: agora,
    } as Usuario);
    // Avatar global (canto superior) reflete a troca na hora.
    this.fotoPerfil.set(dados.fotoUrl ?? null);
    this.perfil.update((atual) =>
      atual
        ? {
            ...atual,
            papel: dados.papel ?? atual.papel,
            // `null` do Firestore vira `undefined` (campo ausente no tipo).
            fotoUrl: dados.fotoUrl ?? undefined,
          }
        : atual,
    );
  }

  /** Encerra a sessão atual. */
  async sair(): Promise<void> {
    this.erro.set(null);
    this.fotoPerfil.set(null);
    await signOut(auth());
  }

  /**
   * Envia (ou reenvia) o e-mail de verificação da conta atual para a
   * caixa de entrada. Usado no cadastro, no login com conta não confirmada
   * e pelo botão da tela de Perfil.
   */
  async reenviarConfirmacao(): Promise<void> {
    const user = this.usuario() ?? auth().currentUser;
    if (!user || user.isAnonymous) return;
    await sendEmailVerification(user);
  }

  /**
   * Recarrega a conta no servidor para refletir a confirmação feita pelo
   * link do e-mail e atualiza o sinal `emailConfirmado`.
   */
  async atualizarConfirmacao(): Promise<void> {
    const user = this.usuario() ?? auth().currentUser;
    if (!user || user.isAnonymous) return;
    await user.reload();
    const atual = auth().currentUser;
    if (atual) {
      this.usuario.set(atual);
      this.emailConfirmado.set(atual.emailVerified);
    }
  }

  /** Traduz os códigos de erro do Firebase para mensagens legíveis. */
  private tratarErro(err: unknown): Error {
    const codigo = (err as { code?: string })?.code ?? '';
    const mensagem = MENSAGENS[codigo];
    return new Error(mensagem ?? 'Não foi possível concluir. Tente novamente.');
  }
}

const MENSAGENS: Record<string, string> = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-disabled': 'Este usuário está desativado.',
  'auth/email-already-in-use': 'Este e-mail já está em uso.',
  'auth/weak-password': 'Senha fraca. Use pelo menos 6 caracteres.',
  'auth/operation-not-allowed': 'Login por e-mail/senha não habilitado.',
  'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.',
  'auth/too-many-requests':
    'Muitas tentativas. Tente novamente mais tarde.',
};

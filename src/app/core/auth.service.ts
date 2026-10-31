import { Injectable, OnDestroy, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
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

  private iniciado = false;
  private removerEscuta?: () => void;
  private removerEscutaAdmin?: () => void;

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
      if (logado) {
        void this.carregarFoto(logado.uid);
        this.escutarAdmin(logado.uid);
      } else {
        this.fotoPerfil.set(null);
        this.perfil.set(null);
        this.ehAdmin.set(false);
        this.removerEscutaAdmin?.();
        this.removerEscutaAdmin = undefined;
      }
    });
  }

  /**
   * Acompanha `admins/{uid}` para manter o `ehAdmin` atualizado.
   * Escrita nessa coleção é bloqueada nas regras: só o Console do Firebase
   * promove ou remove administradores.
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

  ngOnDestroy(): void {
    this.removerEscuta?.();
    this.removerEscutaAdmin?.();
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
      this.usuario.set(credencial.user);
      return credencial.user;
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

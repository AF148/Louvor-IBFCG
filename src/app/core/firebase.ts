import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  indexedDBLocalPersistence,
  setPersistence,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';

let appRef: FirebaseApp | null = null;
let authRef: Auth | null = null;   
let firestoreRef: Firestore | null = null;
let readyPromise: Promise<void> | null = null;
let authErrorRef: Error | null = null;

/** Traz a config do Firebase das variáveis de ambiente para quem chama. */
/** Centraliza a leitura e a inicialização sob demanda dos serviços Firebase. */
export function firebaseConfig() {
  return environment.firebase;
}

/**
 * Último erro do login anônimo, quando houve. A UI usa isso para mostrar
 * um aviso claro em vez de uma lista silenciosamente vazia.
 */
export function authError(): Error | null {
  return authErrorRef;
}

/**
 * Indica se as credenciais reais já foram preenchidas em
 * `src/environments/environment.ts`. Nunca quebra, mesmo com o
 * objeto `firebase` ausente.
 */
export function isFirebaseConfigured(): boolean {
  const c = environment.firebase as
    | { apiKey?: string; projectId?: string }
    | undefined;
  if (!c) return false;
  return (
    !!c.apiKey &&
    !c.apiKey.startsWith('COLE_') &&
    !!c.projectId &&
    !c.projectId.startsWith('SEU_')
  );
}

export function firebaseApp(): FirebaseApp {
  if (!appRef) {
    if (!isFirebaseConfigured()) {
      throw new Error(
        '[firebase] Credenciais não configuradas. Preencha src/environments/environment.ts.',
      );
    }
    appRef = initializeApp(firebaseConfig());
  }
  return appRef;
}

export function firestore(): Firestore {
  if (!firestoreRef) {
    // Cache persistente mantém os dados disponíveis quando o sinal cai,
    // importante para uso em culto.
    // `ignoreUndefinedProperties`: sem isso, gravar um campo opcional vazio
    // (ex.: `playlistId: undefined`) lança "Unsupported field value: undefined"
    // e a escrita falha em silêncio.
    firestoreRef = initializeFirestore(firebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  }
  return firestoreRef;
}

export function auth(): Auth {
  if (!authRef) {
    authRef = getAuth(firebaseApp());
  }
  return authRef;
}

export function currentUser(): User | null {
  return authRef?.currentUser ?? null;
}

/**
 * Inicializa Firebase com login anônimo e persistência local.
 * Idempotente: chamadas repetidas devolvem a mesma promessa.
 *
 * Importante: só resolve DEPOIS que o estado de autenticação está conhecido
 * (usuário persistido ou login anônimo tentado). Sem isso, quem registra os
 * listeners do Firestore o faz sem token, leva `permission-denied`, o
 * listener morre e a tela para de atualizar em tempo real — os dados só
 * "voltam" ao recarregar a página.
 */
export function initFirebase(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!isFirebaseConfigured()) {
        console.warn(
          '[firebase] Credenciais não configuradas. Preencha src/environments/environment.ts.',
        );
        return;
      }
      const a = auth();
      await setPersistence(a, indexedDBLocalPersistence).catch(() => undefined);
      // Espera a primeira resolução do estado de auth (vem do IndexedDB).
      await a.authStateReady().catch(() => undefined);
      if (!a.currentUser) {
        try {
          await signInAnonymously(a);
        } catch (err) {
          authErrorRef = err instanceof Error ? err : new Error(String(err));
          console.warn('[firebase] Falha no login anônimo:', err);
        }
      }
      // Só depois de resolvido o estado inicial, reentra anonimamente se a
      // sessão cair no meio do uso (ex.: botão "sair"), mantendo a leitura
      // compartilhada dos dados da igreja.
      onAuthStateChanged(a, (user) => {
        if (!user && !authErrorRef) {
          void signInAnonymously(a).catch((err) =>
            console.warn('[firebase] Falha no re-login anônimo:', err),
          );
        }
      });
    })();
  }
  return readyPromise;
}

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  indexedDBLocalPersistence,
  setPersistence,
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

/** Traz a config do Firebase das variáveis de ambiente para quem chama. */
/** Centraliza a leitura e a inicialização sob demanda dos serviços Firebase. */
export function firebaseConfig() {
  return environment.firebase;
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
 * Inicializa o Firebase e restaura a sessão salva (se houver).
 * Idempotente: chamadas repetidas devolvem a mesma promessa.
 *
 * Importante: só resolve DEPOIS que o estado de autenticação está conhecido.
 * Sem isso, quem registra os listeners do Firestore o faz antes da hora,
 * leva `permission-denied`, o listener morre e a tela para de atualizar em
 * tempo real — os dados só "voltam" ao recarregar a página.
 *
 * **Não há login anônimo.** Quem não tem conta fica deslogado: o `authGuard`
 * manda para /login e o `StoreService` não abre as escutas até haver sessão.
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
      // Espera a primeira resolução do estado de auth (vem do IndexedDB):
      // há sessão restaurada ou não, e o guard decide a partir daí.
      await a.authStateReady().catch(() => undefined);
    })();
  }
  return readyPromise;
}

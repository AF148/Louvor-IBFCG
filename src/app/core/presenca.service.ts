import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { collection, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  getDatabase,
  onValue,
  onDisconnect,
  ref,
  update,
  type Database,
} from 'firebase/database';
import { auth, firestore, firebaseApp, isFirebaseConfigured } from './firebase';
import { environment } from '../../environments/environment';
import type { Papel, Participante, Usuario } from './models';

/** De quanto em quanto tempo o aparelho renova a presença (heartbeat). */
const HEARTBEAT_MS = 30_000;
/**
 * Sem `visto` há este tempo, a pessoa conta como offline mesmo que o nó
 * ainda exista — protege contra cliente que morreu sem disparar o
 * `onDisconnect` (bateria, rede caindo de vez).
 */
const JANELA_OFFLINE_MS = 90_000;

interface Presenca {
  online: boolean;
  /** Último heartbeat em milissegundos (epoch local de quem enviou). */
  visto: number;
}

/**
 * Duas informações sobre as pessoas da equipe, ambas resolvidas por e-mail:
 *
 * 1. **Posição (papel)**: vem do **Perfil** que a pessoa preenche
 *    (`usuarios/{uid}.papel`). É a fonte da verdade em Participantes e na
 *    Escala; o campo do cadastro em Participantes só serve de reserva para
 *    quem ainda não tem conta.
 * 2. **Presença**: nó `presenca/{uid}` no Realtime Database, escrito com
 *    `onDisconnect` — quem fecha o app ou perde a internet aparece como
 *    offline na hora.
 *
 * Sem `databaseURL` configurado o serviço funciona mesmo assim (posição),
 * apenas sem a bolinha de online/offline.
 */
@Injectable({ providedIn: 'root' })
/** Resolve a posição da equipe pelo Perfil e acompanha quem está online. */
export class PresencaService implements OnDestroy {
  /** E-mail (minúsculo) → perfil. Base para ligar participante e conta. */
  private readonly perfisPorEmail = signal<Map<string, Usuario>>(new Map());
  /** uid → último visto (ms). Nó ausente ou velho = offline. */
  private readonly presencas = signal<Map<string, Presenca>>(new Map());

  /** Quantas pessoas da equipe estão conectadas agora. */
  readonly conectados = computed(
    () => [...this.presencas().values()].filter((p) => this.estaFresca(p)).length,
  );

  /**
   * Contas cadastradas no app (`usuarios/{uid}`), por nome — é de onde sai o
   * menu de sugestões ao digitar o nome em Participantes. Documento sem nome
   * é ignorado (perfil incompleto não deve quebrar a lista).
   */
  readonly perfis = computed(() =>
    [...this.perfisPorEmail().values()]
      .filter((u) => !!(u.nome ?? '').trim())
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  );

  private removers: Array<() => void> = [];
  private iniciado = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  /** Marca a presença como offline ao sair da conta ou fechar o app. */
  private encerrarPresenca?: () => void;

  /**
   * Liga as escutas (perfis no Firestore + presença no Realtime Database).
   * Idempotente: várias páginas podem chamar.
   */
  iniciar(): void {
    if (this.iniciado || !isFirebaseConfigured()) return;
    this.iniciado = true;

    // Perfis de todo mundo: é de onde sai a posição de cada pessoa.
    this.removers.push(
      onSnapshot(
        collection(firestore(), 'usuarios'),
        (snap) => {
          const mapa = new Map<string, Usuario>();
          for (const doc of snap.docs) {
            const dados = { uid: doc.id, ...doc.data() } as Usuario;
            const email = normalizarEmail(dados.email);
            if (email) mapa.set(email, dados);
          }
          this.perfisPorEmail.set(mapa);
        },
        () => this.perfisPorEmail.set(new Map()),
      ),
    );

    // Presença: liga/desliga junto com a sessão.
    this.removers.push(
      onAuthStateChanged(auth(), (user) => {
        this.pararHeartbeat();
        // Saiu da conta: avisa os outros que esta pessoa não está mais no app.
        this.encerrarPresenca?.();
        this.encerrarPresenca = undefined;
        if (!user) {
          this.presencas.set(new Map());
          return;
        }
        this.ligarPresenca(user.uid);
      }),
    );
  }

  /**
   * Posição da pessoa: o Papel escolhido no Perfil dela; se ainda não tem
   * conta (ou não escolheu), vale o que estiver cadastrado em Participantes.
   */
  posicaoDe(p: Participante): Papel {
    return this.perfilDe(p)?.papel ?? p.papel;
  }

  /** Verdadeiro se a pessoa estiver conectada agora. */
  estaOnline(p: Participante): boolean {
    const perfil = this.perfilDe(p);
    if (!perfil) return false;
    const estado = this.presencas().get(perfil.uid);
    return !!estado && estado.online && this.estaFresca(estado);
  }

  /**
   * Texto do último acesso: "agora" para quem está online, senão
   * "há 4 min" / "há 2 h". Vazio quando a pessoa nunca entrou no app.
   */
  ultimoAcesso(p: Participante): string {
    const perfil = this.perfilDe(p);
    const estado = perfil ? this.presencas().get(perfil.uid) : undefined;
    if (!estado?.visto) return '';
    if (this.estaOnline(p)) return 'online agora';
    const minutos = Math.round((Date.now() - estado.visto) / 60_000);
    if (minutos < 1) return 'online agora';
    if (minutos < 60) return `visto há ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `visto há ${horas} h`;
    return `visto há ${Math.round(horas / 24)} d`;
  }

  /** Perfil (`usuarios/{uid}`) ligado ao participante, pelo e-mail. */
  private perfilDe(p: Participante): Usuario | undefined {
    const email = normalizarEmail(p.email);
    return email ? this.perfisPorEmail().get(email) : undefined;
  }

  /**
   * Conta do app vinculada a este participante (foto, papel, uid) — usada
   * em Participantes para mostrar a foto de perfil e promover admin.
   */
  perfilDaConta(p: Participante): Usuario | undefined {
    return this.perfilDe(p);
  }

  private estaFresca(estado: Presenca): boolean {
    return Date.now() - estado.visto < JANELA_OFFLINE_MS;
  }

  /** Grava a presença e mantém o heartbeat enquanto a sessão durar. */
  private ligarPresenca(uid: string): void {
    const url = environment.firebase.databaseURL?.trim();
    // Realtime Database ainda não criado no Console: a posição continua
    // funcionando, só falta a bolinha de online/offline.
    if (!url) return;

    let db: Database;
    try {
      db = getDatabase(firebaseApp(), url);
    } catch (erro) {
      console.warn('[presenca] Realtime Database indisponível:', erro);
      return;
    }

    const meu = ref(db, `presenca/${uid}`);
    // Sem isso, quem perde a internet ou fecha o app fica "online" para sempre.
    void onDisconnect(meu)
      .update({ online: false })
      .catch(() => undefined);
    void update(meu, { online: true, visto: Date.now() }).catch((erro) =>
      console.warn('[presenca] Falha ao gravar presença:', erro),
    );

    this.heartbeat = setInterval(() => {
      void update(meu, { online: true, visto: Date.now() }).catch(() => undefined);
    }, HEARTBEAT_MS);

    this.removers.push(
      onValue(
        ref(db, 'presenca'),
        (snap) => {
          const mapa = new Map<string, Presenca>();
          snap.forEach((filho) => {
            const valor = filho.val() as Partial<Presenca> | null;
            if (valor && typeof valor.visto === 'number') {
              mapa.set(filho.key ?? '', {
                online: !!valor.online,
                visto: valor.visto,
              });
            }
          });
          this.presencas.set(mapa);
        },
        () => this.presencas.set(new Map()),
      ),
    );

    this.encerrarPresenca = () => {
      void update(meu, { online: false }).catch(() => undefined);
    };
  }

  private pararHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
  }

  ngOnDestroy(): void {
    this.pararHeartbeat();
    this.encerrarPresenca?.();
    this.encerrarPresenca = undefined;
    for (const remover of this.removers) {
      try {
        remover();
      } catch {
        // Escuta já desligada; nada a fazer.
      }
    }
    this.removers = [];
    this.iniciado = false;
  }
}

/** E-mail em minúsculo e sem espaço: é a chave da ligação participante↔perfil. */
function normalizarEmail(email?: string): string {
  return (email ?? '').trim().toLowerCase();
}

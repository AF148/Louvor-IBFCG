import { Injectable, effect, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AuthService } from './auth.service';
import { StoreService } from './store.service';
import type { Culto, Papel, Participante } from './models';

/** O lembrete dispara 2 dias antes da data do culto... */
const DIAS_ANTES = 2;
/** ...às 9:00 da manhã (hora local do aparelho). */
const HORA_LEMBRETE = 9;
const MINUTO_LEMBRETE = 0;

/** Marca nas notificações criadas por aqui (para cancelar só as nossas). */
const MARCA = { lembrete: 'escala' };

/** Título exibido na barra de notificações. */
const TITULO = 'Lembrete de escala 🎶';

/**
 * Lembrete de escala por notificação local.
 *
 * O plano gratuito do Firebase não tem Cloud Functions, então o próprio
 * aparelho agenda — com o `@capacitor/local-notifications` — um aviso
 * 2 dias antes, às 9:00, para cada culto em que a pessoa está escalada.
 * Funciona com o app fechado (o Android dispara o alarme sozinho).
 *
 * Consequência prática: o aparelho precisa abrir o app pelo menos uma vez
 * depois que a escala for publicada. Cada abertura recalcula os avisos, então
 * mudanças na escala entram na próxima vez que alguém abrir o app.
 */
@Injectable({ providedIn: 'root' })
/** Agenda e cancela os lembretes de escala do usuário logado. */
export class LembreteEscalaService {
  private readonly store = inject(StoreService);
  private readonly auth = inject(AuthService);

  /** Fila única: cancelar e reagendar sem duas execuções sobrepostas. */
  private fila: Promise<void> = Promise.resolve();
  /** Só pede permissão uma vez por sessão (evita repetir o diálogo). */
  private pediuPermissao = false;

  constructor() {
    // Recalcula sempre que a escala, o cadastro ou a sessão mudar.
    effect(() => {
      const email = (this.auth.usuario()?.email ?? '').trim().toLowerCase();
      const cultos = this.store.cultos();
      const participantes = this.store.participantes();
      this.fila = this.fila
        .then(() => this.sincronizar(email, cultos, participantes))
        .catch((err) => console.warn('[lembrete] Falha ao agendar:', err));
    });
  }

  private async sincronizar(
    email: string,
    cultos: Culto[],
    participantes: Participante[],
  ): Promise<void> {
    if (!Capacitor.isPluginAvailable('LocalNotifications')) return;

    // Sem conta ou sem cadastro vinculado não há quem lembrar.
    const meu = email
      ? participantes.find((p) => (p.email ?? '').trim().toLowerCase() === email)
      : undefined;
    if (!meu) {
      await this.cancelarNossas();
      return;
    }

    const agora = Date.now();
    const lembretes = cultos
      .filter((c) => (c.equipe ?? []).some((e) => e.participanteId === meu.id))
      .map((culto) => ({ culto, quando: dataDoLembrete(culto.data) }))
      .filter((item) => item.quando.getTime() > agora)
      .sort((a, b) => a.quando.getTime() - b.quando.getTime());

    // Nada a lembrar: não pede permissão (evita o diálogo à toa).
    if (!lembretes.length) {
      await this.cancelarNossas();
      return;
    }

    if (!(await this.permissao())) return;

    // Recomeça do zero: cancela os avisos nossos e agenda a lista atual,
    // assim culto removido, data trocada ou pessoa desescalada saem na hora.
    await this.cancelarNossas();
    if (!lembretes.length) return;

    await LocalNotifications.schedule({
      notifications: lembretes.map(({ culto, quando }) => ({
        id: idDe(culto.id),
        title: TITULO,
        body: textoLembrete(culto, funcoesDe(culto, meu.id)),
        schedule: { at: quando },
        extra: MARCA,
      })),
    });
    console.info(`[lembrete] ${lembretes.length} aviso(s) de escala agendado(s).`);
  }

  /** Permissão de notificação (Android 13+/iOS): pede uma vez por sessão. */
  private async permissao(): Promise<boolean> {
    try {
      const atual = await LocalNotifications.checkPermissions();
      if (atual.display === 'granted') return true;
      if (this.pediuPermissao) return false;
      this.pediuPermissao = true;
      const pedido = await LocalNotifications.requestPermissions();
      return pedido.display === 'granted';
    } catch {
      return false;
    }
  }

  /** Cancela só os avisos agendados por este serviço. */
  private async cancelarNossas(): Promise<void> {
    try {
      const pendentes = await LocalNotifications.getPending();
      const nossas = pendentes.notifications.filter(
        (n) => (n.extra as { lembrete?: string } | undefined)?.lembrete === MARCA.lembrete,
      );
      if (nossas.length) {
        await LocalNotifications.cancel({ notifications: nossas });
      }
    } catch (err) {
      console.warn('[lembrete] Falha ao cancelar avisos:', err);
    }
  }
}

/** Data do aviso: `data - 2 dias`, às 09:00 (fuso do aparelho). */
function dataDoLembrete(dataIso: string): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(ano, mes - 1, dia - DIAS_ANTES, HORA_LEMBRETE, MINUTO_LEMBRETE, 0, 0);
}

/** Papéis da pessoa naquele culto (ela pode estar escalada em mais de um). */
function funcoesDe(culto: Culto, participanteId: string): string {
  const papeis = (culto.equipe ?? [])
    .filter((e) => e.participanteId === participanteId)
    .map((e) => labelPapel(e.papel));
  return [...new Set(papeis)].join(', ');
}

/** Texto do aviso, no formato pedido pela equipe. */
function textoLembrete(culto: Culto, funcao: string): string {
  const [ano, mes, dia] = culto.data.split('-').map(Number);
  const quando = new Date(ano, mes - 1, dia);
  const data = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(quando);
  const hora = culto.hora ? ` às ${culto.hora}` : '';
  return (
    'Olá querido Levita.🎶\n' +
    'Lembrando que você está escalado para:\n' +
    `Data: ${data}${hora}\n` +
    `Função: ${funcao}\n` +
    'Esperamos por você. 😉'
  );
}

function labelPapel(papel: Papel): string {
  const labels: Record<Papel, string> = {
    instrumentista: 'Instrumentista',
    cantor: 'Cantor',
    operador: 'Operador',
    som: 'Som',
    ministrante: 'Ministrante',
    outro: 'Outro',
  };
  return labels[papel] ?? papel;
}

/** Id numérico estável por culto (o plugin só aceita ids inteiros). */
function idDe(cultoId: string): number {
  let hash = 0;
  for (let i = 0; i < cultoId.length; i++) {
    hash = (hash * 31 + cultoId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

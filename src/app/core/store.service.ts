import {
  Injectable,
  OnDestroy,
  inject,
  signal,
  computed,
  type Signal,
} from '@angular/core';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { firestore, initFirebase } from './firebase';
import { MidiaService } from './midia.service';
import type { Culto, KitMusical, Louvor, MensagemVoz, Participante, PlanilhaEscala, Playlist } from './models';

/**
 * Texto claro quando o login anônimo falha: sem ele as regras do Firestore
 * negam leitura e escrita, e a tela fica vazia sem explicação.
 */
function mensagemLogin(erro: Error): string {
  return (
    `Login anônimo falhou (${erro.message}). ` +
    'No console do Firebase, em Authentication → Sign-in method, ative "Anônimo" ' +
    'e, em Authentication → Settings → User actions, marque "Enable create (sign-up)".'
  );
}

/**
 * Acesso genérico ao Firestore com estado reativo por sinal.
 *
 * Cada coleção é exposta como um `Signal` para o template e como método
 * `consultar` para consultas filtradas. Os dados são carregados em tempo real
 * via `onSnapshot`, então escritas de qualquer aparelho aparecem sozinhas.
 */
@Injectable({ providedIn: 'root' })
/** Acesso tipado aos dados da aplicação e coordenação das inscrições em tempo real. */
export class StoreService implements OnDestroy {
  private participantesSig = signal<Participante[]>([]);
  private louvoresSig = signal<Louvor[]>([]);
  private playlistsSig = signal<Playlist[]>([]);
  private cultosSig = signal<Culto[]>([]);
  private planilhasSig = signal<PlanilhaEscala[]>([]);
  private mensagensSig = signal<MensagemVoz[]>([]);
  private kitsSig = signal<KitMusical[]>([]);

  readonly participantes: Signal<Participante[]> = this.participantesSig.asReadonly();
  readonly louvores: Signal<Louvor[]> = this.louvoresSig.asReadonly();
  readonly playlists: Signal<Playlist[]> = this.playlistsSig.asReadonly();
  readonly cultos: Signal<Culto[]> = this.cultosSig.asReadonly();
  readonly planilhas: Signal<PlanilhaEscala[]> = this.planilhasSig.asReadonly();
  readonly mensagens: Signal<MensagemVoz[]> = this.mensagensSig.asReadonly();
  readonly kits: Signal<KitMusical[]> = this.kitsSig.asReadonly();

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  private subscricoes: Array<() => void> = [];
  private iniciado = false;

  /** Coleções observadas em tempo real e o campo usado na ordenação. */
  private readonly mapa: Array<{
    nome: string;
    campo: string;
    alvo: (docs: DocumentData[]) => void;
  }> = [
    { nome: 'participantes', campo: 'nome', alvo: (d) => this.participantesSig.set(d as Participante[]) },
    { nome: 'louvores', campo: 'titulo', alvo: (d) => this.louvoresSig.set(d as Louvor[]) },
    { nome: 'playlists', campo: 'nome', alvo: (d) => this.playlistsSig.set(d as Playlist[]) },
    { nome: 'cultos', campo: 'data', alvo: (d) => this.cultosSig.set(d as Culto[]) },
    { nome: 'planilhas', campo: 'atualizadoEm', alvo: (d) => this.planilhasSig.set(d as PlanilhaEscala[]) },
    { nome: 'mensagens', campo: 'criadoEm', alvo: (d) => this.mensagensSig.set(d as MensagemVoz[]) },
    { nome: 'kits', campo: 'criadoEm', alvo: (d) => this.kitsSig.set(d as KitMusical[]) },
  ];

  /** Liga as escutas em tempo real. Idempotente. */
  async iniciar(): Promise<void> {
    if (this.iniciado) return;
    this.iniciado = true;
    this.carregando.set(true);
    await initFirebase();

    // Sem credenciais configuradas, o app segue funcionando com listas vazias
    // em vez de quebrar a tela.
    const { isFirebaseConfigured, authError } = await import('./firebase');
    if (!isFirebaseConfigured()) {
      this.carregando.set(false);
      this.erro.set(
        'Firebase não configurado. Preencha src/environments/environment.ts para habilitar a sincronização.',
      );
      return;
    }

    // Login anônimo falhou = regras do Firestore vão negar tudo. Avisar em
    // vez de deixar a lista vazia em silêncio.
    const falhaLogin = authError();
    if (falhaLogin) {
      this.erro.set(mensagemLogin(falhaLogin));
    }

    try {
      for (const { nome, campo, alvo } of this.mapa) {
        const q = query(collection(firestore(), nome), orderBy(campo, 'asc'));
        const unsub = onSnapshot(
          q,
          (snap) =>
            alvo(
              snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DocumentData),
            ),
          (err: Error) => {
            // Com login falho, o motivo real já está no aviso de auth — não
            // sobrescrever com o genérico "Missing or insufficient permissions".
            if (!authError()) {
              this.erro.set(`Falha ao ler "${nome}": ${err.message}`);
            }
          },
        );
        this.subscricoes.push(unsub);
      }
      this.carregando.set(false);
    } catch (err) {
      this.carregando.set(false);
      this.erro.set(err instanceof Error ? err.message : String(err));
    }
  }

  ngOnDestroy(): void {
    for (const unsub of this.subscricoes) unsub();
    this.subscricoes = [];
    this.iniciado = false;
  }

  /** Consulta única com filtros extras. Útil para histórico de cultos. */
  async consultar<T>(colecao: string, ...restricoes: QueryConstraint[]): Promise<T[]> {
    await initFirebase();
    const q = query(collection(firestore(), colecao), ...restricoes);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  }

  async buscar<T>(colecao: string, id: string): Promise<T | null> {
    await initFirebase();
    const snap = await getDoc(doc(firestore(), colecao, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
  }

  async salvar<T extends { id: string }>(colecao: string, item: T): Promise<void> {
    await initFirebase();
    const { id, ...dados } = item;
    await setDoc(doc(firestore(), colecao, id), dados, { merge: true });
  }

  async atualizar<T extends object>(colecao: string, id: string, dados: Partial<T>): Promise<void> {
    await initFirebase();
    await updateDoc(doc(firestore(), colecao, id), dados as Record<string, unknown>);
  }

  async remover(colecao: string, id: string): Promise<void> {
    await initFirebase();
    await deleteDoc(doc(firestore(), colecao, id));
  }

  /** Exclui vários registros numa única operação atômica do Firestore. */
  async removerVarios(colecao: string, ids: string[]): Promise<void> {
    await initFirebase();
    const unicos = [...new Set(ids)].filter(Boolean);
    if (!unicos.length) return;

    // Firestore aceita no máximo 500 alterações em cada lote.
    for (let inicio = 0; inicio < unicos.length; inicio += 500) {
      const lote = writeBatch(firestore());
      for (const id of unicos.slice(inicio, inicio + 500)) {
        lote.delete(doc(firestore(), colecao, id));
      }
      await lote.commit();
    }
  }

  /**
   * Apaga campos específicos de um documento sem mexer no resto
   * (ex.: remover só a cifra de um louvor, mantendo letra e áudio).
   */
  async removerCampos(
    colecao: string,
    id: string,
    campos: string[],
  ): Promise<void> {
    await initFirebase();
    const dados = Object.fromEntries(campos.map((c) => [c, deleteField()]));
    await updateDoc(doc(firestore(), colecao, id), dados as Record<string, unknown>);
  }

  /** Cultos de uma data específica, 'AAAA-MM-DD'. */
  cultosDoDia(data: string): Culto[] {
    return this.cultosSig().filter((c) => c.data === data);
  }

  /** Próximo culto com base na data/hora local. */
  proximoCulto(): Culto | undefined {
    const agora = new Date();
    const hoje = agora.toISOString().slice(0, 10);
    const horaAgora = agora.toTimeString().slice(0, 5);
    return [...this.cultosSig()]
      .filter((c) => c.data > hoje || (c.data === hoje && c.hora >= horaAgora))
      .sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))[0];
  }

  /** Áudio/vídeo guardado em partes no Firestore (sem Firebase Storage). */
  private readonly midia = inject(MidiaService);

  /**
   * Envia arquivo para o Firestore (dividido em pedaços < 1 MB) e devolve
   * o atalho `fs://...` a ser gravado no documento do kit ou do louvor.
   */
  async enviarArquivo(caminho: string, arquivo: File): Promise<string> {
    return this.midia.enviar(caminho, arquivo);
  }

  /** Remove o arquivo em partes (ignora URLs que não sejam `fs://`). */
  async removerArquivo(url: string): Promise<void> {
    if (!url) return;
    await this.midia.remover(url);
  }

  /** Consulta cultos dentro de uma janela de datas. */
  async cultosNoPeriodo(inicio: string, fim: string): Promise<Culto[]> {
    return this.consultar<Culto>('cultos', where('data', '>=', inicio), where('data', '<=', fim));
  }
}

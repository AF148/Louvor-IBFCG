import { Injectable } from '@angular/core';
import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { firestore, initFirebase } from './firebase';

/**
 * Áudios e vídeos guardados em PARTES no Firestore, sem Firebase Storage.
 *
 * Por que: o plano gratuito não tem Storage disponível neste projeto (o bucket
 * nem existe), então o arquivo é dividido em pedaços de no máximo ~700 KB —
 * bem abaixo do limite de 1 MB por documento — e cada pedaço vira um doc na
 * subcoleção `partes`. O documento `arquivos/{id}` guarda os metadados
 * (tipo MIME, tamanho, nº de partes).
 *
 * O `id` do documento é o caminho original com `/` trocado por `|`
 * (`kits/kit1/a.wav` → `kits|kit1|a.wav`). As regras do Firestore usam esse
 * prefixo para liberar escrita só de administrador em `kits|` e de
 * administrador/membro em `louvores|`.
 *
 * Para tocar, os pedaços são remontados num Blob e convertidos num
 * object URL (`blob:`), que os elementos `<audio>`/`<video>` entendem.
 * A URL devolvida por `enviar` é um atalho `fs://{id}` guardado no documento
 * do kit/louvor; `resolver` traduz esse atalho na hora de tocar.
 */
@Injectable({ providedIn: 'root' })
/** Grava, remove e reconstrói arquivos de mídia divididos em documentos do Firestore. */
export class MidiaService {
  /** Prefixo dos atalhos de mídia guardados no Firestore. */
  static readonly PREFIXO = 'fs://';

  /** Bytes binários por pedaço: 700 KB ficam seguros abaixo do limite de 1 MB. */
  private static readonly TAMANHO_PARTE = 700 * 1024;

  /** atalho fs:// → object URL já montado (evita baixar o arquivo de novo). */
  private readonly cache = new Map<string, string>();
  /** atalho fs:// → promessa em andamento (evita baixar duas vezes junto). */
  private readonly carregando = new Map<string, Promise<string>>();

  /**
   * Divide o arquivo em pedaços, grava cada um no Firestore e devolve o
   * atalho `fs://{id}` para guardar no documento do kit ou do louvor.
   */
  async enviar(caminho: string, arquivo: File): Promise<string> {
    await initFirebase();
    const id = caminho.replace(/\//g, '|');
    const tipo = arquivo.type || 'audio/mpeg';
    const buffer = await arquivo.arrayBuffer();
    const total = Math.max(1, Math.ceil(buffer.byteLength / MidiaService.TAMANHO_PARTE));

    // Metadados primeiro: é por eles que o player sabe o MIME e o nº de partes.
    await setDoc(doc(firestore(), 'arquivos', id), {
      caminho,
      tipo,
      tamanho: arquivo.size,
      partes: total,
      criadoEm: Date.now(),
    });

    // Sequencial de propósito: gravação em fila é mais gentil com a
    // cota diária de escritas do plano gratuito.
    for (let i = 0; i < total; i++) {
      const fatia = buffer.slice(
        i * MidiaService.TAMANHO_PARTE,
        (i + 1) * MidiaService.TAMANHO_PARTE,
      );
      await setDoc(
        doc(firestore(), 'arquivos', id, 'partes', String(i).padStart(5, '0')),
        { ordem: i, dados: Bytes.fromUint8Array(new Uint8Array(fatia)) },
      );
    }
    return MidiaService.PREFIXO + id;
  }

  /** Apaga metadados e pedaços de um atalho `fs://` (no-op para URLs comuns). */
  async remover(url: string): Promise<void> {
    if (!url || !url.startsWith(MidiaService.PREFIXO)) return;
    const id = url.slice(MidiaService.PREFIXO.length);
    await initFirebase();
    try {
      const partes = await getDocs(collection(firestore(), 'arquivos', id, 'partes'));
      for (const p of partes.docs) await deleteDoc(p.ref);
      await deleteDoc(doc(firestore(), 'arquivos', id));
    } catch {
      // Pode já ter sido removido (ex.: exclusão em lote repetida).
    }
    const jaCacheada = this.cache.get(url);
    if (jaCacheada) {
      URL.revokeObjectURL(jaCacheada);
      this.cache.delete(url);
    }
  }

  /**
   * Devolve uma URL reproduzível: `https://` passa direto; atalho `fs://`
   * é baixado do Firestore, remontado em Blob e cacheado como `blob:`.
   */
  async resolver(url: string): Promise<string> {
    if (!url || !url.startsWith(MidiaService.PREFIXO)) return url;
    const cacheada = this.cache.get(url);
    if (cacheada) return cacheada;
    const pendente = this.carregando.get(url);
    if (pendente) return pendente;
    const promessa = this.montar(url)
      .catch((err) => {
        throw err instanceof Error ? err : new Error('Falha ao carregar o áudio.');
      })
      .finally(() => this.carregando.delete(url));
    this.carregando.set(url, promessa);
    return promessa;
  }

  /** Baixa os pedaços, gruda num Blob e cria o object URL. */
  private async montar(url: string): Promise<string> {
    const id = url.slice(MidiaService.PREFIXO.length);
    await initFirebase();

    const metaRef = doc(firestore(), 'arquivos', id);
    const meta = await getDoc(metaRef);
    if (!meta.exists()) throw new Error('Arquivo de mídia não encontrado no servidor.');
    const tipo = (meta.data()['tipo'] as string | undefined) ?? 'audio/mpeg';

    const snap = await getDocs(collection(firestore(), 'arquivos', id, 'partes'));
    // Doc ids são numerados com zeros (00000, 00001...): ordenação por id
    // já devolve a ordem certa do arquivo.
    const partes = [...snap.docs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!partes.length) throw new Error('Arquivo de mídia vazio no servidor.');

    const pedacos: BlobPart[] = [];
    for (const p of partes) {
      const bytes = p.data()['dados'] as Bytes | undefined;
      if (bytes) pedacos.push(bytes.toUint8Array() as BlobPart);
    }
    const objectUrl = URL.createObjectURL(new Blob(pedacos, { type: tipo }));
    this.cache.set(url, objectUrl);
    return objectUrl;
  }
}

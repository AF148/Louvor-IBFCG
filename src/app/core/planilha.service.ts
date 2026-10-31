import { Injectable, inject } from '@angular/core';
import type { Culto, Participante } from './models';
import { StoreService } from './store.service';
import {
  interpretarMatriz,
  type PreviasCulto,
  type ResultadoPlanilha,
} from './planilha.util';

/**
 * Importação de escala a partir de planilha Excel (.xlsx/.xls) ou CSV.
 *
 * Toda a lógica de reconhecimento de colunas/linhas está em
 * `planilha.util.ts` (pura, testável fora do app). Este serviço só liga a
 * leitura do arquivo ao store do Firebase.
 *
 * A equipe é casada com os participantes cadastrados sem diferenciar
 * acento/caixa; os nomes que não casarem são listados no resumo da prévia
 * para cadastro manual.
 */

export type { PreviasCulto, ResultadoPlanilha };

@Injectable({ providedIn: 'root' })
/** Importa planilhas de escala, transforma as linhas e salva os cultos no armazenamento. */
export class PlanilhaService {
  private readonly store = inject(StoreService);

  interpretarTabela(cabecalhos: string[], linhas: string[][]): ResultadoPlanilha {
    return interpretarMatriz([cabecalhos, ...linhas], this.store.participantes());
  }

  /**
   * Lê a planilha e devolve os cultos prontos (sem salvar nada).
   * A equipe vem só com os nomes casados; o restante fica em
   * `semParticipante` para o usuário ver antes de importar.
   */
  async ler(arquivo: File): Promise<ResultadoPlanilha> {
    // Importação pesada do SheetJS: carrega só quando o usuário escolhe o
    // arquivo, fora do bundle inicial.
    const XLSX = await import('xlsx');
    const buffer = await arquivo.arrayBuffer();
    const wb = XLSX.read(buffer, { cellDates: false, dense: true });
    const aba = wb.Sheets[wb.SheetNames[0]];
    if (!aba) throw new Error('A planilha não tem nenhuma aba legível.');

    const matriz: unknown[][] = XLSX.utils.sheet_to_json(aba, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    });
    if (!matriz.length) throw new Error('A planilha está vazia.');

    return interpretarMatriz(matriz, this.store.participantes());
  }

  /** Salva os cultos lidos, pulando os que já existem na mesma data/hora. */
  async importar(previas: PreviasCulto[]): Promise<{ salvos: number; pulados: number }> {
    await this.store.iniciar();
    const existentes = new Map<string, Culto>(
      this.store.cultos().map((c) => [`${c.data}|${c.hora}`, c] as const),
    );
    let salvos = 0;
    let pulados = 0;
    for (const { culto } of previas) {
      const chave = `${culto.data}|${culto.hora}`;
      const existente = existentes.get(chave);
      if (existente) {
        culto.id = existente.id;
        pulados++;
        continue;
      }
      await this.store.salvar('cultos', culto);
      existentes.set(chave, culto);
      salvos++;
    }
    return { salvos, pulados };
  }
}

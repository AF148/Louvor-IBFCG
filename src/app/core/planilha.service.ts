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

  /**
   * Grava os cultos lidos na coleção `cultos` — é dela que a aba **Cultos**
   * e o **Calendário** leem, então os dois atualizam sozinhos em tempo real.
   *
   * É uma atualização (upsert): linha que já existe (mesma data/hora) é
   * regravada com as informações novas da planilha, mantendo o id, a rota e
   * os campos que a planilha não traz (ex.: status quando não há coluna).
   */
  async importar(
    previas: PreviasCulto[],
    cabecalhos: string[] = [],
  ): Promise<{ salvos: number; atualizados: number }> {
    await this.store.iniciar();
    const cabecalhosNorm = cabecalhos.map(normalizarCabecalho);
    /** A planilha define esse campo? Sem a coluna, o valor manual é mantido. */
    const temColuna = (padrao: RegExp) => cabecalhosNorm.some((h) => padrao.test(h));

    const existentes = new Map<string, Culto>(
      this.store.cultos().map((c) => [`${c.data}|${c.hora}`, c] as const),
    );
    let salvos = 0;
    let atualizados = 0;
    for (const { culto } of previas) {
      const chave = `${culto.data}|${culto.hora}`;
      const existente = existentes.get(chave);
      if (existente) {
        const item = fundirComPlanilha(existente, culto, temColuna);
        await this.store.salvar('cultos', item);
        // Coluna existe mas a célula ficou vazia: apaga o valor antigo.
        if (temColuna(/local|igreja|templo/) && !item.local) {
          await this.store.removerCampos('cultos', item.id, ['local']);
        }
        if (temColuna(/ausencia|falta/) && !item.observacoes) {
          await this.store.removerCampos('cultos', item.id, ['observacoes']);
        }
        existentes.set(chave, item);
        atualizados++;
        continue;
      }
      await this.store.salvar('cultos', culto);
      existentes.set(chave, culto);
      salvos++;
    }
    return { salvos, atualizados };
  }
}

/** Cabeçalho em minúsculo e sem acento, para reconhecer as colunas. */
function normalizarCabecalho(cabecalho: string): string {
  return cabecalho.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Junta o culto já existente com o lido da planilha: a planilha manda no
 * que ela traz (equipe, título, local, observações...), e o que ela não
 * tem (rota montada na mão, status sem coluna, data de criação) fica.
 */
function fundirComPlanilha(
  existente: Culto,
  novo: Culto,
  temColuna: (padrao: RegExp) => boolean,
): Culto {
  const item: Culto = {
    ...novo,
    id: existente.id,
    criadoEm: existente.criadoEm,
    rota: existente.rota?.length ? existente.rota : novo.rota,
    status: temColuna(/status/) ? novo.status : existente.status,
    titulo:
      temColuna(/titulo|culto|tipo|tema/) && novo.titulo
        ? novo.titulo
        : existente.titulo,
    atualizadoEm: Date.now(),
  };
  if (temColuna(/local|igreja|templo/)) {
    if (novo.local) item.local = novo.local;
  } else if (existente.local) {
    item.local = existente.local;
  }
  if (temColuna(/ausencia|falta/)) {
    if (novo.observacoes) item.observacoes = novo.observacoes;
  } else if (existente.observacoes) {
    item.observacoes = existente.observacoes;
  }
  return item;
}

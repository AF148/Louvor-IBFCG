import { Injectable, inject } from '@angular/core';
import { StoreService } from './store.service';
import type { Aniversario, Participante } from './models';

/** Lista de aniversários e utilidades de data usadas em vários lugares. */
@Injectable({ providedIn: 'root' })
/** Carrega e organiza aniversários para exibir avisos e datas próximas. */
export class AniversarioService {
  private readonly store = inject(StoreService);

  /**
   * Aniversários em ordem de proximidade. `faltamDias` 0 = hoje.
   *
   * O cálculo considera apenas dia e mês porque o ano de nascimento
   * determina a idade, não a proximidade do evento.
   */
  listar(lista: Participante[] = this.store.participantes()): Aniversario[] {
    const hoje = new Date();
    const chaveHoje = this.chaveMesDia(hoje);

    return lista
      .filter((p) => p.ativo && !!p.nascimento)
      .map((p) => {
        const [, mes, dia] = p.nascimento!.split('-').map(Number);
        const chave = `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        return {
          participante: p,
          chave,
          faltamDias: this.diasAte(chave, chaveHoje),
        };
      })
      .sort((a, b) => a.faltamDias - b.faltamDias);
  }

  /** Aniversariantes em até `dias` dias. 0 dias = só hoje. */
  proximos(dias = 30, lista?: Participante[]): Aniversario[] {
    return this.listar(lista).filter((a) => a.faltamDias <= dias);
  }

  /** Aniversariantes de hoje. */
  hoje(lista?: Participante[]): Aniversario[] {
    return this.listar(lista).filter((a) => a.faltamDias === 0);
  }

  /** Idade completada no aniversário mais próximo. */
  idade(p: Participante, referencia = new Date()): number | null {
    if (!p.nascimento) return null;
    const [ano, mes, dia] = p.nascimento.split('-').map(Number);
    const chave = `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const chaveRef = this.chaveMesDia(referencia);
    const jaFezAniversario = chave <= chaveRef;
    // Se o aniversário ainda não chegou no ano de referência, falta um ano.
    return referencia.getFullYear() - ano - (jaFezAniversario ? 0 : 1);
  }

  private chaveMesDia(d: Date): string {
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Dias de calendário entre hoje e a próxima ocorrência do dia/mês.
   * Trata 29/02 em anos não bissextos como 28/02.
   */
  private diasAte(chaveAlvo: string, chaveHoje: string): number {
    const [mesA, diaA] = chaveAlvo.split('-').map(Number);
    const [mesH, diaH] = chaveHoje.split('-').map(Number);
    const ano = new Date().getFullYear();

    let alvo = new Date(ano, mesA - 1, diaA);
    if (alvo.getMonth() !== mesA - 1) {
      alvo = new Date(ano, mesA - 1, 28); // 29/02 em ano não bissexto
    }
    const hoje = new Date(ano, mesH - 1, diaH);

    let diff = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
    if (diff < 0) {
      const proximoAno = ano + 1;
      let alvoProximo = new Date(proximoAno, mesA - 1, diaA);
      if (alvoProximo.getMonth() !== mesA - 1) {
        alvoProximo = new Date(proximoAno, mesA - 1, 28);
      }
      diff = Math.round((alvoProximo.getTime() - hoje.getTime()) / 86_400_000);
    }
    return diff;
  }
}

/** Data de hoje no formato 'AAAA-MM-DD', no fuso local. */
/** Retorna a data local de hoje no padrão ISO sem deslocamento de fuso. */
export function hojeISO(): string {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

import type { Culto, Papel, Participante, StatusCulto } from './models';

/**
 * Lógica pura da importação de escala (sem Angular/Firebase), separada do
 * PlanilhaService para ser testável com Node direto na planilha real.
 *
 * Reconhece colunas pelo NOME (não por posição), então a planilha da igreja
 * funciona mesmo com colunas a mais, reordenadas ou repetidas a cada mês:
 *
 *   DIA SEMANA | DATA | MINISTRAÇÃO | VOCAL 01 | VOCAL 02 | VOCAL 03 |
 *   VIOLÃO | GUITARRA | BAIXO | BATERIA | AUSÊNCIAS
 *
 * Tolerante aos detalhes reais: linhas separadoras de mês ("OUTUBRO"),
 * cabeçalho repetido a cada bloco, datas como serial do Excel, eventos
 * escritos na coluna de ministração ("CARNAVAL (NÃO HAVERÁ CULTO)",
 * "PARTICIPAÇÃO: NEEMIAS") e ausências ("PEDRO/LUCIANA").
 */

/** Funções de apoio para reconhecer cabeçalhos e converter a planilha importada. */
export interface PreviasCulto {
  culto: Culto;
  /** Nomes das células que não casaram com nenhum participante. */
  semParticipante: string[];
}

export interface ResultadoPlanilha {
  linhas: PreviasCulto[];
  /** Colunas e linhas da planilha de origem para exibição fiel na aba Planilha. */
  tabela: { cabecalhos: string[]; linhas: string[][] };
  /** Linhas puladas por não ter data/hora válidas. */
  ignoradas: number;
  /** Cabeçalhos que não soube interpretar (só informativo). */
  colunasIgnoradas: string[];
}

/** Coluna da planilha e como interpretar suas células. */
type Coluna =
  | { tipo: 'data'; idx: number }
  | { tipo: 'diaSemana'; idx: number }
  | { tipo: 'hora'; idx: number }
  | { tipo: 'titulo'; idx: number }
  | { tipo: 'local'; idx: number }
  | { tipo: 'status'; idx: number }
  | { tipo: 'ausencia'; idx: number }
  | { tipo: 'pessoa'; idx: number; papel: Papel };

/**
 * Mesmas variantes de `Coluna`, antes de conhecer o índice da coluna.
 * (Não usar `Omit<Coluna, 'idx'>`: em uniões o Omit colapsa para os campos
 * comuns e engole o `papel`.)
 */
type TipoColuna =
  | { tipo: 'data' }
  | { tipo: 'diaSemana' }
  | { tipo: 'hora' }
  | { tipo: 'titulo' }
  | { tipo: 'local' }
  | { tipo: 'status' }
  | { tipo: 'ausencia' }
  | { tipo: 'pessoa'; papel: Papel };

/** Ordem de teste importa: "Operação de áudio" não pode cair em "instrumento". */
const PAPEL_POR_CABECALHO: { teste: RegExp; papel: Papel }[] = [
  { teste: /ministr/, papel: 'ministrante' },
  { teste: /cantor|vocal|backing/, papel: 'cantor' },
  { teste: /operador|operacao|operacao de audio|transmissao|tecnico|direcao de som/, papel: 'operador' },
  {
    teste:
      /violao|guitar|baix|bater|tecl|piano|flauta|sax|cavaquinho|ukulele|harpa|caix|bongo|percuss|instrument/,
    papel: 'instrumentista',
  },
];

/** Primeira letra maiúscula ("DOMINGO" → "Domingo"). */
/** Ajusta a apresentação de nomes e cabeçalhos recebidos na planilha. */
export function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

/** Normaliza para comparação: sem acentos, caixa baixa, espaços colapsados. */
/** Remove diferenças de acento e caixa para comparar nomes de coluna. */
export function normalizar(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normaliza cabeçalho sem pontuação, para casar palavras-chave. */
/** Limpa o rótulo de uma coluna antes de comparar com os cabeçalhos conhecidos. */
export function normalizarCabecalho(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Linha de cabeçalho repetida a cada bloco de mês (ex.: "DATA", "DIA
 * SEMANA"): não é um culto, é o título das colunas de novo.
 */
/** Identifica se a linha contém nomes de coluna em vez de dados de um culto. */
export function ehLinhaCabecalho(linha: unknown[]): boolean {
  return linha.some((c) => {
    const h = normalizarCabecalho(String(c ?? ''));
    return h === 'data' || h === 'dia semana' || h === 'dia da semana';
  });
}

/**
 * Separador de mês/título ("OUTUBRO", aviso no topo): só uma célula
 * preenchida e sem data — não é um culto.
 */
/** Ignora linhas vazias e separadores gráficos comuns em planilhas exportadas. */
export function ehSeparador(linha: unknown[]): boolean {
  const preenchidas = linha.filter((c) => String(c ?? '').trim() !== '');
  return preenchidas.length <= 1 && paraDataISO(preenchidas[0]) === null;
}

/** Associa um nome de coluna da planilha a um campo interno conhecido. */
export function classificarCabecalho(cabecalho: string): TipoColuna | null {
  const h = normalizarCabecalho(cabecalho);
  if (!h) return null;
  // "DATA" é a data do culto; "DIA SEMANA"/"DIA DA SEMANA" é o nome do dia
  // (DOMINGO, QUARTA…) e não pode ser interpretado como data.
  if (/\bdata\b/.test(h)) return { tipo: 'data' };
  if (/\bdia\b/.test(h) && /\bsemana\b/.test(h)) return { tipo: 'diaSemana' };
  if (/\bdia\b/.test(h)) return { tipo: 'data' };
  if (/ausencia|falta/.test(h)) return { tipo: 'ausencia' };
  if (/\bhora\b|\bhorario\b/.test(h)) return { tipo: 'hora' };
  if (/status/.test(h)) return { tipo: 'status' };
  if (/titulo|culto|evento|participacao/.test(h)) return { tipo: 'titulo' };
  if (/local|igreja|templo/.test(h)) return { tipo: 'local' };
  for (const { teste, papel } of PAPEL_POR_CABECALHO) {
    if (teste.test(h)) return { tipo: 'pessoa', papel };
  }
  return null;
}

/**
 * Converte célula em 'AAAA-MM-DD'. Aceita número serial do Excel,
 * Date e texto nos formatos brasileiros/ISO.
 */
/** Converte datas comuns do Excel para o padrão ISO usado nos registros. */
export function paraDataISO(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const p = parseDateCode(valor);
    return p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : null;
  }
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    // O SheetJS monta datas a partir do serial em UTC; usar as partes UTC
    // evita o deslocamento de um dia em fusos negativos (Brasil).
    return `${valor.getUTCFullYear()}-${String(valor.getUTCMonth() + 1).padStart(2, '0')}-${String(valor.getUTCDate()).padStart(2, '0')}`;
  }
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return montar(m[1], m[2], m[3]);
  m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return montar(ano, m[2], m[1]); // dd/mm/aaaa
  }
  return null;

  function montar(ano: string, mes: string, dia: string): string | null {
    const a = Number(ano), me = Number(mes), d = Number(dia);
    if (me < 1 || me > 12 || d < 1 || d > 31) return null;
    return `${a}-${String(me).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
}

/** Serial do Excel (dias desde 1899-12-30) → partes de data/hora. */
/** Converte o número serial de data usado pelo Excel em partes de calendário. */
export function parseDateCode(serial: number): { y: number; m: number; d: number; H: number; M: number } | null {
  if (serial <= 0) return null;
  const dias = Math.floor(serial);
  const fracao = serial - dias;
  const segundos = Math.round(fracao * 86400);
  const H = Math.floor(segundos / 3600) % 24;
  const M = Math.floor((segundos % 3600) / 60);
  // Algoritmo do serial do Excel (leap year 1900 com o bug do 29/02).
  let ano = 1899, mes = 12, dia = 30 + dias;
  while (true) {
    const diasNoMes = new Date(ano, mes, 0).getDate();
    if (dia <= diasNoMes) break;
    dia -= diasNoMes;
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return { y: ano, m: mes, d: dia, H, M };
}

/** Converte célula em 'HH:MM'. Aceita serial, Date e '19:00'/'19h'/'7:30 PM'. */
/** Lê horários digitados ou serializados pelo Excel e devolve HH:mm. */
export function paraHora(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const p = parseDateCode(valor);
    if (p) return `${String(p.H).padStart(2, '0')}:${String(p.M).padStart(2, '0')}`;
    return null;
  }
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return `${String(valor.getUTCHours()).padStart(2, '0')}:${String(valor.getUTCMinutes()).padStart(2, '0')}`;
  }
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const m = texto.match(/(\d{1,2})[:h](\d{2})|(\d{1,2})\s*(pm|am)?/i);
  if (!m) return null;
  let hora = Number(m[1] ?? m[3]);
  const minuto = Number(m[2] ?? 0);
  const sufixo = (m[4] ?? '').toLowerCase();
  if (sufixo === 'pm' && hora < 12) hora += 12;
  if (sufixo === 'am' && hora === 12) hora = 0;
  if (hora > 23 || minuto > 59) return null;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/** Quebra uma célula de equipe em nomes: "Ana; Bruno, Carol". */
/** Divide células de equipe que agrupam vários nomes em uma única coluna. */
export function separarNomes(valor: unknown): string[] {
  const texto = String(valor ?? '').trim();
  if (!texto || /^[-–—xX/]+$/.test(texto)) return [];
  return texto
    .split(/[,;\n\r]+/)
    .map((n) => n.replace(/\s+/g, ' ').trim())
    .filter((n) => n.length > 1 && !/^(a definir|tbd|n\/?a|-\s*)$/i.test(n));
}

/** Converte os rótulos da planilha nos estados de culto reconhecidos no app. */
export function statusPorTexto(valor: unknown): StatusCulto {
  const h = normalizar(String(valor ?? ''));
  if (/confirm/.test(h)) return 'confirmado';
  if (/realiz|feito|conclu/.test(h)) return 'realizado';
  return 'planejado';
}

/** Acha a linha de cabeçalho e devolve como ler cada coluna. */
/** Detecta a linha de cabeçalho e associa cada coluna ao campo de escala. */
export function mapearColunas(matriz: unknown[][]) {
  // Procura a linha de cabeçalho nas 10 primeiras: a que tiver "Data".
  let linhaCabecalho = -1;
  for (let i = 0; i < Math.min(10, matriz.length); i++) {
    if ((matriz[i] ?? []).some((c) => classificarCabecalho(String(c ?? ''))?.tipo === 'data')) {
      linhaCabecalho = i;
      break;
    }
  }
  if (linhaCabecalho < 0) linhaCabecalho = 0; // sem cabeçalho claro: assume a 1ª linha

  const colunas: Coluna[] = [];
  const ignoradas: string[] = [];
  (matriz[linhaCabecalho] ?? []).forEach((cabecalho, idx) => {
    const texto = String(cabecalho ?? '').trim();
    if (!texto) return;
    const tipo = classificarCabecalho(texto);
    if (tipo) colunas.push({ ...tipo, idx } as Coluna);
    else ignoradas.push(texto);
  });
  return { colunas, linhaCabecalho, ignoradas };
}

/**
 * Interpreta a matriz da planilha (uma aba já convertida) e devolve os
 * cultos prontos, sem salvar nada. Participantes servem para casar os
 * nomes da equipe; os que não casarem ficam em `semParticipante`.
 */
/** Transforma as linhas reconhecidas em cultos e planilhas prontos para salvar. */
export function interpretarMatriz(
  matriz: unknown[][],
  participantes: Participante[],
): ResultadoPlanilha {
  const { colunas, linhaCabecalho, ignoradas: colunasIgnoradas } = mapearColunas(matriz);
  if (!colunas.some((c) => c.tipo === 'data')) {
    throw new Error(
      'Não achei a coluna "Data" no cabeçalho. A planilha precisa de uma linha de títulos com, no mínimo, "Data" e "Hora".',
    );
  }

  const porNome = new Map<string, Participante>();
  for (const p of participantes) {
    const chave = chaveNome(p.nome);
    // Primeiro participante ativo vence em empate de nome.
    if (!porNome.has(chave) || (!porNome.get(chave)!.ativo && p.ativo)) {
      porNome.set(chave, p);
    }
  }

  /**
   * Fallback por primeiro nome: a planilha escreve "PR.ALEXANDRE" e o
   * perfil cadastrou "Alexandre". Só casa quando o primeiro nome é
   * **único** na equipe (dois "Alexandre" viram `null` e ficam para o
   * cadastro manual, evitando atribuir a pessoa errada).
   */
  const porPrimeiroNome = new Map<string, Participante | null>();
  for (const p of participantes) {
    const primeiro = chaveNome(p.nome).split(' ')[0];
    if (!primeiro) continue;
    if (!porPrimeiroNome.has(primeiro)) porPrimeiroNome.set(primeiro, p);
    else porPrimeiroNome.set(primeiro, null); // ambíguo: não casa sozinho.
  }

  const colData = colunas.find((c) => c.tipo === 'data')!;
  const colHora = colunas.find((c) => c.tipo === 'hora');
  const colTitulo = colunas.find((c) => c.tipo === 'titulo');
  const colDiaSemana = colunas.find((c) => c.tipo === 'diaSemana');
  const colLocal = colunas.find((c) => c.tipo === 'local');
  const colStatus = colunas.find((c) => c.tipo === 'status');
  const colAusencia = colunas.find((c) => c.tipo === 'ausencia');
  const cabecalhos = (matriz[linhaCabecalho] ?? []).map((c) => String(c ?? '').trim());
  const colunasComCabecalho = cabecalhos
    .map((cabecalho, idx) => ({ cabecalho, idx }))
    .filter((item) => item.cabecalho);
  const cabecalhosNormalizados = cabecalhos.map(normalizarCabecalho);
  const modeloLouvor = cabecalhosNormalizados.some((h) => /vocal/.test(h))
    && cabecalhosNormalizados.some((h) => /violao/.test(h));
  const colunasTabela = modeloLouvor
    ? ['DIA SEMANA', 'DATA', 'MINISTRAÇÃO', 'VOCAL 01', 'VOCAL 02', 'VOCAL 03', 'VIOLÃO', 'GUITARRA', 'BAIXO', 'BATERIA', 'AUSÊNCIAS']
      .map((cabecalho) => ({
        cabecalho,
        idx: cabecalhosNormalizados.findIndex((h) => h === normalizarCabecalho(cabecalho)),
      }))
    : colunasComCabecalho;

  const linhas: PreviasCulto[] = [];
  const linhasTabela: string[][] = [];
  let ignoradas = 0;
  for (let i = 0; i < matriz.length; i++) {
    const bruto = matriz[i];
    if (!bruto || bruto.every((c) => String(c ?? '').trim() === '')) continue;
    // Linhas de apoio da planilha: separador de mês ("OUTUBRO"), aviso no
    // topo e o cabeçalho repetido a cada bloco. Não são cultos e não
    // devem contar como "ignoradas".
    if (i <= linhaCabecalho || ehLinhaCabecalho(bruto) || ehSeparador(bruto)) continue;

    const celula = (idx: number) => bruto[idx];
    const data = paraDataISO(celula(colData.idx));
    if (!data) { ignoradas++; continue; }
    linhasTabela.push(colunasTabela.map(({ idx, cabecalho }) => {
      if (idx < 0) return '';
      if (classificarCabecalho(cabecalho)?.tipo === 'data') {
        const valorData = paraDataISO(celula(idx));
        return valorData ? valorData.split('-').reverse().join('/') : '';
      }
      return String(celula(idx) ?? '').trim();
    }));

    const hora = (colHora && paraHora(celula(colHora.idx))) || '19:00';

    // Título: texto da coluna de ministração/evento ("PARTICIPAÇÃO:
    // NEEMIAS"), senão o dia da semana ("Culto de Domingo"), senão a data.
    const titulo =
      String(colTitulo ? celula(colTitulo.idx) : '').trim() ||
      (colDiaSemana && String(celula(colDiaSemana.idx)).trim()
        ? `Culto de ${primeiraMaiuscula(String(celula(colDiaSemana.idx)).trim())}`
        : `Culto de ${data.split('-').reverse().join('/')}`);

    const local = String(colLocal ? celula(colLocal.idx) : '').trim();

    const status = colStatus ? statusPorTexto(celula(colStatus.idx)) : 'planejado';

    // Ausências ("PEDRO/LUCIANA") viram observação do culto.
    const ausencias = String(colAusencia ? celula(colAusencia.idx) : '').trim();

    const equipe: Culto['equipe'] = [];
    const semParticipante: string[] = [];
    for (const col of colunas) {
      if (col.tipo !== 'pessoa') continue;
      for (const nome of separarNomes(celula(col.idx))) {
        const achado = acharParticipante(nome, porNome, porPrimeiroNome);
        if (achado) {
          if (!equipe.some((e) => e.participanteId === achado.id && e.papel === col.papel)) {
            equipe.push({ participanteId: achado.id, papel: col.papel });
          }
        } else if (!semParticipante.some((n) => normalizar(n) === normalizar(nome))) {
          semParticipante.push(nome);
        }
      }
    }

    const culto: Culto = {
      id: crypto.randomUUID(),
      data,
      hora,
      titulo,
      status,
      equipe,
      rota: [],
      criadoEm: Date.now(),
      atualizadoEm: Date.now(),
      // Campos opcionais só entram com valor: o Firestore rejeita
      // `undefined` ("Unsupported field value") e derrubava a importação.
      ...(local ? { local } : {}),
      ...(ausencias ? { observacoes: `Ausências: ${ausencias}` } : {}),
    };
    linhas.push({ culto, semParticipante });
  }

  return {
    linhas,
    tabela: { cabecalhos: colunasTabela.map((item) => item.cabecalho), linhas: linhasTabela },
    ignoradas,
    colunasIgnoradas,
  };
}

/**
 * Chave de comparação de nome: sem acento/caixa **e sem pontuação**, para
 * "PR.ALEXANDRE" e "PR. ALEXANDRE" (ou "Pr Alexandre") caírem na mesma
 * entrada do índice.
 */
function chaveNome(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Acha o participante de um nome da planilha: primeiro o nome completo,
 * depois palavra a palavra (da última para a primeira, para testar
 * "ALEXANDRE" antes de "PR") contra o primeiro nome único da equipe.
 */
function acharParticipante(
  nome: string,
  porNome: Map<string, Participante>,
  porPrimeiroNome: Map<string, Participante | null>,
): Participante | undefined {
  const completo = porNome.get(chaveNome(nome));
  if (completo) return completo;
  const palavras = chaveNome(nome).split(' ').filter((p) => p.length >= 2);
  for (let i = palavras.length - 1; i >= 0; i--) {
    const achado = porPrimeiroNome.get(palavras[i]);
    if (achado) return achado;
  }
  return undefined;
}

import type { BibliaVersiculo } from './biblia.service';

/**
 * Converte o JSON estruturado da API.Bible (capítulo ou resultado de busca)
 * na lista de versículos numerados usada pelo leitor.
 *
 * A resposta vem como uma árvore de blocos (`items`), onde o número do
 * versículo aparece em `attrs.verseId` (ex.: "JHN.3.16"). Algumas versões
 * dividem o mesmo versículo em vários blocos de texto — por isso os pedaços
 * são concatenados antes de virar uma linha só.
 */
export function extrairVersiculos(conteudo: unknown): BibliaVersiculo[] {
  const textos = new Map<number, string>();
  const percorrer = (valor: unknown): void => {
    if (Array.isArray(valor)) {
      valor.forEach(percorrer);
      return;
    }
    if (!valor || typeof valor !== 'object') return;
    const bloco = valor as Record<string, unknown>;
    const texto = bloco['text'];
    const atributos = bloco['attrs'] as Record<string, unknown> | undefined;
    const referencia = atributos?.['verseId'];
    if (typeof texto === 'string' && typeof referencia === 'string') {
      const numero = Number(referencia.split('.').at(-1));
      if (Number.isInteger(numero) && numero > 0) {
        const anterior = textos.get(numero) ?? '';
        // Algumas respostas JSON dividem o versículo em blocos sem espaço entre as palavras.
        const separador = anterior && texto && /[\p{L}\p{N}]$/u.test(anterior) && /^[\p{L}\p{N}]/u.test(texto) ? ' ' : '';
        textos.set(numero, `${anterior}${separador}${texto}`);
      }
    }
    if (bloco['items']) percorrer(bloco['items']);
  };
  percorrer(conteudo);
  return [...textos.entries()].sort(([a], [b]) => a - b).map(([numero, texto]) => ({
    numero,
    texto: texto.replace(/\s+/g, ' ').replace(/([,;:.!?])(?=[\p{L}\p{N}])/gu, '$1 ').trim(),
  }));
}

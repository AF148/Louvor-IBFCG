/**
 * Compacta imagem do dispositivo para caber no perfil.
 *
 * O resultado é um data URL (JPEG) gravado no documento do usuário no
 * Firestore — assim a personalização funciona sem depender das regras do
 * Firebase Storage e não deixa arquivo órfão quando o usuário troca a foto.
 */

/**
 * Lê um arquivo de imagem, redimensiona para caber em `larguraMax` ×
 * `alturaMax` (mantendo proporção) e devolve `data:image/jpeg`.
 *
 * Fundo branco antes de desenhar: PNG com transparência viraria preto no
 * JPEG. Lança Error com mensagem amigável quando o arquivo não é imagem.
 */
/** Redimensiona uma imagem antes de salvá-la para reduzir espaço e tempo de envio. */
export async function comprimirImagem(
  arquivo: File,
  larguraMax: number,
  alturaMax: number,
  qualidade = 0.82,
): Promise<string> {
  if (!arquivo.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem (JPG, PNG ou similar).');
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => falha(new Error('Não foi possível ler esse arquivo de imagem.'));
      el.src = url;
    });

    const escala = Math.min(1, larguraMax / img.width, alturaMax / img.height);
    const largura = Math.max(1, Math.round(img.width * escala));
    const altura = Math.max(1, Math.round(img.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível neste dispositivo.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);

    const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
    // Documento do Firestore tem limite de 1MB; deixa folga para o resto.
    if (dataUrl.length > 900_000) {
      throw new Error('Imagem grande demais para o perfil. Escolha uma foto menor.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Gradientes prontos para a capa do perfil. O primeiro é o padrão do app
 * (o mesmo usado na capa original).
 */
/** Opções de fundo predefinidas exibidas na edição do perfil. */
export const BANNERS_PERFIL: { id: string; nome: string; css: string }[] = [
  { id: 'original', nome: 'Original', css: 'linear-gradient(145deg, #0e2b43, #17617b)' },
  { id: 'oceano', nome: 'Oceano', css: 'linear-gradient(145deg, #0b3d91, #42a5f5)' },
  { id: 'violeta', nome: 'Violeta', css: 'linear-gradient(145deg, #4527a0, #9575cd)' },
  { id: 'floresta', nome: 'Floresta', css: 'linear-gradient(145deg, #1b5e20, #66bb6a)' },
  { id: 'por-do-sol', nome: 'Pôr do sol', css: 'linear-gradient(145deg, #bf360c, #ffb74d)' },
  { id: 'rosa', nome: 'Rosa', css: 'linear-gradient(145deg, #880e4f, #f06292)' },
  { id: 'noite', nome: 'Noite', css: 'linear-gradient(145deg, #101418, #546e7a)' },
];

/**
 * CSS de fundo da capa: imagem quando há, senão o gradiente escolhido,
 * senão o padrão do app.
 */
/** Escolhe entre a imagem enviada ou o gradiente escolhido para a capa. */
export function fundoCapa(bannerUrl?: string, bannerGradiente?: string): string {
  if (bannerUrl) return `url("${bannerUrl}") center / cover no-repeat`;
  return bannerGradiente || BANNERS_PERFIL[0].css;
}

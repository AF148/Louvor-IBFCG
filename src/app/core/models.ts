/** Tipos compartilhados pelas páginas, serviços e registros salvos no Firestore. */
export type Papel = 'ministrante' | 'instrumentista' | 'cantor' | 'operador' | 'som' | 'outro';

/**
 * Perfil de acesso, gravado no Firestore em `usuarios/{uid}`.
 * O `uid` é o identificador do Firebase Authentication e serve
 * para amarrar o login aos dados do app.
 */
export interface Usuario {
  uid: string;
  nome: string;
  email: string;
  papel?: Papel;
  sobreMim?: string;
  habilidades?: string[];
  /** Foto do perfil em data URL (JPEG compactado no dispositivo). */
  fotoUrl?: string;
  /** Banner/capa em data URL; quando presente, tem prioridade sobre o gradiente. */
  bannerUrl?: string;
  /** Gradiente da capa escolhido nas opções (CSS `linear-gradient`). */
  bannerGradiente?: string;
  criadoEm: number;
  atualizadoEm: number;
}

export interface Participante {
  id: string;
  nome: string;
  papel: Papel;
  /** Data de nascimento no formato 'AAAA-MM-DD'. Usada para a lista de aniversários. */
  nascimento?: string;
  telefone?: string;
  email?: string;
  observacoes?: string;
  ativo: boolean;
  criadoEm: number;
}

export type TipoMidia = 'mp3' | 'mp4';

export interface Midia {
  url: string;
  tipo: TipoMidia;
  /** Tamanho em bytes, quando conhecido. */
  tamanho?: number;
  duracaoSegundos?: number;
}

export interface Louvor {
  id: string;
  titulo: string;
  /** Artista / ministério do louvor (usado também na busca externa). */
  artista?: string;
  /** Tom de referência da cifra, ex.: 'G', 'Am', 'Bb'. */
  tom?: string;
  bpm?: number;
  letra?: string;
  cifra?: string;
  /** Fonte externa de onde a cifra foi importada. */
  fonteCifra?: string;
  /** Áudio/vídeo do louvor, guardado em partes no Firestore (campo `url`). */
  midia?: Midia;
  criadoEm: number;
  atualizadoEm: number;
}

export interface ItemPlaylist {
  louvorId: string;
  /** Ordem dentro da playlist. */
  posicao: number;
  /** Toca só a cifra (sem áudio) quando marcado. */
  apenasCifra?: boolean;
  observacoes?: string;
}

/** Vídeo de uma playlist do YouTube importada. */
export interface VideoYouTube {
  videoId: string;
  titulo: string;
  canal?: string;
  duracaoSegundos?: number;
  /** Ordem dentro da playlist do YouTube. */
  posicao: number;
}

export interface Playlist {
  id: string;
  nome: string;
  descricao?: string;
  /** Data do culto a que a playlist se refere, 'AAAA-MM-DD'. */
  data?: string;
  /** 'youtube' quando a playlist veio de um link do YouTube. */
  origem?: 'local' | 'youtube';
  /** Link original do YouTube quando importado. */
  linkYouTube?: string;
  /** Itens de louvores locais (mp3/mp4). */
  itens: ItemPlaylist[];
  /** Itens do YouTube quando a playlist foi importada. */
  itensYouTube?: VideoYouTube[];
  criadoEm: number;
  atualizadoEm: number;
}

export type StatusCulto = 'planejado' | 'confirmado' | 'realizado';

export interface ItemRota {
  ordem: number;
  titulo: string;
  /** Descrição livre: o que acontece nessa parte do culto. */
  descricao?: string;
  /** Duração prevista em minutos. */
  duracaoMin?: number;
  responsavelId?: string;
  louvorId?: string;
}

export interface Culto {
  id: string;
  data: string;
  hora: string;
  titulo: string;
  local?: string;
  status: StatusCulto;
  responsavelId?: string;
  /** Participantes escalados, com o papel que exerts no culto. */
  equipe: { participanteId: string; papel: Papel }[];
  /** Roteiro do culto, na ordem de execução. */
  rota: ItemRota[];
  playlistId?: string;
  observacoes?: string;
  criadoEm: number;
  atualizadoEm: number;
}

/** Planilha de escala guardada no app para consulta sem reabrir o arquivo. */
export interface PlanilhaEscala {
  id: string;
  nome: string;
  cabecalhos: string[];
  dados: { valores: string[] }[];
  cultos: Culto[];
  semParticipantes: { nomes: string[] }[];
  ignoradas: number;
  colunasIgnoradas: string[];
  importada: boolean;
  atualizadoEm: number;
}

export interface MensagemVoz {
  id: string;
  autorId?: string;
  autorNome?: string;
  /** URL do áudio (`fs://...` aponta para um arquivo em partes no Firestore). */
  url: string;
  duracaoSegundos?: number;
  /** Vinculação opcional a um culto. */
  cultoId?: string;
  transcricao?: string;
  criadoEm: number;
}

/** Faixa (música gravada) dentro de um kit musical. */
export interface FaixaKit {
  id: string;
  titulo: string;
  /** URL do áudio (`fs://...` aponta para um arquivo em partes no Firestore). */
  url: string;
  duracaoSegundos?: number;
  criadoEm: number;
}

/**
 * Kit musical gravado por um administrador para os membros
 * ouvirem. Um kit reúne várias faixas (uma por música).
 */
export interface KitMusical {
  id: string;
  titulo: string;
  descricao?: string;
  /** uid de quem gravou (informativo — a exclusão é só de administradores). */
  autorId?: string;
  autorNome?: string;
  faixas: FaixaKit[];
  criadoEm: number;
  atualizadoEm: number;
  /** ID do vídeo do YouTube que acompanha o kit (null = sem vídeo). */
  videoId?: string | null;
}

export interface Aniversario {
  participante: Participante;
  /** Dia e mês no formato 'MM-DD'. */
  chave: string;
  /** Quantos dias faltam, 0 = hoje. */
  faltamDias: number;
}

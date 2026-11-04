import { Injectable, signal } from '@angular/core';

/**
 * Gravação de áudio (mensagem de voz) via MediaRecorder.
 *
 * Usa `getUserMedia` + `MediaRecorder`, que funciona no navegador e dentro do
 * app empacotado por Capacitor. O resultado é um Blob WAV pronto para envio
 * ao Firestore em partes — WAV tem cabeçalho de duração, ao contrário do WebM
 * que o Chrome gera sem metadados (o player ficava em 0:00).
 */
@Injectable({ providedIn: 'root' })
/** Encapsula a captura de áudio do navegador e a conversão da gravação em arquivo. */
export class GravadorService {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  readonly gravando = signal(false);
  readonly duracaoSegundos = signal(0);
  readonly nivel = signal(0);
  readonly erro = signal<string | null>(null);
  readonly urlGravacao = signal<string | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;
  private audioCtx: AudioContext | null = null;
  private analisador: AnalyserNode | null = null;
  private inicioMs = 0;

  /** Formatos aceitos pelo navegador atual, na ordem de preferência. */
  private formatoSuportado(): string | undefined {
    const candidatos = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const tipo of candidatos) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(tipo)) {
        return tipo;
      }
    }
    return undefined;
  }

  async iniciar(): Promise<void> {
    this.erro.set(null);
    this.limpar();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.erro.set('Este dispositivo não permite gravação de áudio.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = this.formatoSuportado();
      this.recorder = new MediaRecorder(this.stream, tipo ? { mimeType: tipo } : undefined);
      this.chunks = [];

      this.recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) this.chunks.push(ev.data);
      };
      this.recorder.start(250);
      this.gravando.set(true);
      this.inicioMs = Date.now();
      this.duracaoSegundos.set(0);
      this.iniciarMedidor();
      this.iniciarTimer();
    } catch (err) {
      this.erro.set(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Permissão de microfone negada. Libere o acesso nas configurações do navegador.'
          : 'Não foi possível acessar o microfone.',
      );
      this.pararStream();
    }
  }

  /** Medidor simples de volume para a barra de nível do gravador. */
  private iniciarMedidor(): void {
    if (!this.stream) return;
    try {
      this.audioCtx = new AudioContext();
      const fonte = this.audioCtx.createMediaStreamSource(this.stream);
      this.analisador = this.audioCtx.createAnalyser();
      this.analisador.fftSize = 256;
      fonte.connect(this.analisador);
      const dados = new Uint8Array(this.analisador.frequencyBinCount);
      const medir = () => {
        if (!this.analisador || !this.gravando()) return;
        this.analisador.getByteFrequencyData(dados);
        const soma = dados.reduce((acc, v) => acc + v, 0);
        this.nivel.set(Math.min(1, soma / dados.length / 128));
        requestAnimationFrame(medir);
      };
      medir();
    } catch {
      // Medidor é apenas decorativo; a gravação segue sem ele.
    }
  }

  private iniciarTimer(): void {
    this.pararTimer();
    this.timer = setInterval(() => {
      this.duracaoSegundos.set((Date.now() - this.inicioMs) / 1000);
    }, 250);
  }

  private pararTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Encerra a gravação e devolve o Blob, ou null se nada foi capturado. */
  async parar(): Promise<Blob | null> {
    this.pararTimer();
    const recorder = this.recorder;
    const mime = recorder?.mimeType || 'audio/webm';
    const tempoDecorrido = this.inicioMs
      ? (Date.now() - this.inicioMs) / 1000
      : this.duracaoSegundos();

    // Não fecha o microfone nem o AudioContext antes do stop: isso gerava
    // um arquivo vazio (player em 0:00) mesmo com o cronômetro andando.
    if (recorder && recorder.state !== 'inactive') {
      const bruto = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(this.chunks, { type: mime }));
        };
        try {
          if (recorder.state === 'recording') recorder.requestData();
        } catch {
          // requestData não existe em alguns WebViews antigos.
        }
        recorder.stop();
      });
      await this.encerrarCaptura();
      return this.finalizarBlob(bruto, tempoDecorrido);
    }

    await this.encerrarCaptura();
    if (!this.chunks.length) return null;
    return this.finalizarBlob(new Blob(this.chunks, { type: mime }), tempoDecorrido);
  }

  private async encerrarCaptura(): Promise<void> {
    this.recorder = null;
    this.gravando.set(false);
    this.nivel.set(0);
    await this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
    this.analisador = null;
    this.pararStream();
  }

  private async finalizarBlob(bruto: Blob, tempoDecorrido: number): Promise<Blob | null> {
    if (bruto.size < 256) {
      this.erro.set('Nada foi capturado. Tente gravar de novo.');
      this.duracaoSegundos.set(0);
      return null;
    }
    const wav = await this.paraWav(bruto, tempoDecorrido);
    const final = wav ?? bruto;
    if (this.urlGravacao()) URL.revokeObjectURL(this.urlGravacao()!);
    this.urlGravacao.set(URL.createObjectURL(final));
    return final;
  }

  /**
   * Decodifica o WebM/MP4 e regrava em WAV PCM. Sem isso o Chrome entrega
   * um WebM sem duração no cabeçalho e o <audio> mostra 0:00.
   */
  private async paraWav(blob: Blob, fallbackSegundos: number): Promise<Blob | null> {
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      this.duracaoSegundos.set(audio.duration || fallbackSegundos);
      return audioBufferParaWav(audio);
    } catch {
      this.duracaoSegundos.set(fallbackSegundos);
      return null;
    } finally {
      await ctx?.close().catch(() => undefined);
    }
  }

  /** Encerra e descarta a gravação atual. */
  cancelar(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.recorder = null;
    this.pararTimer();
    this.pararStream();
    void this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
    this.analisador = null;
    this.gravando.set(false);
    this.nivel.set(0);
    this.limpar();
  }

  private pararStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** Descarta o áudio capturado e o URL de preview. */
  limpar(): void {
    if (this.urlGravacao()) {
      URL.revokeObjectURL(this.urlGravacao()!);
      this.urlGravacao.set(null);
    }
    this.chunks = [];
    this.duracaoSegundos.set(0);
  }
}

/** Converte um Blob de áudio em File, com nome e extensão adequados. */
export function blobParaArquivo(blob: Blob, nomeBase: string): File {
  const tipo = blob.type || 'audio/webm';
  // Arquivo escolhido de fora mantém a extensão original (mp3, m4a, wav...).
  const extensaoOriginal =
    blob instanceof File && /\.[a-z0-9]{1,5}$/i.test(blob.name)
      ? blob.name.split('.').pop()!.toLowerCase()
      : '';
  const extensao = extensaoOriginal || extensaoPorTipo(tipo);
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const base = nomeBase.replace(/[^\wÀ-ÿ-]+/g, '_').slice(0, 40) || 'faixa';
  return new File([blob], `${base}-${carimbo}.${extensao}`, { type: tipo });
}

/** Extensão de arquivo para cada tipo MIME de áudio conhecido. */
function extensaoPorTipo(tipo: string): string {
  if (tipo.includes('wav')) return 'wav';
  if (tipo.includes('mpeg') || tipo.includes('mp3')) return 'mp3';
  if (tipo.includes('mp4') || tipo.includes('m4a') || tipo.includes('aac')) return 'm4a';
  if (tipo.includes('flac')) return 'flac';
  if (tipo.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Mixa para mono e gera WAV PCM 16-bit (reproduzível em qualquer player). */
function audioBufferParaWav(buffer: AudioBuffer): Blob {
  const taxaAlvo = 22050;
  const mono = resampleMono(buffer, taxaAlvo);
  const pcm = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytesPorAmostra = 2;
  const canais = 1;
  const dataSize = pcm.length * bytesPorAmostra;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  escreverAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  escreverAscii(view, 8, 'WAVE');
  escreverAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, canais, true);
  view.setUint32(24, taxaAlvo, true);
  view.setUint32(28, taxaAlvo * canais * bytesPorAmostra, true);
  view.setUint16(32, canais * bytesPorAmostra, true);
  view.setUint16(34, 16, true);
  escreverAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  new Int16Array(ab, 44).set(pcm);
  return new Blob([ab], { type: 'audio/wav' });
}

function resampleMono(buffer: AudioBuffer, taxaAlvo: number): Float32Array {
  const origem = mixToMono(buffer);
  if (buffer.sampleRate === taxaAlvo) return origem;
  const razao = buffer.sampleRate / taxaAlvo;
  const saida = new Float32Array(Math.max(1, Math.floor(origem.length / razao)));
  for (let i = 0; i < saida.length; i++) {
    saida[i] = origem[Math.min(origem.length - 1, Math.floor(i * razao))] ?? 0;
  }
  return saida;
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mix = new Float32Array(length);
  const n = buffer.numberOfChannels;
  for (let c = 0; c < n; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mix[i] += data[i] / n;
  }
  return mix;
}

function escreverAscii(view: DataView, offset: number, texto: string): void {
  for (let i = 0; i < texto.length; i++) {
    view.setUint8(offset + i, texto.charCodeAt(i));
  }
}

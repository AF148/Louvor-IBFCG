import { Injectable, signal } from '@angular/core';

/**
 * Gravação de áudio (mensagem de voz) via MediaRecorder.
 *
 * Usa `getUserMedia` + `MediaRecorder`, que funciona no navegador e dentro do
 * app empacotado por Capacitor. O resultado é um Blob pronto para envio ao
 * Firebase Storage.
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

  /** Formatos aceitos pelo navegador atual, na ordem de preferência. */
  private formatoSuportado(): string | undefined {
    const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
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
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' });
        if (this.urlGravacao()) URL.revokeObjectURL(this.urlGravacao()!);
        this.urlGravacao.set(URL.createObjectURL(blob));
      };
      this.recorder.start(250);
      this.gravando.set(true);
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
      this.duracaoSegundos.update((s) => s + 1);
    }, 1000);
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
    this.gravando.set(false);
    this.nivel.set(0);
    await this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
    this.analisador = null;

    const recorder = this.recorder;
    this.recorder = null;

    if (recorder && recorder.state !== 'inactive') {
      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const b = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
          if (this.urlGravacao()) URL.revokeObjectURL(this.urlGravacao()!);
          this.urlGravacao.set(URL.createObjectURL(b));
          resolve(b);
        };
        recorder.stop();
      });
      this.pararStream();
      return blob;
    }
    this.pararStream();
    return this.chunks.length
      ? new Blob(this.chunks, { type: 'audio/webm' })
      : null;
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
  const extensao = blob.type.includes('mp4') ? 'm4a' : 'webm';
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  return new File([blob], `${nomeBase}-${carimbo}.${extensao}`, { type: blob.type });
}

/**
 * KZ-053: bunyi Lumba Solo dijana Web Audio; tiada fail audio disimpan atau
 * disalin. Kelas boleh dipakai di komponen klien sahaja (AudioContext
 * dibuat lewat semasa panggilan pertama, selepas isyarat pengguna).
 */

/** Nada ringkas yang dipakai permainan. */
export type NadaLumba = 'soalan' | 'betul' | 'salah' | 'penamat' | 'tik';

export class BunyiLumba {
  private ctx: AudioContext | null = null;
  /** Bisu: tiada nada dimainkan. */
  bisu = false;

  /** AudioContext dibuat lewat supaya polisi pelayar dibenarkan. */
  private pastiKonteks(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Kelas = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Kelas) return null;
    if (!this.ctx) {
      try {
        this.ctx = new Kelas();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Main satu nada (frekuensi, panjang, bentuk gelombang). */
  private nada(
    frekuensi: number,
    panjangMs: number,
    jenis: OscillatorType = 'sine',
    lewat: number = 0,
    kelantangan: number = 0.12,
  ): void {
    if (this.bisu) return;
    const ctx = this.pastiKonteks();
    if (!ctx) return;
    const t = ctx.currentTime + lewat / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = jenis;
    osc.frequency.setValueAtTime(frekuensi, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(kelantangan, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + panjangMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + panjangMs / 1000 + 0.05);
  }

  /** Main nada ikut peristiwa permainan. */
  main(nada: NadaLumba): void {
    if (this.bisu) return;
    switch (nada) {
      case 'soalan':
        this.nada(523.25, 180, 'triangle');
        this.nada(659.25, 220, 'triangle', 140);
        break;
      case 'betul':
        this.nada(659.25, 140, 'triangle');
        this.nada(830.61, 160, 'triangle', 110);
        this.nada(987.77, 220, 'triangle', 220);
        break;
      case 'salah':
        this.nada(196, 260, 'sawtooth', 0, 0.08);
        this.nada(147, 320, 'sawtooth', 140, 0.08);
        break;
      case 'penamat':
        this.nada(392, 200, 'triangle');
        this.nada(523.25, 200, 'triangle', 160);
        this.nada(659.25, 200, 'triangle', 320);
        this.nada(783.99, 420, 'triangle', 480);
        break;
      case 'tik':
        this.nada(880, 60, 'square', 0, 0.05);
        break;
    }
  }
}
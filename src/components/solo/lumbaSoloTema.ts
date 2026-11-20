/**
 * KZ-057: tema permainan Lumba Solo. Semua tema berkongsi enjin, soalan dan
 * papan markah yang sama; hanya rupa 3D, kenderaan dan paparan laju berbeza.
 * Fail ini tiada import Three.js supaya boleh dipakai pada skrin maklumat.
 */

export type TemaLumba = 'kereta' | 'basikal' | 'angkasa';

export interface MaklumatTema {
  id: TemaLumba;
  /** Simbol ringkas pada butang pemilih. */
  simbol: string;
  /** Pendarab laju enjin (km/j kereta) kepada laju yang dipaparkan. */
  skalaLaju: number;
}

export const SENARAI_TEMA: readonly MaklumatTema[] = [
  { id: 'kereta', simbol: '🏎️', skalaLaju: 1 },
  { id: 'basikal', simbol: '🚴', skalaLaju: 0.25 },
  { id: 'angkasa', simbol: '🚀', skalaLaju: 100 },
];

export const TEMA_LALAI: TemaLumba = 'kereta';

const KUNCI_SIMPAN = 'kuizen.solo.tema';

export function temaSah(nilai: unknown): nilai is TemaLumba {
  return SENARAI_TEMA.some((m) => m.id === nilai);
}

export function maklumatTema(tema: TemaLumba): MaklumatTema {
  return SENARAI_TEMA.find((m) => m.id === tema) ?? SENARAI_TEMA[0];
}

/** Laju untuk paparan HUD, dibundarkan. */
export function lajuPaparan(tema: TemaLumba, kmj: number): number {
  return Math.round(kmj * maklumatTema(tema).skalaLaju);
}

/** Tema pilihan terakhir pemain pada pelayar ini (lalai jika tiada). */
export function bacaTemaTersimpan(): TemaLumba {
  try {
    const v = window.localStorage.getItem(KUNCI_SIMPAN);
    return temaSah(v) ? v : TEMA_LALAI;
  } catch {
    return TEMA_LALAI;
  }
}

export function simpanTema(tema: TemaLumba): void {
  try {
    window.localStorage.setItem(KUNCI_SIMPAN, tema);
  } catch {
    /* storan disekat: abaikan */
  }
}

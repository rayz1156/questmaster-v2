/**
 * Pembantu tulen pustaka templat sijil (V2-016a). Tiada akses pangkalan
 * data atau storan supaya laluan API, komponen UI pelayar dan skrip ujian
 * memakai pemetaan dan pengesahan yang sama.
 */
import { pelanSijilBerbayar } from './pelanSijil';

/** Item pustaka seperti disimpan dalam qm_certificate_library. */
export type ItemPustaka = {
  id: string;
  scope: 'gallery' | 'personal';
  owner_id: string | null;
  title: string;
  kind: 'participation' | 'achievement' | null;
  text_tone: 'dark' | 'light';
  background_path: string | null;
  logo_path: string | null;
  layout: Record<string, unknown> | null;
  free_tier: boolean;
  published: boolean;
  sort_order: number;
};

/** Item seperti dipulangkan GET /api/certificate-library. */
export type ItemPustakaApi = ItemPustaka & {
  preview_url: string | null;
  locked: boolean;
};

/**
 * Item galeri berkunci bagi pemanggil pelan percuma: templat yang bukan
 * free_tier hanya boleh digunakan pelan berbayar. Item personal tidak
 * berkunci (pemiliknya sudah melewati semakan pelan semasa menyimpan).
 */
export function itemTerkunci(
  item: Pick<ItemPustaka, 'scope' | 'free_tier'>,
  pelanPemanggil: string | null | undefined,
): boolean {
  if (item.scope !== 'gallery') return false;
  if (item.free_tier) return false;
  return !pelanSijilBerbayar(pelanPemanggil);
}

/** Jenis aset sijil yang disokong laluan tiket muat naik. */
export type JenisAset = 'background' | 'logo';

/** Laluan objek aset galeri: gallery/<libraryId>/<kind>-<rawak>.<ext>. */
export function laluanGaleri(
  libraryId: string,
  jenis: JenisAset,
  rawak: string,
  ext: 'png' | 'jpg',
): string {
  return `gallery/${libraryId}/${jenis}-${rawak}.${ext}`;
}

/** Laluan objek aset peribadi: library/<ownerId>/<libraryId>/<kind>-<rawak>.<ext>. */
export function laluanPeribadi(
  ownerId: string,
  libraryId: string,
  jenis: JenisAset,
  rawak: string,
  ext: 'png' | 'jpg',
): string {
  return `library/${ownerId}/${libraryId}/${jenis}-${rawak}.${ext}`;
}

/**
 * Laluan aset yang sah: tidak kosong, tidak bermula dengan '/', tiada
 * traversal '..' dan tiada '/' berganda atau berakhir '/'.
 */
export function laluanAsetSah(laluan: string): boolean {
  return (
    laluan.length > 0
    && !laluan.startsWith('/')
    && !laluan.includes('..')
    && !laluan.includes('//')
    && !laluan.endsWith('/')
  );
}

/** Kriteria templat yang sama dengan laluan templates (migrasi 0042). */
export type KriteriaPustaka = {
  type: string;
  hunt_id?: string;
  min_score?: number;
  quiz_id?: string;
};

const JENIS_KRITERIA = ['all_members', 'hunt_completed', 'min_score', 'live_attended'];

/**
 * Baca kriteria daripada badan permintaan; null jika jenis tidak dikenali.
 * Medan yang tidak berkaitan jenis diabaikan, sama seperti laluan templates.
 */
export function bacaKriteriaPustaka(input: unknown): KriteriaPustaka | null {
  const k = (input ?? {}) as Record<string, unknown>;
  const type = typeof k.type === 'string' ? k.type : '';
  if (!JENIS_KRITERIA.includes(type)) return null;
  const out: KriteriaPustaka = { type };
  if (type === 'hunt_completed' && typeof k.hunt_id === 'string') out.hunt_id = k.hunt_id;
  if (type === 'live_attended' && typeof k.quiz_id === 'string') out.quiz_id = k.quiz_id;
  if (type === 'min_score' && typeof k.min_score === 'number') out.min_score = k.min_score;
  return out;
}

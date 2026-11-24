/**
 * Had kadar in-memory ringkas untuk laluan pengeluaran sijil.
 * Cukup untuk satu proses PM2; bukan ganti firewall sebenar.
 * Kunci: identiti pengguna. Tetingkap gelongsor 60 saat.
 */
const KADAR_MAKS = 5;
const TETINGKAP_MS = 60_000;

const tabung = new Map<string, number[]>();

// M1: pembersihan berkala supaya Map tidak berkembang tanpa batas dalam
// proses PM2 yang berjalan lama. unref() supaya ia tidak menghalang exit.
function kemas(): void {
  const cebis = Date.now() - TETINGKAP_MS;
  tabung.forEach((senarai, kunci) => {
    const aktif = senarai.filter((t) => t > cebis);
    if (aktif.length === 0) {
      tabung.delete(kunci);
    } else {
      tabung.set(kunci, aktif);
    }
  });
}

const pengemas: { unref?: () => void } = setInterval(kemas, 5 * 60_000);
pengemas.unref?.();

/** Pulangkan true jika panggilan dibenarkan (belum melebihi had).
 *  `maks` pilihan: had permintaan dalam tetingkap, lalai KADAR_MAKS (5). */
export function dalamHad(kunci: string, maks: number = KADAR_MAKS): boolean {
  const senarai = (tabung.get(kunci) ?? []).filter((t) => t > Date.now() - TETINGKAP_MS);
  if (senarai.length >= maks) {
    tabung.set(kunci, senarai);
    return false;
  }
  senarai.push(Date.now());
  tabung.set(kunci, senarai);
  return true;
}

/**
 * KZ-A: saat sehingga satu slot kosong dalam tetingkap (untuk
 * retry_after_seconds dan pengepala Retry-After). Minimum 1.
 */
export function bakiSaat(kunci: string): number {
  const senarai = (tabung.get(kunci) ?? []).filter((t) => t > Date.now() - TETINGKAP_MS);
  if (senarai.length === 0) return 1;
  const tertua = Math.min(...senarai);
  return Math.max(1, Math.ceil((tertua + TETINGKAP_MS - Date.now()) / 1000));
}

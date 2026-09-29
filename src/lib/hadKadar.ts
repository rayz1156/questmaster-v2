/**
 * Had kadar in-memory ringkas untuk laluan pengeluaran sijil.
 * Cukup untuk satu proses PM2; bukan ganti firewall sebenar.
 * Kunci: identiti pengguna. Tetingkap gelongsor 60 saat.
 */
const KADAR_MAKS = 5;
const TETINGKAP_MS = 60_000;

const tabung = new Map<string, number[]>();

/** Pulangkan true jika panggilan dibenarkan (belum melebihi had). */
export function dalamHad(kunci: string): boolean {
  const kini = Date.now();
  const senarai = (tabung.get(kunci) ?? []).filter((t) => t > Date.now() - TETINGKAP_MS);
  if (senarai.length >= KADAR_MAKS) {
    tabung.set(kunci, senarai);
    return false;
  }
  senarai.push(Date.now());
  tabung.set(kunci, senarai);
  return true;
}

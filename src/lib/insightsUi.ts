/**
 * Fungsi tulen untuk UI Insights kelas (tiket V2-014b), tanpa akses pangkalan
 * data supaya boleh diuji dengan `npx tsx scripts/selftest-insights-ui.ts`.
 *
 * `npx tsc` tidak menyemak logik; susunan perhatian, pengiraan most improved
 * dan geometri sparkline adalah tiga tempat yang senyap salah, jadi semuanya
 * diuji di sana dengan data bercampur.
 */
import type { PelajarInsights, TrendTitik } from './insightsKelas';

/** Flag bukan 'improving' dianggap memerlukan perhatian (tiket B). */
function benderaPerhatian(flags: readonly string[]): string[] {
  return flags.filter((f) => f !== 'improving');
}

/**
 * Senarai peserta yang perlu perhatian: ada sekurang-kurangnya satu bendera
 * selain 'improving', disusun mengikut bilangan bendera (banyak dahulu,
 * paling banyak isu paling atas) kemudian jumlah markah menaik (markah
 * paling rendah dahulu). Nama sebagai pemutus seri supaya susunan stabil.
 */
export function susunPerhatian(
  students: readonly PelajarInsights[],
): PelajarInsights[] {
  return students
    .filter((s) => benderaPerhatian(s.flags).length > 0)
    .sort(
      (a, b) =>
        benderaPerhatian(b.flags).length - benderaPerhatian(a.flags).length ||
        a.total_score - b.total_score ||
        String(a.name ?? '').localeCompare(String(b.name ?? '')) ||
        (a.user_id < b.user_id ? -1 : 1),
    );
}

/**
 * Purata pct satu separuh trend; titik dengan pct NULL (kuiz kosong)
 * dilangkau. Pulangkan null bila separuh itu tiada titik sah langsung,
 * jadi pelajar tanpa perbandingan tidak disenaraikan.
 */
function purataSeparah(titik: readonly TrendTitik[]): number | null {
  const sah = titik
    .map((t) => t.pct)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
  if (sah.length === 0) return null;
  return sah.reduce((a, b) => a + b, 0) / sah.length;
}

/**
 * Perubahan pct seorang pelajar antara separuh pertama dan separuh kedua
 * trend. Hanya pelajar dengan >= 2 titik sah boleh dinilai; pulangkan null
 * bila mana-mana separuh kosong (contoh 2 titik dengan satu pct NULL).
 */
export function deltaTrend(trend: readonly TrendTitik[]): number | null {
  const sah = trend.filter(
    (t) => typeof t.pct === 'number' && Number.isFinite(t.pct),
  );
  if (sah.length < 2) return null;
  const tengah = Math.floor(sah.length / 2);
  const awal = purataSeparah(sah.slice(0, tengah));
  const hujung = purataSeparah(sah.slice(tengah));
  if (awal === null || hujung === null) return null;
  return hujung - awal;
}

/** Satu baris senarai most improved: pelajar dan perubahannya. */
export interface BarisMostImproved {
  pelajar: PelajarInsights;
  delta: number;
}

/**
 * 5 teratas mengikut perubahan pct antara separuh pertama dan separuh kedua
 * trend, hanya pelajar dengan >= 2 sesi sah. Susunan menurun ikut delta;
 * pemutus seri nama supaya susunan stabil merentas render.
 */
export function kiraMostImproved(
  students: readonly PelajarInsights[],
  had = 5,
): BarisMostImproved[] {
  const baris: BarisMostImproved[] = [];
  for (const s of students) {
    const d = deltaTrend(s.trend);
    if (d !== null && d > 0) baris.push({ pelajar: s, delta: d });
  }
  baris.sort(
    (a, b) =>
      b.delta - a.delta ||
      String(a.pelajar.name ?? '').localeCompare(String(b.pelajar.name ?? '')) ||
      (a.pelajar.user_id < b.pelajar.user_id ? -1 : 1),
  );
  return baris.slice(0, Math.max(0, had));
}

/**
 * Laluan polyline SVG bagi sparkline: koordinat "x,y x,y" mengikut urutan
 * nilai, diagih sekata pada paksi x dan diskala pada paksi y dengan pad.
 * Nilai NULL dilangkau (seperti deltaTrend). Pulangkan null bila kurang
 * daripada 2 nilai sah supaya pemanggil memaparkan keadaan kosong.
 */
export function laluanSparkline(
  nilai: readonly (number | null)[],
  lebar = 96,
  tinggi = 28,
  pad = 2,
): string | null {
  const sah = nilai.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (sah.length < 2) return null;
  const max = Math.max(...sah);
  const min = Math.min(...sah);
  const julat = max - min;
  const w = lebar - 2 * pad;
  const h = tinggi - 2 * pad;
  const langkah = w / (sah.length - 1);
  return sah
    .map((v, i) => {
      const x = pad + i * langkah;
      const nisbah = julat > 0 ? (v - min) / julat : 0.5;
      const y = pad + (1 - nisbah) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
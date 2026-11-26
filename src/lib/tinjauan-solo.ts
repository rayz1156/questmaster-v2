/**
 * KZ-UTT Fasa 2: pemecah baris tinjauan yang ditampal dari Excel (selamat
 * untuk klien; tiada import node). Pengesahan sebenar berlaku di pelayan
 * (sahkanItemTinjauan dalam lumba-solo.ts); di sini hanya pemecahan lajur.
 *
 * Lajur (dipisah tab, susunan tetap):
 *   kod, konstruk, titik, skala_min, skala_maks, label_rendah, label_tinggi, teks
 * Baris kosong diabaikan. Baris pertama diabaikan jika sel pertamanya
 * "code" atau "kod" (baris tajuk dari Excel).
 */
export interface ItemTinjauanMentah {
  code: string;
  construct: string;
  points: string[];
  scale_min: number;
  scale_max: number;
  label_min: string;
  label_max: string;
  prompt: string;
}

export interface HasilHurai {
  items: ItemTinjauanMentah[];
  errors: { row: number; message: string }[];
}

export function huraiBarisTinjauan(teks: string): HasilHurai {
  const items: ItemTinjauanMentah[] = [];
  const errors: { row: number; message: string }[] = [];
  const baris = teks.replace(/\r\n?/g, '\n').split('\n');
  baris.forEach((mentah, i) => {
    const row = i + 1;
    if (!mentah.trim()) return;
    const sel = mentah.split('\t').map((c) => c.trim());
    if (i === 0 && /^(code|kod)$/i.test(sel[0] ?? '')) return;
    if (sel.length < 8) {
      errors.push({ row, message: 'needs 8 tab-separated columns' });
      return;
    }
    const [code, construct, titik, min, max, labelMin, labelMax, ...selebihnya] = sel;
    const prompt = selebihnya.join(' ').trim();
    const points = Array.from(new Set((titik.toUpperCase().match(/T[123]/g) ?? []))).sort();
    const scaleMin = Number(min);
    const scaleMax = Number(max);
    if (points.length === 0) {
      errors.push({ row, message: 'points must include T1, T2 or T3' });
      return;
    }
    if (!Number.isInteger(scaleMin) || !Number.isInteger(scaleMax)) {
      errors.push({ row, message: 'scale min and max must be whole numbers' });
      return;
    }
    if (!prompt) {
      errors.push({ row, message: 'item text is empty' });
      return;
    }
    items.push({
      code,
      construct,
      points,
      scale_min: scaleMin,
      scale_max: scaleMax,
      label_min: labelMin,
      label_max: labelMax,
      prompt,
    });
  });
  return { items, errors };
}

/** Tukar item kembali ke baris bertab (untuk menyunting senarai sedia ada). */
export function barisTinjauan(items: {
  code: string | null;
  construct: string | null;
  points: string[];
  scale_min: number;
  scale_max: number;
  label_min: string | null;
  label_max: string | null;
  prompt: string;
}[]): string {
  return items
    .map((it) =>
      [
        it.code ?? '',
        it.construct ?? '',
        it.points.join(' '),
        String(it.scale_min),
        String(it.scale_max),
        it.label_min ?? '',
        it.label_max ?? '',
        it.prompt.replace(/[\t\n]+/g, ' '),
      ].join('\t'),
    )
    .join('\n');
}

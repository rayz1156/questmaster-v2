/**
 * Enjin skor Learning Needs Analysis (LNA), tiket KZ-035.
 *
 * Fungsi tulen sahaja: tiada Supabase, tiada I/O, tiada kesan sampingan,
 * supaya seluruh pengiraan boleh diuji dengan
 * `npx tsx scripts/selftest-kz035.ts`. `npx tsc` dan `npm run build`
 * tidak menyemak logik formula.
 *
 * Kaedah (ikut reka bentuk C dalam tiket):
 *  - Borich MWDS (Caillouet & Harder, 2022):
 *      DS = I - C setiap pelajar; WDS = DS x meanI(k);
 *      MWDS = jumlah WDS / n. Julat skala 1-5: -4 hingga 20.
 *  - RDM RDS (Narine & Harder, 2021):
 *      NR = bilangan C < I, PR = bilangan C > I;
 *      RDS = 100 x (PR/n - NR/n). Julat -100 hingga 100;
 *      paling negatif = keperluan paling tinggi.
 *  - Kuadran IPA: paksi x = meanI, paksi y = meanC, garis pemisah pada
 *    purata keseluruhan meanI dan meanC merentas outcome; seri pada garis
 *    dikira "tinggi".
 *  - Spearman rho antara kedudukan Borich (MWDS menurun) dan kedudukan
 *    RDM (RDS menaik), dikira sebagai Pearson atas purata kedudukan
 *    (tahan seri). kaedahSepakat = rho >= 0.6; null jika kurang 3
 *    outcome ada data.
 *  - Bendera keyakinan lawan penguasaan memerlukan mastery sebenar
 *    (qm_mastery_summary) dan syarat scored >= 2 supaya satu-satu
 *    penghantaran tidak menipu bendera.
 */

/** Satu item LNA: merujuk Outcome kelas dengan label paparan. */
export interface ItemLna {
  outcomeId: string;
  label: string;
}

/** Satu jawapan pelajar (skala 1 hingga 5, disahkan di laluan API). */
export interface JawapanLna {
  userId: string;
  outcomeId: string;
  importance: number;
  currentLevel: number;
}

/** Penguasaan sebenar seorang pelajar bagi satu outcome. */
export interface MasteryLna {
  userId: string;
  outcomeId: string;
  /** Peratus kelulusan penghantaran yang dinilai; null jika belum dinilai. */
  masteryPct: number | null;
  /** Bilangan penghantaran yang telah dinilai (approved + rejected). */
  scored: number;
}

export type KuadranLna =
  | 'fokus'
  | 'kekal'
  | 'keutamaan_rendah'
  | 'berlebihan';

export type BenderaLna = 'yakin_tetapi_lemah' | 'kurang_yakin_tetapi_menguasai';

/** Label paparan bendera LNA (teks panduan pelajar/guru dalam BM). */
export const LABEL_BENDERA_LNA: Record<BenderaLna, string> = {
  yakin_tetapi_lemah: 'Yakin tetapi lemah',
  kurang_yakin_tetapi_menguasai: 'Kurang yakin tetapi menguasai',
};

/** Kedudukan paparan: seri berkongsi kedudukan terkecil (1,1,3,3,5). */
export interface BarisOutcomeLna {
  outcomeId: string;
  label: string;
  /** Bilangan pelajar yang menjawab outcome ini dalam pusingan ini. */
  n: number;
  /** Purata kepentingan, 2 titik perpuluhan; null jika tiada jawapan. */
  meanI: number | null;
  /** Purata tahap semasa, 2 titik perpuluhan; null jika tiada jawapan. */
  meanC: number | null;
  /** Borich MWDS, 2 titik perpuluhan; null jika tiada jawapan. */
  mwds: number | null;
  /** RDM RDS; paling negatif = keperluan paling tinggi. */
  rds: number | null;
  /** Kedudukan Borich (MWDS menurun), 1 = paling perlu. */
  kedudukanBorich: number | null;
  /** Kedudukan RDM (RDS menaik), 1 = paling perlu. */
  kedudukanRdm: number | null;
  /** Kuadran IPA berdasarkan garis purata keseluruhan. */
  kuadran: KuadranLna | null;
  /** Purata penguasaan sebenar responden outcome ini; null jika tiada data. */
  avgMasteryPct: number | null;
}

/** Satu bendera pelajar (hanya baris yang benar-benar berbendera). */
export interface BenderaPelajarLna {
  userId: string;
  outcomeId: string;
  currentLevel: number;
  masteryPct: number | null;
  scored: number;
  bendera: BenderaLna;
}

/** Hasil enjin bagi satu pusingan. */
export interface LaporanLna {
  /** Bilangan pelajar berbeza yang menjawab pusingan ini. */
  bilanganResponden: number;
  /** Amaran sampel kecil: responden antara 1 dan 4. */
  amaranSampelKecil: boolean;
  outcomes: BarisOutcomeLna[];
  /** Spearman rho antara kedudukan Borich dan RDM; null jika < 3 outcome. */
  spearmanRho: number | null;
  /** rho >= 0.6; null jika rho tidak dapat dikira. */
  kaedahSepakat: boolean | null;
  bendera: BenderaPelajarLna[];
  /** Garis pemisah kuadran: purata meanI merentas outcome yang ada data. */
  purataMeanI: number;
  /** Garis pemisah kuadran: purata meanC merentas outcome yang ada data. */
  purataMeanC: number;
}

/** Delta pra/pasca bagi satu outcome. */
export interface BarisDeltaOutcomeLna {
  outcomeId: string;
  label: string;
  /** meanC(pasca) - meanC(pra); null jika salah satu pusingan tiada data. */
  deltaMeanC: number | null;
  /** MWDS(pasca) - MWDS(pra); null jika salah satu pusingan tiada data. */
  deltaMwds: number | null;
  /** Purata mastery pasca - pra daripada snapshot; null jika tiada. */
  deltaMastery: number | null;
}

/** Delta tahap semasa seorang pelajar bagi satu outcome. */
export interface BarisDeltaPelajarLna {
  userId: string;
  outcomeId: string;
  /** currentLevel(pasca) - currentLevel(pra). */
  deltaC: number;
}

/** Hasil perbandingan pra/pasca. */
export interface PerbandinganLna {
  outcomes: BarisDeltaOutcomeLna[];
  pelajar: BarisDeltaPelajarLna[];
}

/** Bulatkan kepada 2 titik perpuluhan. */
function bulat2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Bendera keyakinan lawan penguasaan (peraturan C). Tiada bendera jika
 * mastery belum dinilai (null) atau scored < 2, supaya satu penghantaran
 * tunggal tidak menipu bendera.
 */
export function benderaKeyakinan(
  currentLevel: number,
  masteryPct: number | null,
  scored: number,
): BenderaLna | null {
  if (masteryPct == null) return null;
  if (currentLevel >= 4 && masteryPct < 40 && scored >= 2) {
    return 'yakin_tetapi_lemah';
  }
  if (currentLevel <= 2 && masteryPct >= 80 && scored >= 2) {
    return 'kurang_yakin_tetapi_menguasai';
  }
  return null;
}

/** Purata senarai nombor; null jika senarai kosong. */
function purataNilai(nilai: number[]): number | null {
  if (nilai.length === 0) return null;
  let jumlah = 0;
  for (const v of nilai) jumlah += v;
  return jumlah / nilai.length;
}

/**
 * Kedudukan pertandingan standard: nilai sama berkongsi kedudukan
 * terkecil dan kedudukan seterusnya dilangkau (1, 1, 3). Susunan masuk
 * ialah indeks yang sudah dialih ikut nilai.
 */
function kedudukanPertandingan<T>(
  tertib: number[],
  nilai: (i: number) => T,
  sama: (a: T, b: T) => boolean,
): number[] {
  const hasil: number[] = new Array(tertib.length);
  let kedudukan = 0;
  for (let p = 0; p < tertib.length; p += 1) {
    if (p === 0 || !sama(nilai(tertib[p]), nilai(tertib[p - 1]))) {
      kedudukan = p + 1;
    }
    hasil[tertib[p]] = kedudukan;
  }
  return hasil;
}

/**
 * Purata kedudukan bagi seri (1, 1 menjadi 1.5, 1.5) untuk Spearman.
 */
function kedudukanPurata<T>(
  tertib: number[],
  nilai: (i: number) => T,
  sama: (a: T, b: T) => boolean,
): number[] {
  const hasil: number[] = new Array(tertib.length);
  let mula = 0;
  while (mula < tertib.length) {
    let hujung = mula;
    while (
      hujung + 1 < tertib.length &&
      sama(nilai(tertib[hujung + 1]), nilai(tertib[mula]))
    ) {
      hujung += 1;
    }
    // Purata kedudukan bagi kumpulan seri (1-based).
    let jumlah = 0;
    for (let p = mula; p <= hujung; p += 1) jumlah += p + 1;
    const purata = jumlah / (hujung - mula + 1);
    for (let p = mula; p <= hujung; p += 1) hasil[tertib[p]] = purata;
    mula = hujung + 1;
  }
  return hasil;
}

/** Pearson antara dua senarai panjang sama. */
function pearson(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length === 0) return null;
  let mx = 0;
  let my = 0;
  for (const v of x) mx += v;
  for (const v of y) my += v;
  mx /= x.length;
  my /= y.length;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < x.length; i += 1) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) * (x[i] - mx);
    vy += (y[i] - my) * (y[i] - my);
  }
  // Varians sifar (semua nilai sama) bermakna tiada persetujuan boleh
  // diukur; pulangkan 0, bukan NaN.
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

/**
 * Bentuk keluaran qm_mastery_summary seperti yang diterima laluan.
 * Dipisah daripada pangkalan data supaya penukaran kekal fungsi tulen.
 */
export interface RingkasanMasteryJson {
  students?: Array<{
    user_id?: string;
    outcomes?: Array<{
      outcome_id?: string;
      mastery_pct?: number | null;
      scored?: number | null;
    }>;
  }>;
}

/**
 * Tukar keluaran qm_mastery_summary kepada senarai MasteryLna. Bertahan
 * terhadap medan hilang atau bentuk salah (data lama, JSON rosak).
 */
export function senaraiMasteryDaripadaSummary(ringkasan: unknown): MasteryLna[] {
  const hasil: MasteryLna[] = [];
  if (!ringkasan || typeof ringkasan !== 'object') return hasil;
  const students = (ringkasan as RingkasanMasteryJson).students;
  if (!Array.isArray(students)) return hasil;
  for (const s of students) {
    const userId = s && typeof s.user_id === 'string' ? s.user_id : null;
    if (!userId) continue;
    if (!Array.isArray(s.outcomes)) continue;
    for (const o of s.outcomes) {
      const outcomeId =
        o && typeof o.outcome_id === 'string' ? o.outcome_id : null;
      if (!outcomeId) continue;
      const pct =
        typeof o.mastery_pct === 'number' && Number.isFinite(o.mastery_pct)
          ? Math.round(o.mastery_pct)
          : null;
      const scored =
        typeof o.scored === 'number' && Number.isFinite(o.scored)
          ? Math.round(o.scored)
          : 0;
      hasil.push({ userId, outcomeId, masteryPct: pct, scored });
    }
  }
  return hasil;
}

/**
 * Bina laporan satu pusingan daripada item, jawapan pusingan itu dan
 * mastery semasa (atau snapshot pusingan pra/pasca).
 */
export function binaLaporanLna(input: {
  items: ItemLna[];
  jawapan: JawapanLna[];
  mastery: MasteryLna[];
}): LaporanLna {
  const { items, jawapan, mastery } = input;

  // Peta jawapan per outcome dan peta mastery per pelajar+outcome.
  const jawapanPerOutcome = new Map<string, JawapanLna[]>();
  const responden = new Set<string>();
  for (const j of jawapan) {
    const senarai = jawapanPerOutcome.get(j.outcomeId) ?? [];
    senarai.push(j);
    jawapanPerOutcome.set(j.outcomeId, senarai);
    responden.add(j.userId);
  }
  const masteryPeta = new Map<string, MasteryLna>();
  for (const m of mastery) {
    masteryPeta.set(`${m.userId}|${m.outcomeId}`, m);
  }

  // Pengiraan per outcome (MWDS, RDS, mean, purata mastery).
  interface Agihan {
    baris: BarisOutcomeLna;
    jawapanItem: JawapanLna[];
  }
  const agihan: Agihan[] = items.map((item) => {
    const senarai = jawapanPerOutcome.get(item.outcomeId) ?? [];
    let jumlahI = 0;
    let jumlahC = 0;
    for (const j of senarai) {
      jumlahI += j.importance;
      jumlahC += j.currentLevel;
    }
    const n = senarai.length;
    const meanI = n > 0 ? jumlahI / n : null;
    const meanC = n > 0 ? jumlahC / n : null;

    // Borich: DS = I - C; WDS = DS x meanI(k); MWDS = jumlah WDS / n.
    let mwds: number | null = null;
    if (n > 0 && meanI != null) {
      let jumlahWds = 0;
      for (const j of senarai) {
        jumlahWds += (j.importance - j.currentLevel) * meanI;
      }
      mwds = bulat2(jumlahWds / n);
    }

    // RDM: NR = C < I, PR = C > I; RDS = 100 x (PR/n - NR/n).
    let rds: number | null = null;
    if (n > 0) {
      let nr = 0;
      let pr = 0;
      for (const j of senarai) {
        if (j.currentLevel < j.importance) nr += 1;
        else if (j.currentLevel > j.importance) pr += 1;
      }
      rds = bulat2((100 * (pr - nr)) / n);
    }

    // Purata mastery responden outcome ini yang telah dinilai.
    const nilaiMastery: number[] = [];
    for (const j of senarai) {
      const m = masteryPeta.get(`${j.userId}|${j.outcomeId}`);
      if (m && m.masteryPct != null) nilaiMastery.push(m.masteryPct);
    }
    const avgMastery = purataNilai(nilaiMastery);

    return {
      jawapanItem: senarai,
      baris: {
        outcomeId: item.outcomeId,
        label: item.label,
        n,
        meanI: meanI != null ? bulat2(meanI) : null,
        meanC: meanC != null ? bulat2(meanC) : null,
        mwds,
        rds,
        kedudukanBorich: null,
        kedudukanRdm: null,
        kuadran: null,
        avgMasteryPct: avgMastery != null ? bulat2(avgMastery) : null,
      },
    };
  });

  // Garis kuadran: purata keseluruhan merentas outcome yang ada data.
  const senaraiMeanI: number[] = [];
  const senaraiMeanC: number[] = [];
  for (const a of agihan) {
    if (a.baris.meanI != null) senaraiMeanI.push(a.baris.meanI);
    if (a.baris.meanC != null) senaraiMeanC.push(a.baris.meanC);
  }
  const purataMeanI = purataNilai(senaraiMeanI) ?? 0;
  const purataMeanC = purataNilai(senaraiMeanC) ?? 0;

  for (const a of agihan) {
    const b = a.baris;
    if (b.meanI == null || b.meanC == null) continue;
    // Seri pada garis purata dikira "tinggi".
    const iTinggi = b.meanI >= purataMeanI;
    const cTinggi = b.meanC >= purataMeanC;
    if (iTinggi && !cTinggi) b.kuadran = 'fokus';
    else if (iTinggi && cTinggi) b.kuadran = 'kekal';
    else if (!iTinggi && !cTinggi) b.kuadran = 'keutamaan_rendah';
    else b.kuadran = 'berlebihan';
  }

  // Kedudukan Borich (MWDS menurun) dan RDM (RDS menaik) hanya untuk
  // outcome yang ada jawapan.
  const adaData: number[] = [];
  for (let i = 0; i < agihan.length; i += 1) {
    if (agihan[i].baris.n > 0) adaData.push(i);
  }

  const tertibBorich = [...adaData].sort((a, b) => {
    const ma = agihan[a].baris.mwds ?? 0;
    const mb = agihan[b].baris.mwds ?? 0;
    if (ma !== mb) return mb - ma; // menurun
    return a < b ? -1 : 1; // seri kekal ikut susunan item
  });
  const kedudukanBorich = kedudukanPertandingan(
    tertibBorich,
    (i) => agihan[i].baris.mwds ?? 0,
    (x, y) => x === y,
  );

  const tertibRdm = [...adaData].sort((a, b) => {
    const ra = agihan[a].baris.rds ?? 0;
    const rb = agihan[b].baris.rds ?? 0;
    if (ra !== rb) return ra - rb; // menaik
    return a < b ? -1 : 1;
  });
  const kedudukanRdm = kedudukanPertandingan(
    tertibRdm,
    (i) => agihan[i].baris.rds ?? 0,
    (x, y) => x === y,
  );

  for (let p = 0; p < adaData.length; p += 1) {
    const i = adaData[p];
    agihan[i].baris.kedudukanBorich = kedudukanBorich[i];
    agihan[i].baris.kedudukanRdm = kedudukanRdm[i];
  }

  // Spearman rho atas purata kedudukan (tahan seri). Kurang 3 outcome
  // bermakna kedudukan tidak bermakna: null.
  let spearmanRho: number | null = null;
  if (adaData.length >= 3) {
    const pangkatBorich = kedudukanPurata(
      tertibBorich,
      (i) => agihan[i].baris.mwds ?? 0,
      (x, y) => x === y,
    );
    const pangkatRdm = kedudukanPurata(
      tertibRdm,
      (i) => agihan[i].baris.rds ?? 0,
      (x, y) => x === y,
    );
    // Kumpulkan ikut susunan adaData supaya kedua-dua peta jajaran.
    const x: number[] = [];
    const y: number[] = [];
    for (const i of adaData) {
      x.push(pangkatBorich[i]);
      y.push(pangkatRdm[i]);
    }
    const r = pearson(x, y);
    spearmanRho = r != null ? bulat2(r) : null;
  }
  const kaedahSepakat =
    spearmanRho == null ? null : spearmanRho >= 0.6;

  // Bendera keyakinan lawan penguasaan bagi setiap jawapan.
  const bendera: BenderaPelajarLna[] = [];
  for (const a of agihan) {
    for (const j of a.jawapanItem) {
      const m = masteryPeta.get(`${j.userId}|${j.outcomeId}`);
      const flag = benderaKeyakinan(
        j.currentLevel,
        m ? m.masteryPct : null,
        m ? m.scored : 0,
      );
      if (flag) {
        bendera.push({
          userId: j.userId,
          outcomeId: j.outcomeId,
          currentLevel: j.currentLevel,
          masteryPct: m ? m.masteryPct : null,
          scored: m ? m.scored : 0,
          bendera: flag,
        });
      }
    }
  }

  const bilanganResponden = responden.size;

  return {
    bilanganResponden,
    amaranSampelKecil: bilanganResponden > 0 && bilanganResponden < 5,
    outcomes: agihan.map((a) => a.baris),
    spearmanRho,
    kaedahSepakat,
    bendera,
    purataMeanI: bulat2(purataMeanI),
    purataMeanC: bulat2(purataMeanC),
  };
}

/**
 * Bina perbandingan pra/pasca: delta meanC, MWDS dan mastery per
 * outcome, dan delta tahap semasa per pelajar per outcome bagi pelajar
 * yang menjawab kedua-dua pusingan.
 */
export function binaPerbandinganLna(input: {
  items: ItemLna[];
  jawapanPra: JawapanLna[];
  jawapanPasca: JawapanLna[];
  masteryPra: MasteryLna[] | null;
  masteryPasca: MasteryLna[] | null;
}): PerbandinganLna {
  const { items, jawapanPra, jawapanPasca, masteryPra, masteryPasca } = input;

  // meanC dan MWDS per outcome bagi satu senarai jawapan.
  const statPerOutcome = (
    senarai: JawapanLna[],
  ): Map<string, { meanC: number; mwds: number }> => {
    const perOutcome = new Map<string, JawapanLna[]>();
    for (const j of senarai) {
      const arr = perOutcome.get(j.outcomeId) ?? [];
      arr.push(j);
      perOutcome.set(j.outcomeId, arr);
    }
    const hasil = new Map<string, { meanC: number; mwds: number }>();
    perOutcome.forEach((arr, outcomeId) => {
      let jumlahI = 0;
      let jumlahC = 0;
      for (const j of arr) {
        jumlahI += j.importance;
        jumlahC += j.currentLevel;
      }
      const meanI = jumlahI / arr.length;
      let jumlahWds = 0;
      for (const j of arr) {
        jumlahWds += (j.importance - j.currentLevel) * meanI;
      }
      hasil.set(outcomeId, {
        meanC: jumlahC / arr.length,
        mwds: jumlahWds / arr.length,
      });
    });
    return hasil;
  };

  const statPra = statPerOutcome(jawapanPra);
  const statPasca = statPerOutcome(jawapanPasca);

  // Purata mastery per outcome daripada satu snapshot.
  const purataMasteryPerOutcome = (
    senarai: MasteryLna[] | null,
  ): Map<string, number> => {
    const hasil = new Map<string, number[]>();
    if (senarai) {
      for (const m of senarai) {
        if (m.masteryPct == null) continue;
        const arr = hasil.get(m.outcomeId) ?? [];
        arr.push(m.masteryPct);
        hasil.set(m.outcomeId, arr);
      }
    }
    const purata = new Map<string, number>();
    hasil.forEach((arr, outcomeId) => {
      let jumlah = 0;
      for (const v of arr) jumlah += v;
      purata.set(outcomeId, jumlah / arr.length);
    });
    return purata;
  };

  const masteryPraPeta = purataMasteryPerOutcome(masteryPra);
  const masteryPascaPeta = purataMasteryPerOutcome(masteryPasca);

  const outcomes: BarisDeltaOutcomeLna[] = items.map((item) => {
    const pra = statPra.get(item.outcomeId);
    const pasca = statPasca.get(item.outcomeId);
    const deltaMeanC =
      pra && pasca ? bulat2(pasca.meanC - pra.meanC) : null;
    const deltaMwds =
      pra && pasca ? bulat2(pasca.mwds - pra.mwds) : null;
    const mPra = masteryPraPeta.get(item.outcomeId);
    const mPasca = masteryPascaPeta.get(item.outcomeId);
    const deltaMastery =
      mPra != null && mPasca != null ? bulat2(mPasca - mPra) : null;
    return {
      outcomeId: item.outcomeId,
      label: item.label,
      deltaMeanC,
      deltaMwds,
      deltaMastery,
    };
  });

  // Delta per pelajar per outcome bagi pelajar yang menjawab kedua-dua
  // pusingan.
  const kunci = (userId: string, outcomeId: string) =>
    `${userId}|${outcomeId}`;
  const petaPra = new Map<string, JawapanLna>();
  for (const j of jawapanPra) petaPra.set(kunci(j.userId, j.outcomeId), j);
  const pelajar: BarisDeltaPelajarLna[] = [];
  for (const j of jawapanPasca) {
    const p = petaPra.get(kunci(j.userId, j.outcomeId));
    if (!p) continue;
    pelajar.push({
      userId: j.userId,
      outcomeId: j.outcomeId,
      deltaC: j.currentLevel - p.currentLevel,
    });
  }

  return { outcomes, pelajar };
}

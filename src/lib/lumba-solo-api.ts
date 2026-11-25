/**
 * KZ-053: pembantu pelayan Lumba Solo. Semua akses jadual qm_solo_* MELALUI
 * SERVICE ROLE di sini, selepas semakan kebenaran; RLS jadual baharu tertutup
 * kepada setiap peranan aplikasi (migrasi 0077).
 *
 * Keselamatan:
 *  - LAJUR_SOALAN_PELAJAR tidak mengandungi correct_key atau data; semua
 *    respons pelajar dibina daripada senarai itu sahaja.
 *  - Masa jawab sentiasa dikira di pelayan daripada served_at; masa
 *    daripada badan permintaan tidak pernah dipercayai.
 *  - Token larian dibanding secara timing-safe; token mentah hanya
 *    dipulangkan sekali ketika mula.
 *  - IP disimpan sebagai hash sahaja.
 *  - Larian milik pengguna berdaftar hanya boleh dipakai oleh pemiliknya
 *    (semakan Bearer terhadap user_id larian).
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { bearerFromReq, getRouteSupabase, getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { ahliKelas, keputusanMasuk, namaBerdaftar, potongNama, soalanSerasiLive } from '@/lib/live-quiz';
import {
  hashToken,
  kocok,
  sahkanKodSolo,
  tokenSama,
  KADAR_MAX_LARIAN,
  KADAR_TETINGKAH_MS,
  LARIAN_EXP_MS,
  PAPAR_MAX_DB,
  SOLO_MAX_SOALAN,
  SOLO_MIN_SOALAN,
  sahkanTitikUkur,
  tetingkahSoalan,
  type TitikUkur,
  susunPapan,
  kedudukanPapan,
  kunciPemain,
  type BarisLarianPapan,
  type BarisPapan,
} from '@/lib/lumba-solo';

export type SupaService = ReturnType<typeof getServiceSupabase>;

/** Baris qm_live_quizzes dari sudut pandang Lumba Solo. */
export interface KuizSolo {
  id: string;
  class_id: string | null;
  owner_id: string;
  title: string;
  solo_code: string | null;
  /** KZ-UTT: mod ujian T1, T2, T3 (log masuk wajib, satu larian setiap titik). */
  test_mode: boolean;
  /** KZ-UTT: titik pengukuran yang sedang dibuka pendidik, atau null. */
  measure_point: TitikUkur | null;
}

interface BarisKuizDb {
  id: string;
  class_id: string | null;
  owner_id: string;
  title: string;
  solo_enabled: boolean | null;
  solo_code: string | null;
  solo_test_mode: boolean | null;
  solo_measure_point: string | null;
}

/**
 * Lajur qm_live_questions yang SELAMAT untuk pelajar: tiada correct_key,
 * tiada data, tiada hint. Jangan sesekali guna select('*') di jadual itu.
 */
export const LAJUR_SOALAN_PELAJAR = 'id, prompt, options, points';

export interface SoalanSolo {
  id: string;
  prompt: string;
  options: { key: string; text: string }[];
  points: number;
}

/** Baris qm_solo_runs seperti yang dibaca pelayan. */
export interface LarianSolo {
  id: string;
  quiz_id: string;
  user_id: string | null;
  nickname: string;
  token_hash: string;
  question_ids: string[];
  next_idx: number;
  served_at: string | null;
  started_at: string;
  finished_at: string | null;
  score: number;
  correct: number;
  wrong: number;
  elapsed_ms: number | null;
  status: string;
  test_mode: boolean;
  measure_point: string | null;
}

const LAJUR_LARIAN =
  'id, quiz_id, user_id, nickname, token_hash, question_ids, next_idx, served_at, started_at, finished_at, score, correct, wrong, elapsed_ms, status, test_mode, measure_point';

export interface PenggunaRingkas {
  id: string;
  email: string | null;
}

/**
 * Muat kuiz Lumba Solo melalui kod. Null bila kod tidak sah, kuiz tiada
 * atau suis solo mati: pemanggil memulangkan 404 Challenge not found.
 */
export async function muatKuizSolo(svc: SupaService, kod: unknown): Promise<KuizSolo | null> {
  const bersih = typeof kod === 'string' ? kod.trim().toUpperCase() : '';
  if (!sahkanKodSolo(bersih)) return null;
  const { data } = await svc
    .from('qm_live_quizzes')
    .select('id, class_id, owner_id, title, solo_enabled, solo_code, solo_test_mode, solo_measure_point')
    .eq('solo_code', bersih)
    .maybeSingle();
  const r = (data ?? null) as BarisKuizDb | null;
  if (!r || r.solo_enabled !== true) return null;
  return {
    id: r.id,
    class_id: r.class_id,
    owner_id: r.owner_id,
    title: r.title,
    solo_code: r.solo_code,
    test_mode: r.solo_test_mode === true,
    measure_point: sahkanTitikUkur(r.solo_measure_point),
  };
}

export interface SemakanMasuk {
  user: PenggunaRingkas | null;
  keputusan: 'tetamu' | 'ahli' | 'perlu_log_masuk' | 'bukan_ahli';
  response: NextResponse | null;
}

/**
 * Semak masuk pemain (corak join Arena, KZ-045): kuiz berkelas menolak
 * tetamu dengan 401 LOGIN_REQUIRED dan bukan ahli dengan 403
 * NOT_CLASS_MEMBER; kuiz tanpa kelas menerima tetamu.
 */
export async function semakMasukSolo(
  req: NextRequest,
  svc: SupaService,
  kuiz: KuizSolo,
): Promise<SemakanMasuk> {
  let user: PenggunaRingkas | null = null;
  const token = bearerFromReq(req);
  if (token) {
    const routeSupa = getRouteSupabase(req);
    const { data: gu } = await routeSupa.auth.getUser(token);
    if (gu.user) {
      user = { id: gu.user.id, email: typeof gu.user.email === 'string' ? gu.user.email : null };
    }
  }

  let ahli = false;
  if (kuiz.class_id && user) {
    const k = await ahliKelas(svc, kuiz.class_id, user.id);
    ahli = !!(k.member || k.educator || k.owner);
  }

  const keputusan = keputusanMasuk({ adaKelas: !!kuiz.class_id, logMasuk: !!user, ahli });
  if (keputusan === 'perlu_log_masuk') {
    return {
      user,
      keputusan,
      response: ralatJson('Sign in to play this class quiz.', 401, { code: 'LOGIN_REQUIRED' }),
    };
  }
  if (keputusan === 'bukan_ahli') {
    return {
      user,
      keputusan,
      response: ralatJson('Join the class first to play this quiz.', 403, { code: 'NOT_CLASS_MEMBER' }),
    };
  }
  return { user, keputusan, response: null };
}

/**
 * Nama pemain: ahli guna nama berdaftar (fallback nickname badan); tetamu
 * guna nickname badan. Null bila nama tidak sah (1 hingga 24 aksara).
 */
export async function namaPemainSolo(
  svc: SupaService,
  keputusan: 'tetamu' | 'ahli',
  user: PenggunaRingkas | null,
  nicknameBody: unknown,
): Promise<string | null> {
  if (keputusan === 'ahli' && user) {
    return (await namaBerdaftar(svc, user.id, user.email)) ?? potongNama(nicknameBody);
  }
  return potongNama(nicknameBody);
}

/** Id soalan kuiz yang serasi enjin Live (multiple/ox satu jawapan betul). */
export async function soalanIdsSerasi(svc: SupaService, quizId: string): Promise<string[]> {
  const { data } = await soalanSerasiLive(svc, quizId, 'id');
  return ((data ?? []) as unknown as { id: string }[]).map((r) => r.id);
}

/**
 * Alamat IP permintaan. Utamakan x-real-ip kerana nginx menulis ganti
 * pengepala itu dengan $remote_addr; entri pertama x-forwarded-for dibekalkan
 * klien ($proxy_add_x_forwarded_for hanya menambah di hujung) dan boleh
 * dipalsukan untuk memintas had kadar. Sandaran: entri TERAKHIR
 * x-forwarded-for (yang ditambah oleh proksi kita).
 */
export function ipPermintaan(req: NextRequest): string {
  const sebenar = req.headers.get('x-real-ip')?.trim() || '';
  if (sebenar) return sebenar;
  const xf = (req.headers.get('x-forwarded-for') || '').split(',');
  const terakhir = xf[xf.length - 1]?.trim() || '';
  return terakhir || '0.0.0.0';
}

/** Had kadar: terlalu banyak larian dimulakan oleh pemain sama dalam 10 minit? */
export async function kadarLebih(
  svc: SupaService,
  quizId: string,
  userId: string | null,
  ipHash: string | null,
): Promise<boolean> {
  const sejak = new Date(Date.now() - KADAR_TETINGKAH_MS).toISOString();
  let q = svc
    .from('qm_solo_runs')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', quizId)
    .gte('started_at', sejak);
  if (userId) q = q.eq('user_id', userId);
  else if (ipHash) q = q.eq('ip_hash', ipHash);
  else return false;
  const { count } = await q;
  return (count ?? 0) >= KADAR_MAX_LARIAN;
}

/** Tukar larian playing tergendala (lebih 30 minit) milik pemain sama kepada expired. */
export async function tamatkanGendala(
  svc: SupaService,
  quizId: string,
  userId: string | null,
  ipHash: string | null,
): Promise<void> {
  const sempadan = new Date(Date.now() - LARIAN_EXP_MS).toISOString();
  let q = svc
    .from('qm_solo_runs')
    .update({ status: 'expired' })
    .eq('quiz_id', quizId)
    .eq('status', 'playing')
    .lt('started_at', sempadan);
  if (userId) q = q.eq('user_id', userId);
  else if (ipHash) q = q.eq('ip_hash', ipHash);
  else return;
  await q;
}

/** Token larian mentah yang baru (rahsia; hanya dihantar sekali kepada klien). */
export function tokenLarianBaru(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Cipta larian baharu: soalan serasi dikocok pelayan dan dipotong kepada
 * maksimum 30. Pulangkan null bila soalan tidak cukup atau sisipan gagal;
 * token mentah dipulangkan untuk dihantar kepada klien sekali sahaja.
 */
export async function ciptaLarian(
  svc: SupaService,
  kuiz: KuizSolo,
  nickname: string,
  userId: string | null,
  ipHash: string | null,
  ujian: { testMode: boolean; measurePoint: TitikUkur | null } = { testMode: false, measurePoint: null },
): Promise<{ larian: LarianSolo | null; token: string | null; sebab: 'ok' | 'kurang' | 'gagal' }> {
  const ids = await soalanIdsSerasi(svc, kuiz.id);
  if (ids.length < SOLO_MIN_SOALAN) return { larian: null, token: null, sebab: 'kurang' };
  const dipilih = kocok(ids).slice(0, SOLO_MAX_SOALAN);

  const token = tokenLarianBaru();
  const { data, error } = await svc
    .from('qm_solo_runs')
    .insert({
      quiz_id: kuiz.id,
      user_id: userId,
      nickname,
      token_hash: hashToken(token),
      question_ids: dipilih,
      next_idx: 0,
      status: 'playing',
      ip_hash: ipHash,
      test_mode: ujian.testMode,
      measure_point: ujian.testMode ? ujian.measurePoint : null,
    })
    .select(LAJUR_LARIAN)
    .single();

  if (error || !data) return { larian: null, token: null, sebab: 'gagal' };
  return { larian: data as unknown as LarianSolo, token, sebab: 'ok' };
}

/**
 * KZ-UTT: larian mod ujian sedia ada bagi pengguna pada satu titik
 * pengukuran (paling banyak satu, dijaga indeks unik migrasi 0083).
 */
export async function larianUjianSedia(
  svc: SupaService,
  quizId: string,
  userId: string,
  titik: TitikUkur,
): Promise<LarianSolo | null> {
  const { data } = await svc
    .from('qm_solo_runs')
    .select(LAJUR_LARIAN)
    .eq('quiz_id', quizId)
    .eq('user_id', userId)
    .eq('measure_point', titik)
    .eq('test_mode', true)
    .limit(1)
    .maybeSingle();
  return (data ?? null) as unknown as LarianSolo | null;
}

/**
 * KZ-UTT: sambung larian mod ujian yang belum selesai (contohnya rangkaian
 * terputus atau tab ditutup): token baharu dijana dan hash lama diganti,
 * jadi token lama tidak lagi sah. Soalan yang sudah dihidangkan terus
 * dikira dari served_at asal (masa tidak dipanjangkan).
 */
export async function sambungLarianUjian(
  svc: SupaService,
  larian: LarianSolo,
): Promise<{ larian: LarianSolo | null; token: string | null }> {
  const token = tokenLarianBaru();
  const { data } = await svc
    .from('qm_solo_runs')
    .update({ token_hash: hashToken(token), status: 'playing' })
    .eq('id', larian.id)
    .eq('test_mode', true)
    .in('status', ['playing', 'expired'])
    .select(LAJUR_LARIAN)
    .maybeSingle();
  if (!data) return { larian: null, token: null };
  return { larian: data as unknown as LarianSolo, token };
}

/** Muat larian melalui token mentah (hash + perbandingan timing-safe). */
export async function muatLarianDariToken(
  svc: SupaService,
  token: string,
): Promise<LarianSolo | null> {
  const { data } = await svc
    .from('qm_solo_runs')
    .select(LAJUR_LARIAN)
    .eq('token_hash', hashToken(token))
    .limit(1)
    .maybeSingle();
  const r = (data ?? null) as unknown as LarianSolo | null;
  if (!r) return null;
  if (!tokenSama(token, r.token_hash)) return null;
  return r;
}

export interface SemakanLarian {
  larian: LarianSolo | null;
  response: NextResponse | null;
}

/**
 * Semak token larian pada permintaan: token pada pengepala x-run-token
 * (fallback badan), larian mesti milik kuiz ini, dan larian pengguna
 * berdaftar hanya boleh dipakai oleh pemiliknya (Bearer sama).
 */
export async function semakLarian(
  req: NextRequest,
  svc: SupaService,
  kuiz: KuizSolo,
  bodyRunToken: unknown,
): Promise<SemakanLarian> {
  const daripadaHeader = req.headers.get('x-run-token')?.trim() || '';
  const token = daripadaHeader || (typeof bodyRunToken === 'string' && bodyRunToken ? bodyRunToken : '');
  if (!token) {
    return { larian: null, response: ralatJson('Run token required.', 401, { code: 'RUN_TOKEN_REQUIRED' }) };
  }

  const larian = await muatLarianDariToken(svc, token);
  if (!larian || larian.quiz_id !== kuiz.id) {
    return { larian: null, response: ralatJson('Run not found.', 404) };
  }

  if (larian.user_id) {
    const bearer = bearerFromReq(req);
    if (!bearer) {
      return {
        larian: null,
        response: ralatJson('Sign in to play this class quiz.', 401, { code: 'LOGIN_REQUIRED' }),
      };
    }
    const routeSupa = getRouteSupabase(req);
    const { data: gu } = await routeSupa.auth.getUser(bearer);
    if (!gu.user || gu.user.id !== larian.user_id) {
      return { larian: null, response: ralatJson('Forbidden', 403) };
    }
  }

  return { larian, response: null };
}

/** Muat satu soalan dengan lajur SELAMAT untuk pelajar. */
export async function soalanSelamat(svc: SupaService, id: string): Promise<SoalanSolo | null> {
  const { data } = await svc
    .from('qm_live_questions')
    .select(LAJUR_SOALAN_PELAJAR)
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as SoalanSolo | null;
}

/** Kunci jawapan satu soalan. PELAYAN SAHAJA; jangan pulangkan kepada pelajar. */
export async function kunciJawapan(
  svc: SupaService,
  id: string,
): Promise<{ correct_key: string; points: number } | null> {
  const { data } = await svc
    .from('qm_live_questions')
    .select('correct_key, points')
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as { correct_key: string; points: number } | null;
}

/** Tetingkah masa jawap sekarang berbanding masa soalan dihidangkan (pelayan). */
export function msJawap(servedAt: string | null, ujian = false): number {
  const dihidang = Date.parse(servedAt ?? '');
  if (!Number.isFinite(dihidang)) return tetingkahSoalan(ujian);
  return Math.max(0, Date.now() - dihidang);
}

/** Semua larian finished kuiz (maksimum 500 terbaik dari DB). */
export async function larianFinished(svc: SupaService, quizId: string): Promise<BarisLarianPapan[]> {
  const { data } = await svc
    .from('qm_solo_runs')
    .select('id, nickname, user_id, score, elapsed_ms, finished_at')
    .eq('quiz_id', quizId)
    .eq('status', 'finished')
    .order('score', { ascending: false })
    .order('elapsed_ms', { ascending: true })
    .order('finished_at', { ascending: true })
    .limit(PAPAR_MAX_DB);
  return ((data ?? []) as unknown as {
    id: string;
    nickname: string;
    user_id: string | null;
    score: number;
    elapsed_ms: number | null;
    finished_at: string | null;
  }[]).map((r) => ({
    id: r.id,
    nickname: r.nickname,
    userId: r.user_id,
    score: r.score,
    elapsedMs: r.elapsed_ms,
    finishedAt: r.finished_at,
  }));
}

/** Papan top 10 kuiz: satu baris terbaik per pemain, disusun dalam kod. */
export async function papanSolo(svc: SupaService, quizId: string): Promise<BarisPapan[]> {
  return susunPapan(await larianFinished(svc, quizId));
}

/** Baris papan ringkas bagi satu larian yang baru selesai. */
export function barisPapanLarian(l: LarianSolo): BarisLarianPapan {
  return {
    id: l.id,
    nickname: l.nickname,
    userId: l.user_id,
    score: l.score,
    elapsedMs: l.elapsed_ms,
    finishedAt: l.finished_at,
  };
}

/**
 * Kedudukan larian dalam papan penuh kuiz dan markah terbaik pemain itu
 * (kunci user_id jika ada, jika tidak lower(nickname)).
 */
export async function kedudukanLarian(
  svc: SupaService,
  quizId: string,
  larian: BarisLarianPapan,
): Promise<{ rank: number | null; best: number | null }> {
  const senarai = await larianFinished(svc, quizId);
  const rank = kedudukanPapan(senarai, larian.id);
  const kunci = kunciPemain(larian);
  let best: number | null = null;
  for (const r of senarai) {
    if (kunciPemain(r) === kunci) {
      best = Math.max(best ?? r.score, r.score);
    }
  }
  return { rank, best };
}
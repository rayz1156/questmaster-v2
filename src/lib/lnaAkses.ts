/**
 * Jenis kongsi dan semakan akses pelayan untuk LNA (KZ-035).
 *
 * Corak sama seperti AI Chatroom (src/lib/bilikAi.ts, KZ-033): peranan
 * dikira di pelayan daripada kelas pemilik, tidak pernah dipercayai
 * daripada klien; semua kerja jadual `qm_lna_*` melalui service role
 * kerana RLS aktif tanpa polisi (migrasi 0070), jadi tiada polisi
 * PostgREST yang boleh dipaksa.
 *
 * Guru = pemilik kelas ATAU ko-pendidik yang sudah MENERIMA jemputan
 * (qm_class_educators.accepted_at tidak null; qm_class_members ialah
 * jadual PESERTA sahaja dan tidak pernah menjadi asas hak guru).
 * Pelajar = qm_class_members. Selain itu 403.
 *
 * Fail ini MODUL PELAYAN: jangan import nilai (bukan `import type`)
 * daripada fail ini dalam komponen klien.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export type PerananLna = 'teacher' | 'student';

/** Baris qm_lna seperti yang digunakan oleh laluan. */
export interface LnaRow {
  id: string;
  class_id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Baris qm_lna_rounds; `mastery_snapshot` ialah JSON mentah. */
export interface RoundRow {
  id: string;
  lna_id: string;
  kind: 'pre' | 'post';
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  mastery_snapshot: unknown;
}

export interface HasilAksesLna {
  user: User | null;
  /** Klien service role untuk kerja jadual LNA. */
  supa: SupabaseClient | null;
  lna: LnaRow | null;
  role: PerananLna | null;
  /** Jika tidak null, pulangkan terus sebagai balasan laluan. */
  response: NextResponse | null;
}

export interface HasilAksesRound {
  user: User | null;
  supa: SupabaseClient | null;
  lna: LnaRow | null;
  round: RoundRow | null;
  role: PerananLna | null;
  response: NextResponse | null;
}

/** Semakan format UUID param laluan (kzsec: IDOR pada [lnaId]/[roundId]). */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sahUuid(x: string | null | undefined): boolean {
  return UUID_RE.test(String(x ?? ''));
}

/** Balasan ralat kebiasaan LNA. */
export function ralatLna(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

/**
 * Peranan seorang pengguna dalam satu kelas: pemilik, ko-pendidik
 * diterima, atau peserta. Null bermakna tiada hubungan (laluan memulangkan
 * 403). Semua semakan dibuat dengan service role; hasilnya TIDAK
 * bergantung pada RLS.
 */
export async function perananKelas(
  supa: SupabaseClient,
  userId: string,
  classId: string,
): Promise<PerananLna | null> {
  const { data: kelas } = await supa
    .from('qm_classes')
    .select('owner_id')
    .eq('id', classId)
    .maybeSingle();
  if (kelas?.owner_id === userId) {
    return 'teacher';
  }
  // Ko-pendidik hanya jika jemputan sudah DITERIMA.
  const { data: edu } = await supa
    .from('qm_class_educators')
    .select('educator_id')
    .eq('class_id', classId)
    .eq('educator_id', userId)
    .not('accepted_at', 'is', null)
    .maybeSingle();
  if (edu) {
    return 'teacher';
  }
  // qm_class_members ialah jadual PESERTA sahaja.
  const { data: ahli } = await supa
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', classId)
    .eq('user_id', userId)
    .maybeSingle();
  if (ahli) {
    return 'student';
  }
  return null;
}

/**
 * Semakan akses satu LNA untuk satu permintaan:
 *  1. pengguna mesti log masuk (Bearer);
 *  2. lnaId mesti UUID sah dan LNA mesti wujud (404 generik, tidak
 *     membocorkan kewujudan LNA kelas lain);
 *  3. peranan dikira di pelayan daripada kelas pemilik (403 jika tiada).
 */
export async function aksesLna(
  req: NextRequest | Request | null,
  lnaId: string,
): Promise<HasilAksesLna> {
  const gagal = (response: NextResponse): HasilAksesLna => ({
    user: null, supa: null, lna: null, role: null, response,
  });

  const auth = await requireUser(req);
  if (auth.response) return gagal(auth.response);
  const user = auth.user!;
  const supa = getServiceSupabase();

  if (!sahUuid(lnaId)) {
    return gagal(NextResponse.json({ error: 'LNA tidak ditemui.' }, { status: 404 }));
  }
  const { data: lna } = (await supa
    .from('qm_lna')
    .select('id, class_id, title, created_by, created_at, updated_at')
    .eq('id', lnaId)
    .maybeSingle()) as { data: LnaRow | null };
  if (!lna) {
    return gagal(NextResponse.json({ error: 'LNA tidak ditemui.' }, { status: 404 }));
  }

  const role = await perananKelas(supa, user.id, lna.class_id);
  if (!role) {
    return gagal(ralatLna(403, 'NOT_CLASS_MEMBER', 'Anda bukan ahli kelas ini.'));
  }

  return { user, supa, lna, role, response: null };
}

/**
 * Semakan akses satu pusingan LNA. Pusingan mesti wujud dan dipunyai
 * LNA yang wujud; kriteria penerimaan 8: roundId dari kelas lain
 * memulangkan 404 (pusingan tidak wujud bagi pemanggil).
 */
export async function aksesRound(
  req: NextRequest | Request | null,
  roundId: string,
): Promise<HasilAksesRound> {
  const gagal = (response: NextResponse): HasilAksesRound => ({
    user: null, supa: null, lna: null, round: null, role: null, response,
  });

  const auth = await requireUser(req);
  if (auth.response) return gagal(auth.response);
  const user = auth.user!;
  const supa = getServiceSupabase();

  if (!sahUuid(roundId)) {
    return gagal(NextResponse.json({ error: 'Pusingan tidak ditemui.' }, { status: 404 }));
  }
  const { data: round } = (await supa
    .from('qm_lna_rounds')
    .select('id, lna_id, kind, status, opened_at, closed_at, mastery_snapshot')
    .eq('id', roundId)
    .maybeSingle()) as { data: RoundRow | null };
  if (!round) {
    return gagal(NextResponse.json({ error: 'Pusingan tidak ditemui.' }, { status: 404 }));
  }

  const { data: lna } = (await supa
    .from('qm_lna')
    .select('id, class_id, title, created_by, created_at, updated_at')
    .eq('id', round.lna_id)
    .maybeSingle()) as { data: LnaRow | null };
  if (!lna) {
    return gagal(NextResponse.json({ error: 'Pusingan tidak ditemui.' }, { status: 404 }));
  }

  const role = await perananKelas(supa, user.id, lna.class_id);
  if (!role) {
    return gagal(ralatLna(403, 'NOT_CLASS_MEMBER', 'Anda bukan ahli kelas ini.'));
  }

  return { user, supa, lna, round, role, response: null };
}

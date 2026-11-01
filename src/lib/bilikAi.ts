/**
 * Jenis kongsi, penjana kod dan semakan akses untuk AI Chatroom (KZ-033).
 *
 * AI Chatroom hanya untuk pengguna log masuk yang:
 *  - pemilik kelas bilik, ATAU
 *  - ko-pendidik kelas yang sudah MENERIMA jemputan (qm_class_educators
 *    dengan accepted_at tidak null), maka role 'teacher', ATAU
 *  - peserta kelas (qm_class_members), maka role 'student'.
 * Selain itu 403 NOT_CLASS_MEMBER. Peranan sentiasa dikira di pelayan,
 * tidak pernah dipercayai daripada klien.
 *
 * Semua bacaan/tulisan jadual qm_ai_* melalui service role kerana RLS
 * aktif tanpa polisi (migrasi 0068); kebenaran disemak di sini dan di
 * laluan sebelum sebarang query.
 *
 * Fail ini MODUL PELAYAN: menimport crypto dan service role. Jangan
 * import nilai (bukan `import type`) daripada fail ini dalam komponen
 * klien.
 */
import { randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export type PerananBilik = 'teacher' | 'student';

/** Baris qm_ai_rooms seperti yang digunakan oleh laluan. */
export interface BilikRow {
  id: string;
  class_id: string;
  created_by: string;
  title: string;
  description: string | null;
  join_code: string;
  model_id: string | null;
  ai_enabled: boolean;
  context_enabled: boolean;
  context_window: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface HasilAksesBilik {
  user: User | null;
  /** Klien service role untuk kerja jadual bilik. */
  supa: SupabaseClient | null;
  bilik: BilikRow | null;
  role: PerananBilik | null;
  muted: boolean;
  /** Jika tidak null, pulangkan terus sebagai balasan laluan. */
  response: NextResponse | null;
}

/** Abjad kod chatroom: tiada 0, O, 1, I, U yang mudah salah dengar. */
export const ABJAD_KOD_BILIK = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REGEX_KOD_BILIK = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/** Jana kod chatroom 6 aksara daripada abjad di atas. */
export function janaKodBilik(): string {
  let kod = '';
  for (let i = 0; i < 6; i += 1) {
    kod += ABJAD_KOD_BILIK[randomInt(ABJAD_KOD_BILIK.length)];
  }
  return kod;
}

/** Had saiz badan semua laluan tulis AI Chatroom (tiket D). */
export const HAD_BADAN_BILIK = 16 * 1024;

/**
 * Baca dan sahkan badan JSON kecil semua laluan tulis AI Chatroom:
 * badan terlalu besar 413, JSON rosak 400, badan kosong dibenarkan.
 */
export async function bacaJsonKecil(
  req: NextRequest,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const panjang = Number(req.headers.get('content-length') || 0);
  if (panjang > HAD_BADAN_BILIK) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Request body too large.' }, { status: 413 }),
    };
  }
  let raw = '';
  try {
    raw = await req.text();
  } catch {
    raw = '';
  }
  if (raw.length > HAD_BADAN_BILIK) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Request body too large.' }, { status: 413 }),
    };
  }
  if (raw.trim() === '') return { ok: true, body: {} };
  try {
    const j: unknown = JSON.parse(raw);
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      return { ok: true, body: j as Record<string, unknown> };
    }
  } catch {
    // jatuh ke bawah
  }
  return {
    ok: false,
    response: NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }),
  };
}

/** Balasan ralat kebiasaan AI Chatroom. */
export function ralatBilik(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

/**
 * Nama paparan sekumpulan profil: display_name, kemudian
 * intro_display_name, kemudian username, akhirnya "User <8 pertama>".
 * Corak nama sama seperti halaman kelas pendidik (src/lib/namaProfil.ts
 * menyegerakkan display_name dan intro_display_name).
 */
export async function namaPaparanProfil(
  supa: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  // Unik tanpa spread Set: tsc repo sasarkan ES5 dan spread Set
  // memerlukan downlevelIteration.
  const unik: string[] = [];
  const dilihat = new Set<string>();
  for (const x of ids) {
    if (!x || dilihat.has(x)) continue;
    dilihat.add(x);
    unik.push(x);
  }
  const peta = new Map<string, string>();
  if (unik.length === 0) return peta;
  const { data } = await supa
    .from('qm_profiles')
    .select('id, display_name, intro_display_name, username')
    .in('id', unik);
  for (const p of data ?? []) {
    const nama =
      p.display_name ||
      p.intro_display_name ||
      p.username ||
      `User ${String(p.id).slice(0, 8)}`;
    peta.set(p.id, nama);
  }
  return peta;
}

/**
 * Model untuk bilik: model_id bilik jika masih didayakan; jika tidak
 * (atau tiada), baris is_default yang didayakan; jika tiada lagi, model
 * didayakan pertama mengikut sort_order. Pulangkan null jika tiada
 * model didayakan langsung.
 */
export async function modelUntukBilik(
  supa: SupabaseClient,
  modelId: string | null,
): Promise<{ id: string; model_id: string; label: string; provider: string } | null> {
  if (modelId) {
    const { data } = await supa
      .from('qm_ai_models')
      .select('id, model_id, label, provider')
      .eq('id', modelId)
      .eq('enabled', true)
      .maybeSingle();
    if (data) {
      return data as { id: string; model_id: string; label: string; provider: string };
    }
  }
  const { data: lalai } = await supa
    .from('qm_ai_models')
    .select('id, model_id, label, provider')
    .eq('enabled', true)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  if (lalai) {
    return lalai as { id: string; model_id: string; label: string; provider: string };
  }
  const { data: pertama } = await supa
    .from('qm_ai_models')
    .select('id, model_id, label, provider')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (
    (pertama as { id: string; model_id: string; label: string; provider: string } | null) ?? null
  );
}

/**
 * Semakan akses penuh satu bilik untuk satu permintaan (tiket D).
 *
 *  1. pengguna mesti log masuk (Bearer);
 *  2. bilik mesti wujud;
 *  3. peranan dikira di pelayan daripada kelas bilik;
 *  4. upsert qm_ai_room_members: role dikira semula setiap kali,
 *     muted dan joined_at dikekalkan;
 *  5. muted pengguna dibaca semula selepas upsert.
 */
export async function aksesBilik(
  req: NextRequest | Request | null,
  roomId: string,
): Promise<HasilAksesBilik> {
  const gagal = (response: NextResponse): HasilAksesBilik => ({
    user: null, supa: null, bilik: null, role: null, muted: false, response,
  });

  const auth = await requireUser(req);
  if (auth.response) return gagal(auth.response);
  const user = auth.user!;
  const supa = getServiceSupabase();

  const { data: bilik } = (await supa
    .from('qm_ai_rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle()) as { data: BilikRow | null };
  if (!bilik) {
    return gagal(NextResponse.json({ error: 'Chatroom tidak ditemui.' }, { status: 404 }));
  }

  // Peranan dikira di pelayan daripada kelas pemilik bilik.
  let role: PerananBilik | null = null;
  const { data: kelas } = await supa
    .from('qm_classes')
    .select('owner_id')
    .eq('id', bilik.class_id)
    .maybeSingle();
  if (kelas?.owner_id === user.id) {
    role = 'teacher';
  }
  if (!role) {
    // Ko-pendidik hanya jika jemputan sudah DITERIMA.
    const { data: edu } = await supa
      .from('qm_class_educators')
      .select('educator_id')
      .eq('class_id', bilik.class_id)
      .eq('educator_id', user.id)
      .not('accepted_at', 'is', null)
      .maybeSingle();
    if (edu) role = 'teacher';
  }
  if (!role) {
    // qm_class_members ialah jadual PESERTA sahaja.
    const { data: ahli } = await supa
      .from('qm_class_members')
      .select('user_id')
      .eq('class_id', bilik.class_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (ahli) role = 'student';
  }
  if (!role) {
    return gagal(
      ralatBilik(403, 'NOT_CLASS_MEMBER', 'Anda bukan ahli kelas ini.'),
    );
  }

  // Upsert ahli bilik: hanya room_id, user_id, role dihantar supaya
  // muted dan joined_at tidak diubah pada konflik.
  const { error: errAhli } = await supa
    .from('qm_ai_room_members')
    .upsert({ room_id: roomId, user_id: user.id, role }, { onConflict: 'room_id,user_id' });
  if (errAhli) {
    console.error('[bilik-ai] upsert ahli gagal:', errAhli.message);
    return gagal(NextResponse.json({ error: 'Keahlian chatroom tidak dapat disimpan.' }, { status: 500 }));
  }

  // Pembetulan CTO (kzsec #5): guru tidak pernah dibisukan. Bekas pelajar
  // yang dibisukan lalu menjadi ko-pendidik jika tidak kekal terbisu dan
  // laluan mute tidak membenarkan guru dinyahbisukan.
  if (role === 'teacher') {
    await supa
      .from('qm_ai_room_members')
      .update({ muted: false })
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .eq('muted', true);
  }

  const { data: ahliBilik } = await supa
    .from('qm_ai_room_members')
    .select('muted')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    user,
    supa,
    bilik,
    role,
    muted: !!ahliBilik?.muted,
    response: null,
  };
}

/**
 * Sahkan satu mesej milik satu bilik (kriteria penerimaan 11:
 * msgId dari bilik lain memulangkan 404).
 */
export async function mesejMilikBilik(
  supa: SupabaseClient,
  roomId: string,
  msgId: string,
): Promise<boolean> {
  const { data } = await supa
    .from('qm_ai_messages')
    .select('id')
    .eq('id', msgId)
    .eq('room_id', roomId)
    .maybeSingle();
  return !!data;
}
/**
 * GET  /api/ai-rooms/[roomId]/messages: kemas kini masa nyata untuk
 * semua ahli bilik (KZ-033). Klien meninjau setiap 2 saat.
 * POST /api/ai-rooms/[roomId]/messages: hantar mesej manusia.
 *
 * GET ?after=<seq>&since=<iso>:
 *  - messages: mesej dengan seq > after (had 100, menaik);
 *  - changed: mesej lama (seq <= after) yang updated_at > since,
 *    cth teks AI yang sedang distrim, perubahan status, pemadaman;
 *  - serverTime: masa pelayan untuk since seterusnya;
 *  - online: ahli dengan last_seen_at dalam 30 saat;
 *  - room: keadaan bilik semasa.
 *
 * Mesej yang dipadam dipulangkan dengan body '' dan deleted: true;
 * teksnya tidak pernah keluar pangkalan data lagi.
 */
import { NextRequest, NextResponse } from 'next/server';
import { aksesBilik, ralatBilik, bacaJsonKecil, namaPaparanProfil } from '@/lib/bilikAi';
import { dalamHad } from '@/lib/hadKadar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const LAJUR_MESEJ =
  'id, seq, author_kind, author_id, asked_by, reply_to, body, ai_status, model_label, deleted_at, created_at, updated_at';

interface MesejRow {
  id: string;
  seq: number;
  author_kind: string;
  author_id: string | null;
  asked_by: string | null;
  reply_to: string | null;
  body: string;
  ai_status: string | null;
  model_label: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Bentuk mesej untuk klien; teks dipadam tidak pernah dibalas. */
function bentuk(m: MesejRow, nama: Map<string, string>) {
  const dipadam = !!m.deleted_at;
  return {
    id: m.id,
    seq: m.seq,
    authorKind: m.author_kind,
    authorId: m.author_id,
    authorName: m.author_id ? nama.get(m.author_id) ?? null : null,
    askedBy: m.asked_by,
    askedName: m.asked_by ? nama.get(m.asked_by) ?? null : null,
    replyTo: m.reply_to,
    body: dipadam ? '' : m.body,
    aiStatus: m.ai_status,
    modelLabel: m.model_label,
    deleted: dipadam,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

export async function GET(req: NextRequest, { params }: { params: { roomId: string } }) {
  const akses = await aksesBilik(req, params.roomId);
  if (akses.response) return akses.response;
  const user = akses.user!;
  const supa = akses.supa!;
  const bilik = akses.bilik!;

  const afterRaw = req.nextUrl.searchParams.get('after') || '0';
  const after = Number.parseInt(afterRaw, 10);
  const since = req.nextUrl.searchParams.get('since');

  // Kehadiran: setiap tinjauan menandakan pengguna ini hidup.
  await supa
    .from('qm_ai_room_members')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('room_id', params.roomId)
    .eq('user_id', user.id);

  // Mesej baharu sejak tinjauan lepas.
  const { data: baru, error: errBaru } = (await supa
    .from('qm_ai_messages')
    .select(LAJUR_MESEJ)
    .eq('room_id', params.roomId)
    .gt('seq', Number.isFinite(after) ? after : 0)
    .order('seq', { ascending: true })
    .limit(100)) as { data: MesejRow[] | null; error: { message: string } | null };
  if (errBaru) {
    console.error('[bilik-ai] baca mesej baharu gagal:', errBaru.message);
    return NextResponse.json({ error: 'Mesej tidak dapat dibaca.' }, { status: 500 });
  }

  // Mesej lama yang berubah (AI sedang menaip, pemadaman, status).
  let ubah: MesejRow[] = [];
  if (since && Number.isFinite(after) && after > 0) {
    const { data: u, error: errU } = (await supa
      .from('qm_ai_messages')
      .select(LAJUR_MESEJ)
      .eq('room_id', params.roomId)
      .lte('seq', after)
      .gt('updated_at', since)
      .order('seq', { ascending: true })
      .limit(100)) as { data: MesejRow[] | null; error: { message: string } | null };
    if (errU) {
      console.error('[bilik-ai] baca mesej berubah gagal:', errU.message);
      return NextResponse.json({ error: 'Mesej tidak dapat dibaca.' }, { status: 500 });
    }
    ubah = u ?? [];
  }

  // Ahli dalam talian: last_seen_at dalam 30 saat.
  const { data: onlineRows } = await supa
    .from('qm_ai_room_members')
    .select('user_id, role, muted, last_seen_at')
    .eq('room_id', params.roomId)
    .gt('last_seen_at', new Date(Date.now() - 30_000).toISOString());

  // Nama paparan untuk semua pengarang, penanya dan ahli dalam talian.
  const ids: string[] = [];
  for (const m of [...(baru ?? []), ...ubah]) {
    if (m.author_id) ids.push(m.author_id);
    if (m.asked_by) ids.push(m.asked_by);
  }
  for (const o of onlineRows ?? []) ids.push(o.user_id);
  const nama = await namaPaparanProfil(supa, ids);

  return NextResponse.json({
    messages: (baru ?? []).map((m) => bentuk(m, nama)),
    changed: ubah.map((m) => bentuk(m, nama)),
    serverTime: new Date().toISOString(),
    online: (onlineRows ?? []).map((o) => ({
      id: o.user_id,
      name: nama.get(o.user_id) ?? `User ${String(o.user_id).slice(0, 8)}`,
      role: o.role,
      muted: o.muted,
    })),
    room: {
      id: bilik.id,
      title: bilik.title,
      status: bilik.status,
      aiEnabled: bilik.ai_enabled,
      contextEnabled: bilik.context_enabled,
      contextWindow: bilik.context_window,
      modelId: bilik.model_id,
      updatedAt: bilik.updated_at,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { roomId: string } }) {
  const akses = await aksesBilik(req, params.roomId);
  if (akses.response) return akses.response;
  const user = akses.user!;
  const supa = akses.supa!;
  const bilik = akses.bilik!;

  if (bilik.status !== 'open') {
    return ralatBilik(409, 'ROOM_CLOSED', 'Bilik sudah ditutup.');
  }
  if (akses.muted) {
    return ralatBilik(403, 'MUTED', 'Anda dibisukan dalam bilik ini.');
  }
  // Had per minit untuk mesej biasa (10 dalam tetingkap 60 saat).
  if (!dalamHad('bilik-msg:' + user.id, 10)) {
    return NextResponse.json(
      { error: 'Terlalu banyak mesej dalam masa singkat. Tunggu sebentar.' },
      { status: 429 },
    );
  }

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const teks = typeof hasil.body.body === 'string' ? hasil.body.body.trim() : '';
  if (teks.length < 1 || teks.length > 2000) {
    return NextResponse.json(
      { error: 'Mesej mesti 1 hingga 2000 aksara.' },
      { status: 400 },
    );
  }

  const { data: m, error } = (await supa
    .from('qm_ai_messages')
    .insert({
      room_id: params.roomId,
      author_kind: 'human',
      author_id: user.id,
      body: teks,
    })
    .select(LAJUR_MESEJ)
    .single()) as { data: MesejRow | null; error: { message: string } | null };
  if (error || !m) {
    console.error('[bilik-ai] hantar mesej gagal:', error?.message);
    return NextResponse.json({ error: 'Mesej tidak dapat dihantar.' }, { status: 500 });
  }

  const nama = await namaPaparanProfil(supa, [user.id]);
  return NextResponse.json({ message: bentuk(m, nama) }, { status: 201 });
}
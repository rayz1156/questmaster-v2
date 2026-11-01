/**
 * POST /api/ai-rooms/[roomId]/ask: satu giliran "Tanya AI" (KZ-033).
 *
 * Urutan wajib (tiket bahagian D.7):
 *  a. akses, bilik open + ai_enabled, tidak muted, had per minit;
 *  b. penyedia mesti sedia SEBELUM sebarang mesej dicipta, supaya tanpa
 *     kunci tiada baris yang terbuang (kriteria 4);
 *  c. kuota harian atomik qm_ai_reserve_ask (AI_ROOM_USER_DAILY lalai
 *     30, AI_ROOM_ROOM_DAILY lalai 300);
 *  d. sisip mesej manusia (soalan) dan mesej AI (queued, reply_to,
 *     asked_by, model_label);
 *  e. strim daripada penyedia (maxTokens 1200, tamat masa 90 saat);
 *     body dan ai_status streaming dikemas kini paling kerap setiap
 *     800 ms; pada setiap kemas kini, baca semula ai_status: jika
 *     stopped, batalkan strim dan simpan teks setakat ini;
 *  f. tamat: complete dan qm_ai_add_tokens; ralat: error dengan mesej
 *     selamat tanpa butiran teknikal;
 *  g. balas { aiMessageId, status } selepas siap; klien tidak
 *     menunggu respons untuk memaparkan: tinjauan 2 saat yang
 *     memaparkan kemajuan kepada semua ahli.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  aksesBilik,
  ralatBilik,
  bacaJsonKecil,
  namaPaparanProfil,
  modelUntukBilik,
} from '@/lib/bilikAi';
import { dapatkanPenyedia } from '@/lib/ai/penyedia';
import { binaMesejAi, type SejarahMesej } from '@/lib/ai/bilikPrompt';
import { dalamHad } from '@/lib/hadKadar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_TOKENS = 1200;
const TAMAT_MASA_MS = 90_000;
const KEMAS_KINI_MS = 800;
const MESEJ_RALAT_AI = 'Maaf, AI tidak dapat menjawab sekarang. Cuba lagi.';

interface SejarahRow {
  author_kind: string;
  author_id: string | null;
  body: string;
  ai_status: string | null;
}

export async function POST(req: NextRequest, { params }: { params: { roomId: string } }) {
  // (a) akses dan keadaan bilik
  const akses = await aksesBilik(req, params.roomId);
  if (akses.response) return akses.response;
  const user = akses.user!;
  const supa = akses.supa!;
  const bilik = akses.bilik!;

  if (bilik.status !== 'open') {
    return ralatBilik(409, 'ROOM_CLOSED', 'Bilik sudah ditutup.');
  }
  if (!bilik.ai_enabled) {
    return ralatBilik(409, 'AI_DISABLED', 'AI dimatikan dalam bilik ini.');
  }
  if (akses.muted) {
    return ralatBilik(403, 'MUTED', 'Anda dibisukan dalam bilik ini.');
  }
  if (!dalamHad('bilik-ask:' + user.id, 3)) {
    return NextResponse.json(
      { error: 'Terlalu banyak soalan dalam masa singkat. Tunggu sebentar.' },
      { status: 429 },
    );
  }

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const soalan = typeof hasil.body.question === 'string' ? hasil.body.question.trim() : '';
  if (soalan.length < 1 || soalan.length > 2000) {
    return NextResponse.json(
      { error: 'Soalan mesti 1 hingga 2000 aksara.' },
      { status: 400 },
    );
  }

  // (b) penyedia mesti sedia sebelum sebarang baris dicipta.
  const penyedia = dapatkanPenyedia('openrouter');
  if (!penyedia) {
    return NextResponse.json(
      { error: 'AI belum disediakan oleh pentadbir', code: 'AI_NOT_CONFIGURED' },
      { status: 503 },
    );
  }
  const model = await modelUntukBilik(supa, bilik.model_id);
  if (!model) {
    // Tiada model didayakan: AI memang tidak dapat digunakan.
    return NextResponse.json(
      { error: 'AI belum disediakan oleh pentadbir', code: 'AI_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  // (c) kuota harian atomik, RPC dengan argumen bernama.
  const hadUser = Math.max(1, Math.floor(Number(process.env.AI_ROOM_USER_DAILY ?? 30)) || 30);
  const hadRoom = Math.max(1, Math.floor(Number(process.env.AI_ROOM_ROOM_DAILY ?? 300)) || 300);
  const { data: kodKuota, error: errKuota } = (await supa.rpc('qm_ai_reserve_ask', {
    p_user: user.id,
    p_room: bilik.id,
    p_user_cap: hadUser,
    p_room_cap: hadRoom,
  })) as { data: unknown; error: { message: string } | null };
  if (errKuota) {
    console.error('[bilik-ai] reserve_ask gagal:', errKuota.message);
    return NextResponse.json({ error: 'Kuota AI tidak dapat disemak.' }, { status: 500 });
  }
  if (kodKuota === 'USER_CAP') {
    return NextResponse.json(
      {
        error: 'Anda sudah mencapai had harian menanya AI dalam bilik ini.',
        code: 'USER_CAP',
      },
      { status: 429 },
    );
  }
  if (kodKuota === 'ROOM_CAP') {
    return NextResponse.json(
      { error: 'Bilik ini sudah mencapai had harian menanya AI.', code: 'ROOM_CAP' },
      { status: 429 },
    );
  }
  if (kodKuota !== 'OK') {
    console.error('[bilik-ai] reserve_ask balas tidak dikenali:', kodKuota);
    return NextResponse.json({ error: 'Kuota AI tidak dapat disemak.' }, { status: 500 });
  }

  // Nama penanya, kelas dan sejarah untuk prompt.
  const { data: kelas } = await supa
    .from('qm_classes')
    .select('name')
    .eq('id', bilik.class_id)
    .maybeSingle();

  let tertib: SejarahRow[] = [];
  const idsNama: string[] = [user.id];
  if (bilik.context_enabled && bilik.context_window > 0) {
    const { data: msgRows } = (await supa
      .from('qm_ai_messages')
      .select('author_kind, author_id, body, ai_status')
      .eq('room_id', bilik.id)
      .is('deleted_at', null)
      .in('author_kind', ['human', 'ai'])
      .order('seq', { ascending: false })
      .limit(bilik.context_window)) as { data: SejarahRow[] | null };
    tertib = (msgRows ?? []).slice().reverse();
    for (const m of tertib) {
      if (m.author_id) idsNama.push(m.author_id);
    }
  }
  const nama = await namaPaparanProfil(supa, idsNama);
  const namaPenanya = nama.get(user.id) || 'Ahli';
  const sejarah: SejarahMesej[] = tertib.map((m) => ({
    jenis: m.author_kind === 'ai' ? 'ai' : 'human',
    teks: m.body ?? '',
    status: m.ai_status,
    nama: m.author_id ? nama.get(m.author_id) ?? null : null,
  }));

  // (d) sisip soalan manusia, kemudian mesej AI queued.
  const { data: soalanRow, error: errS } = (await supa
    .from('qm_ai_messages')
    .insert({
      room_id: bilik.id,
      author_kind: 'human',
      author_id: user.id,
      body: soalan,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null };
  if (errS || !soalanRow) {
    console.error('[bilik-ai] sisip soalan gagal:', errS?.message);
    return NextResponse.json({ error: 'Soalan tidak dapat disimpan.' }, { status: 500 });
  }

  const { data: aiRow, error: errA } = (await supa
    .from('qm_ai_messages')
    .insert({
      room_id: bilik.id,
      author_kind: 'ai',
      asked_by: user.id,
      reply_to: soalanRow.id,
      ai_status: 'queued',
      model_label: model.label,
      body: '',
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null };
  if (errA || !aiRow) {
    console.error('[bilik-ai] sisip mesej AI gagal:', errA?.message);
    return NextResponse.json({ error: 'Jawapan AI tidak dapat dimulakan.' }, { status: 500 });
  }

  // Berhenti boleh berlaku semasa masih queued: semak sebelum mula strim.
  const { data: awal } = (await supa
    .from('qm_ai_messages')
    .select('ai_status')
    .eq('id', aiRow.id)
    .maybeSingle()) as { data: { ai_status: string | null } | null };
  if (awal?.ai_status === 'stopped') {
    return NextResponse.json({ aiMessageId: aiRow.id, status: 'stopped' });
  }

  const pemutus = new AbortController();
  const pemasaMati = setTimeout(() => pemutus.abort(), TAMAT_MASA_MS);

  let teks = '';
  let versiDisimpan = 0;
  let mahuBerhenti = false;
  let tamat = false;
  let kemasDalam: Promise<void> | null = null;

  // Pembetulan CTO: tulisan hanya pada mesej yang belum dipadam, dan
  // (kecuali teks laluan berhenti) hanya semasa masih queued/streaming,
  // supaya status stopped daripada penanya/guru tidak ditimpa semula.
  const tulisMesej = async (set: Record<string, unknown>, hanyaAktif = true) => {
    let q = supa.from('qm_ai_messages').update(set).eq('id', aiRow.id).is('deleted_at', null);
    if (hanyaAktif) q = q.in('ai_status', ['queued', 'streaming']);
    await q;
  };

  // (e) kemas kini berkala: body + streaming paling kerap setiap 800 ms,
  // dan baca semula ai_status setiap kali.
  const kemasKini = async (): Promise<void> => {
    if (tamat) return;
    const { data: m } = (await supa
      .from('qm_ai_messages')
      .select('ai_status')
      .eq('id', aiRow.id)
      .maybeSingle()) as { data: { ai_status: string | null } | null };
    if (m?.ai_status === 'stopped') {
      // Berhenti diminta: batalkan strim, simpan teks setakat ini,
      // jangan sentuh status (kekal stopped).
      mahuBerhenti = true;
      pemutus.abort();
      if (teks.length > versiDisimpan) {
        await tulisMesej({ body: teks, updated_at: new Date().toISOString() }, false);
        versiDisimpan = teks.length;
      }
      return;
    }
    if (teks.length > versiDisimpan) {
      await tulisMesej({
        body: teks,
        ai_status: 'streaming',
        updated_at: new Date().toISOString(),
      });
      versiDisimpan = teks.length;
    }
  };
  const pemasaKemas = setInterval(() => {
    if (!kemasDalam) {
      // Pembetulan CTO: kosongkan selepas setiap kitaran; tanpa ini hanya
      // satu kemas kini berlaku dan Berhenti tidak pernah dikesan.
      kemasDalam = kemasKini()
        .catch(() => {
          /* cuba lagi pada kitaran seterusnya */
        })
        .finally(() => {
          kemasDalam = null;
        });
    }
  }, KEMAS_KINI_MS);

  try {
    const promptMesej = binaMesejAi({
      tajukBilik: bilik.title,
      namaKelas: kelas?.name ?? '',
      soalan,
      namaPenanya,
      sejarah,
      konteksHidup: bilik.context_enabled,
      tetingkap: bilik.context_window,
    });
    let usage: { prompt: number; completion: number } | null = null;
    for await (const p of penyedia.streamChat({
      model: model.model_id,
      messages: promptMesej,
      maxTokens: MAX_TOKENS,
      signal: pemutus.signal,
    })) {
      if (typeof p.delta === 'string') teks += p.delta;
      if (p.usage) usage = p.usage;
    }
    // (f) tamat normal.
    tamat = true;
    clearInterval(pemasaKemas);
    clearTimeout(pemasaMati);
    if (kemasDalam) await kemasDalam;
    if (mahuBerhenti) {
      // Strim tamat tanpa melontar selepas abort: kekal stopped.
      await tulisMesej({ body: teks, updated_at: new Date().toISOString() }, false);
      return NextResponse.json({ aiMessageId: aiRow.id, status: 'stopped' });
    }
    await tulisMesej({
      body: teks,
      ai_status: 'complete',
      updated_at: new Date().toISOString(),
    });
    if (usage) {
      await supa.rpc('qm_ai_add_tokens', {
        p_user: user.id,
        p_room: bilik.id,
        p_prompt: usage.prompt,
        p_completion: usage.completion,
      });
    }
    // (g) balas selepas siap; klien memaparkan melalui tinjauan.
    return NextResponse.json({ aiMessageId: aiRow.id, status: 'complete' });
  } catch (e) {
    tamat = true;
    clearInterval(pemasaKemas);
    clearTimeout(pemasaMati);
    if (kemasDalam) await kemasDalam;
    if (mahuBerhenti) {
      // Dihentikan penanya/guru: kekal stopped dengan teks setakat ini.
      if (versiDisimpan < teks.length) {
        await tulisMesej({ body: teks, updated_at: new Date().toISOString() }, false);
      }
      return NextResponse.json({ aiMessageId: aiRow.id, status: 'stopped' });
    }
    // Ralat penyedia atau tamat masa 90 saat: mesej selamat,
    // tiada butiran teknikal kepada pengguna.
    console.error('[bilik-ai] strim AI gagal:', e instanceof Error ? e.message : String(e));
    await tulisMesej({
      body: MESEJ_RALAT_AI,
      ai_status: 'error',
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ aiMessageId: aiRow.id, status: 'error' });
  }
}
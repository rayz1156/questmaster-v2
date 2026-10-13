import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import type { LiveSessionRow } from '@/lib/live-quiz';
import { TINDAKAN_REVIEW, langkahReview, type TindakanReview } from '@/lib/lumba-laju';

const TINDAKAN_ASAS = ['start', 'next', 'reveal', 'end', 'reset'];
const LAJUR_BALAS =
  'id, quiz_id, code, status, current_index, question_started_at, ended_at, game_mode, race_ends_at, review_index, review_revealed';

/** Kemas kini sesi dan pulangkan barisnya (bentuk balasan sama dengan klasik). */
async function kemasKiniDanBalas(
  supa: SupabaseClient,
  sessionId: string,
  tampal: Record<string, unknown>,
) {
  // Tampalan kosong: baca semula sahaja (keadaan sudah diubah oleh fungsi RPC).
  const { data: updated, error: upErr } = Object.keys(tampal).length === 0
    ? await supa.from('qm_live_sessions').select(LAJUR_BALAS).eq('id', sessionId).maybeSingle()
    : await supa
        .from('qm_live_sessions')
        .update(tampal)
        .eq('id', sessionId)
        .select(LAJUR_BALAS)
        .maybeSingle();
  if (upErr) {
    console.error('race control update failed', upErr.code);
    return NextResponse.json({ error: 'Could not update the session.' }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  return NextResponse.json({ data: updated });
}

/**
 * KZ-012: kawalan sesi Speed Race. Dipanggil HANYA selepas semakan hos di
 * atas. Fungsi qm_race_* hanya boleh dipanggil oleh service_role, jadi klien
 * service digunakan di sini dan tidak di tempat lain dalam laluan ini.
 */
async function kawalLumba(
  supa: SupabaseClient,
  sessionId: string,
  status: string,
  action: string,
) {
  const svc = getServiceSupabase();
  if (action === 'next' || action === 'reveal') {
    return NextResponse.json({ error: 'This action is not used in a Speed Race.' }, { status: 400 });
  }
  if (action === 'start') {
    if (status !== 'lobby') {
      return NextResponse.json({ error: 'The race is not in the lobby. Reset it first.' }, { status: 400 });
    }
    const { error } = await svc.rpc('qm_race_start', { p_session: sessionId });
    if (error) {
      if (error.code === 'RACE1') return NextResponse.json({ error: 'This quiz has no questions.' }, { status: 400 });
      if (error.code === 'RACE2') {
        return NextResponse.json({ error: 'The race is not in the lobby. Reset it first.' }, { status: 400 });
      }
      console.error('qm_race_start failed', error.code);
      return NextResponse.json({ error: 'The race could not be started.' }, { status: 500 });
    }
    return kemasKiniDanBalas(supa, sessionId, {});
  }
  if (action === 'end') {
    if (status === 'ended') {
      return NextResponse.json({ error: 'The session is already over.' }, { status: 400 });
    }
    const { error } = await svc.rpc('qm_race_end', { p_session: sessionId });
    if (error) {
      console.error('qm_race_end failed', error.code);
      return NextResponse.json({ error: 'The race could not be stopped.' }, { status: 500 });
    }
    // qm_race_end hanya menamatkan sesi yang berstatus selain ended. Sesi
    // lobi yang dihentikan juga ditamatkan oleh fungsi yang sama.
    return kemasKiniDanBalas(supa, sessionId, {});
  }
  // reset
  if (status === 'ended') {
    return NextResponse.json({ error: 'The session is over and cannot be reset.' }, { status: 400 });
  }
  // Reset guna klien pengguna supaya RLS hos terpakai, sama seperti reset
  // klasik. Klien service hanya untuk fungsi qm_race_* (kzsec KZ-012).
  const { error: delErr } = await supa.from('qm_live_answers').delete().eq('session_id', sessionId);
  if (delErr) {
    console.error('race reset answers failed', delErr.code);
    return NextResponse.json({ error: 'The race could not be reset.' }, { status: 500 });
  }
  const { error: pErr } = await supa
    .from('qm_live_players')
    .update({
      score: 0, total_ms: 0, streak: 0, best_streak: 0,
      race_distance: 0, race_wrong: 0, race_frozen_until: null, race_rank: null,
      race_finished_at: null, race_question_id: null, race_served_at: null, race_queue: [],
    })
    .eq('session_id', sessionId);
  if (pErr) {
    console.error('race reset players failed', pErr.code);
    return NextResponse.json({ error: 'The race could not be reset.' }, { status: 500 });
  }
  return kemasKiniDanBalas(supa, sessionId, {
    status: 'lobby', current_index: -1, question_started_at: null,
    race_ends_at: null, race_finished: 0, review_index: -1, review_revealed: false,
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * POST /api/live/sessions/[sessionId]/control
 * Badan: {action}. action: start | next | reveal | end | reset.
 * - start:  lobby -> asking, current_index 0, set question_started_at
 * - next:   ke soalan berikut, status asking, set semula question_started_at
 * - reveal: status revealed, tutup jawapan soalan semasa
 * - end:    status ended, set ended_at
 * - reset:  kembali lobby, current_index -1, padam qm_live_answers dan set
 *           semula skor pemain kepada 0 (jangan padam pemain)
 *
 * KZ-012, sesi Speed Race (game_mode = 'race'):
 * - start memanggil qm_race_start, end memanggil qm_race_end, reset turut
 *   mengosongkan lajur race_* dan review_*. next dan reveal ditolak.
 * - review_start | review_next | review_prev | review_reveal | review_end:
 *   mod perbincangan selepas lumba tamat (sesi race berstatus ended sahaja).
 */
export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  interface QuizRef { class_id: string; owner_id: string }
  interface ProfileRef { role: string; suspended: boolean | null }
  const { data: session } = await auth.supa
    .from('qm_live_sessions')
    .select('id, quiz_id, host_id, code, status, current_index, question_started_at')
    .eq('id', params.sessionId)
    .maybeSingle();
  const ses = session as LiveSessionRow | null;
  if (!ses) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  // Sahkan hos: pemilik sesi, pendidik kelas kuiz atau admin.
  if (ses.host_id !== auth.user!.id) {
    const { data: quiz } = await auth.supa
      .from('qm_live_quizzes')
      .select('class_id, owner_id')
      .eq('id', ses.quiz_id)
      .maybeSingle();
    const qz = quiz as QuizRef | null;
    let allowed = false;
    if (qz) {
      if (qz.owner_id === auth.user!.id) {
        allowed = true;
      } else {
        const { data: member } = await auth.supa
          // Pendidik ada dalam qm_class_educators (educator_id), bukan qm_class_members (peserta).
          .from('qm_class_educators')
          .select('educator_id, accepted_at')
          .eq('class_id', qz.class_id)
          .eq('educator_id', auth.user!.id)
          .not('accepted_at', 'is', null)
          .maybeSingle();
        if (member) allowed = true;
      }
    }
    if (!allowed) {
      const { data: profile } = await auth.supa
        .from('qm_profiles')
        .select('role, suspended')
        .eq('id', auth.user!.id)
        .maybeSingle();
      const me = profile as ProfileRef | null;
      if (me && !me.suspended && ['admin', 'superadmin'].includes(me.role)) allowed = true;
    }
    if (!allowed) return NextResponse.json({ error: 'You are not the host of this session.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (![...TINDAKAN_ASAS, ...TINDAKAN_REVIEW].includes(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const { data: questions } = await auth.supa
    .from('qm_live_questions')
    .select('id')
    .eq('quiz_id', ses.quiz_id)
    .order('order_idx');
  const totalQuestions = (questions || []).length;
  if (totalQuestions === 0) {
    return NextResponse.json({ error: 'This quiz has no questions.' }, { status: 400 });
  }

  // KZ-012: mod sesi dan keadaan perbincangan. Dibaca berasingan supaya
  // jenis LiveSessionRow dan pertanyaan di atas tidak berubah untuk klasik.
  const { data: modRow } = (await auth.supa
    .from('qm_live_sessions')
    .select('game_mode, review_index')
    .eq('id', params.sessionId)
    .maybeSingle()) as { data: { game_mode: string | null; review_index: number | null } | null };
  const lumba = modRow?.game_mode === 'race';

  // Tindakan perbincangan: hanya sesi lumba yang sudah tamat.
  if ((TINDAKAN_REVIEW as readonly string[]).includes(action)) {
    if (!lumba || ses.status !== 'ended') {
      return NextResponse.json(
        { error: 'Question review is available after the race ends.' },
        { status: 400 },
      );
    }
    const langkah = langkahReview(action as TindakanReview, modRow?.review_index ?? -1, totalQuestions);
    if (!langkah.ok) return NextResponse.json({ error: langkah.error }, { status: 400 });
    const tampal: Record<string, unknown> = { review_index: langkah.index };
    if (langkah.revealed !== null) tampal.review_revealed = langkah.revealed;
    return kemasKiniDanBalas(auth.supa, params.sessionId, tampal);
  }

  if (lumba) {
    return kawalLumba(auth.supa, params.sessionId, ses.status, action);
  }

  const patch: Record<string, unknown> = {};

  if (action === 'start') {
    if (ses.status !== 'lobby') {
      return NextResponse.json({ error: 'The session is not in the lobby. Reset it first.' }, { status: 400 });
    }
    patch.status = 'asking';
    patch.current_index = 0;
    patch.question_started_at = new Date().toISOString();
  } else if (action === 'next') {
    if (!['asking', 'revealed'].includes(ses.status)) {
      return NextResponse.json({ error: 'No question is open right now.' }, { status: 400 });
    }
    const nextIdx = ses.current_index + 1;
    if (nextIdx >= totalQuestions) {
      return NextResponse.json({ error: 'No more questions. Use End session.' }, { status: 400 });
    }
    patch.status = 'asking';
    patch.current_index = nextIdx;
    patch.question_started_at = new Date().toISOString();
  } else if (action === 'reveal') {
    if (ses.status !== 'asking') {
      return NextResponse.json({ error: 'There is no open question to reveal.' }, { status: 400 });
    }
    patch.status = 'revealed';
    // Tidak menjawab memutuskan rentetan, sama seperti jawapan salah.
    // Tanpa ini, melangkau soalan sukar akan mengekalkan bonus.
    const currentQ = (questions || [])[ses.current_index] as { id: string } | undefined;
    if (currentQ) {
      const [{ data: answered }, { data: semua }] = await Promise.all([
        auth.supa
          .from('qm_live_answers')
          .select('player_id')
          .eq('session_id', params.sessionId)
          .eq('question_id', currentQ.id),
        auth.supa
          .from('qm_live_players')
          .select('id, streak')
          .eq('session_id', params.sessionId)
          .gt('streak', 0),
      ]);
      const menjawab = new Set(
        (answered || []).map((a) => (a as { player_id: string }).player_id),
      );
      // Senarai dikira di sini, bukan melalui penapis `not.in` bertulis
      // tangan: `.in('id', senarai)` ialah panggilan supabase-js biasa dan
      // tidak bergantung pada sintaks rentetan PostgREST.
      const diamDiam = (semua || [])
        .map((p) => (p as { id: string }).id)
        .filter((id) => !menjawab.has(id));
      if (diamDiam.length > 0) {
        await auth.supa
          .from('qm_live_players')
          .update({ streak: 0 })
          .in('id', diamDiam);
      }
    }
  } else if (action === 'end') {
    if (ses.status === 'ended') {
      return NextResponse.json({ error: 'The session is already over.' }, { status: 400 });
    }
    patch.status = 'ended';
    patch.ended_at = new Date().toISOString();
  } else if (action === 'reset') {
    if (ses.status === 'ended') {
      return NextResponse.json({ error: 'The session is over and cannot be reset.' }, { status: 400 });
    }
    // Padam semua jawapan sesi ini.
    const { error: delErr } = await auth.supa
      .from('qm_live_answers')
      .delete()
      .eq('session_id', params.sessionId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    // Set semula skor pemain kepada 0. Baris pemain JANGAN dipadam.
    const { error: pErr } = await auth.supa
      .from('qm_live_players')
      .update({ score: 0, total_ms: 0, streak: 0, best_streak: 0 })
      .eq('session_id', params.sessionId);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    patch.status = 'lobby';
    patch.current_index = -1;
    patch.question_started_at = null;
  }

  const { data: updated, error: upErr } = await auth.supa
    .from('qm_live_sessions')
    .update(patch)
    .eq('id', params.sessionId)
    .select('id, quiz_id, code, status, current_index, question_started_at, ended_at')
    .single();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message || 'Could not update the session.' }, { status: 500 });
  }
  return NextResponse.json({ data: updated });
}

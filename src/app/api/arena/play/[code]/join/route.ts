import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, getRouteSupabase, bearerFromReq } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { makePlayerToken } from '@/lib/arena/public';
import { namaBerdaftar, ahliKelas, keputusanMasuk, potongNama } from '@/lib/live-quiz';
import { loadPlaySession, loadPlayerByToken, playerTokenOf, readJsonBody } from '@/lib/arena/play-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// "<nama> 2" hingga "<nama> 9", tetap 24 aksara maksimum (corak join Live).
function namaAkhiran(nama: string, i: number): string {
  const akhiran = ' ' + String(i);
  return nama.slice(0, 24 - akhiran.length) + akhiran;
}

/** Peserta masuk sesi. Token sah = sambung semula pemain sama. */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const body = await readJsonBody(req);
  const svc = getServiceSupabase();
  const loaded = await loadPlaySession(svc, params.code);
  if (!loaded) return ralatJson('Session not found', 404);
  const { session } = loaded;

  // KZ-045: sesi yang memakan kuiz BERKELAS mengikut peraturan Live yang
  // sama (keputusanMasuk, ahliKelas, namaBerdaftar dalam src/lib/live-quiz.ts):
  // tetamu 401 LOGIN_REQUIRED, bukan ahli 403 NOT_CLASS_MEMBER, ahli guna
  // nama berdaftar dan markah dipautkan melalui qm_arena_players.user_id.
  let classId: string | null = null;
  if (session.quiz_id) {
    const { data: kuiz } = await svc
      .from('qm_live_quizzes')
      .select('class_id')
      .eq('id', session.quiz_id)
      .limit(1)
      .maybeSingle();
    classId = (kuiz as { class_id?: string | null } | null)?.class_id || null;
  }

  let user: { id: string; email: string | null } | null = null;
  const token = bearerFromReq(req);
  if (token) {
    const routeSupa = getRouteSupabase(req);
    const { data: gu } = await routeSupa.auth.getUser(token);
    if (gu.user) {
      user = { id: gu.user.id, email: typeof gu.user.email === 'string' ? gu.user.email : null };
    }
  }

  let ahli = false;
  if (classId && user) {
    const k = await ahliKelas(svc, classId, user.id);
    ahli = !!(k.member || k.educator || k.owner);
  }

  const keputusan = keputusanMasuk({ adaKelas: !!classId, logMasuk: !!user, ahli });
  if (keputusan === 'perlu_log_masuk') {
    return ralatJson('Sign in to play this class quiz.', 401, { code: 'LOGIN_REQUIRED' });
  }
  if (keputusan === 'bukan_ahli') {
    return ralatJson('Join the class first to play this quiz.', 403, { code: 'NOT_CLASS_MEMBER' });
  }

  // Kuiz kelas dan ahli: nama berdaftar; jika profil tiada nama, guna
  // nickname badan supaya pengguna tetap boleh bermain.
  let daftar: { userId: string; nama: string } | null = null;
  if (keputusan === 'ahli' && user) {
    const nama = (await namaBerdaftar(svc, user.id, user.email)) || potongNama(body.nickname);
    if (nama) {
      daftar = { userId: user.id, nama };
    } else {
      return ralatJson('Nickname must be 1-24 characters', 400);
    }
  }


  // sambung semula
  const tok = typeof body.playerToken === 'string' && body.playerToken ? body.playerToken : playerTokenOf(req);
  if (tok) {
    const p = await loadPlayerByToken(svc, session.id, tok);
    if (p) {
      await svc.from('qm_arena_players').update({ last_seen_at: new Date().toISOString() }).eq('id', p.id);
      return NextResponse.json({ playerId: p.id, playerToken: p.player_token, nickname: p.nickname });
    }
  }

  // Sambung semula pengguna berdaftar (KZ-045): baris sedia ada milik
  // pengguna yang sama dalam sesi ini; token hanya dipulangkan kepada
  // pemilik yang sama (sudah disahkan melalui Bearer).
  // KZ-050: semakan ini kini SEBELUM semakan sesi tamat, supaya pemain
  // yang terputus masih boleh kembali melihat markah akhir; dan ralat
  // pangkalan data dibalas 503 (bukan dianggap "tiada baris", yang dahulu
  // boleh mencipta pemain pendua).
  if (daftar) {
    const { data: sedia, error: ralatSedia } = await svc
      .from('qm_arena_players')
      .select('id, player_token, nickname')
      .eq('session_id', session.id)
      .eq('user_id', daftar.userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ralatSedia) return ralatJson('Could not join session', 503);
    if (sedia) {
      const s = sedia as { id: string; player_token: string; nickname: string };
      await svc.from('qm_arena_players').update({ last_seen_at: new Date().toISOString() }).eq('id', s.id);
      return NextResponse.json({ playerId: s.id, playerToken: s.player_token, nickname: s.nickname });
    }
  }

  // KZ-050: resumeOnly = klien hanya mahu menyambung pemain sedia ada
  // (dipanggil automatik bila token tempatan hilang). Jangan cipta pemain.
  if (body.resumeOnly === true) {
    return ralatJson('No existing player', 404, { code: 'NO_PLAYER' });
  }

  if (session.status === 'ended') return ralatJson('Session ended', 409);

  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().replace(/\s+/g, ' ') : '';
  // Nama bebas (tetamu) mesti 1-24 aksara; nama berdaftar sudah dipotong 24.
  if (!daftar && (nickname.length < 1 || nickname.length > 24)) {
    return ralatJson('Nickname must be 1-24 characters', 400);
  }

  const avRaw = Number(body.avatar);
  const avatar = Number.isInteger(avRaw) && avRaw >= 0 && avRaw <= 7 ? avRaw : 0;

  // mod team: guna pasukan diminta jika sah, jika tidak pasukan paling kecil
  let team: number | null = null;
  if (session.mode === 'team') {
    const tc = Math.max(2, Math.min(4, Number(session.team_count) || 2));
    const tRaw = body.team === null || body.team === undefined || body.team === '' ? NaN : Number(body.team);
    if (Number.isInteger(tRaw) && tRaw >= 0 && tRaw < tc) {
      team = tRaw;
    } else {
      const { data: others } = await svc.from('qm_arena_players').select('team').eq('session_id', session.id);
      const counts: number[] = Array.from({ length: tc }, () => 0);
      for (const o of (others ?? []) as unknown as { team: number | null }[]) {
        if (o.team !== null && o.team >= 0 && o.team < tc) counts[o.team] = (counts[o.team] ?? 0) + 1;
      }
      let best = 0;
      for (let i = 1; i < tc; i++) if ((counts[i] ?? 0) < (counts[best] ?? 0)) best = i;
      team = best;
    }
  }

  // Sisipan pemain baharu. Nama berdaftar mencuba nama asas, kemudian
  // akhiran 2 hingga 9 (corak join Live); tetamu hanya sekali.
  const namaMain = daftar ? daftar.nama : nickname;
  const cubaan: string[] = daftar
    ? [namaMain, ...Array.from({ length: 8 }, (_, i) => namaAkhiran(namaMain, i + 2))]
    : [namaMain];

  const playerToken = makePlayerToken();
  let idPemain: string | null = null;
  let ralatAkhir: { code?: string; message?: string } | null = null;
  let namaDigunakan = namaMain;
  for (const calon of cubaan) {
    const { data: ins, error } = await svc
      .from('qm_arena_players')
      .insert({
        session_id: session.id,
        nickname: calon,
        player_token: playerToken,
        avatar,
        team,
        // KZ-045: markah ahli kelas dipautkan ke akaun.
        user_id: daftar ? daftar.userId : null,
      })
      .select('id')
      .single();
    if (!error && ins) {
      idPemain = (ins as unknown as { id: string }).id;
      namaDigunakan = calon;
      break;
    }
    ralatAkhir = error as { code?: string; message?: string };
    if (error?.code === '23505' && daftar) continue; // nama diambil: cuba akhiran
    break;
  }
  if (!idPemain) {
    if (ralatAkhir?.code === '23505') return ralatJson('Nickname taken', 409);
    return ralatJson('Could not join session', 500);
  }
  return NextResponse.json({ playerId: idPemain, playerToken, nickname: namaDigunakan });
}

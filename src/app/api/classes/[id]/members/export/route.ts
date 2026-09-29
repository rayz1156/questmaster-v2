import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { binaCsvPeserta, slugFail, type BarisPeserta } from '@/lib/csvPeserta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/members/export (V2-010)
 *
 * CSV peserta kelas untuk pendidik: ahli qm_class_members dengan nama dan
 * emel melalui RPC qm_user_directory dipanggil dengan klien Bearer pemanggil
 * (0045 memulangkan emel kepada educator kelas/pentadbir sahaja; jangan
 * guna service role untuk memintas semakan itu), ditambah jemputan tertunda
 * daripada qm_class_invites sebagai baris Invited.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;

  // Kelas tidak wujud: 404 generik, sama corak dengan requireClassMember.
  const { data: klass } = await supa
    .from('qm_classes')
    .select('id, name, owner_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!klass) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Pemanggil MESTI pemilik kelas, educator kelas (jemputan diterima) atau
  // pentadbir. semakPendidikKelas sudah merangkumi admin tidak digantung.
  const isOwner = klass.owner_id === user!.id;
  const ok = isOwner || (await semakPendidikKelas(supa, params.id, user!.id));
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Had kadar 10 permintaan seminit bagi setiap pengguna.
  if (!dalamHad(`members-export:${user!.id}`, 10)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  // Ahli kelas: klien Bearer, jadi RLS menyekat seperti semakan sedia ada.
  const { data: members, error: membersErr } = await supa
    .from('qm_class_members')
    .select('user_id, joined_at')
    .eq('class_id', params.id);
  if (membersErr) {
    return NextResponse.json({ error: membersErr.message }, { status: 500 });
  }

  // Nama dan emel melalui RPC direktori, dengan identiti pemanggil.
  const ids = (members || []).map((m: { user_id: string }) => m.user_id);
  const dirMap = new Map<string, { nama: string | null; emel: string | null }>();
  if (ids.length > 0) {
    const { data: dir, error: dirErr } = await supa.rpc('qm_user_directory', { p_ids: ids });
    if (dirErr) {
      return NextResponse.json({ error: dirErr.message }, { status: 500 });
    }
    for (const d of dir || []) {
      dirMap.set(String(d.user_id), { nama: d.display_name ?? null, emel: d.email ?? null });
    }
  }

  const baris: BarisPeserta[] = (members || []).map((m: { user_id: string; joined_at: string | null }) => {
    const dir = dirMap.get(m.user_id);
    return {
      nama: dir?.nama ?? null,
      emel: dir?.emel ?? null,
      status: 'Active' as const,
      joinedAt: m.joined_at,
    };
  });

  // Jemputan tertunda: ada emel, belum diterima, belum tamat. RLS
  // p_ci_owner/p_ci_educator membenarkan pemilik dan ko-pendidik yang
  // sudah terima jemputan membaca; tiada pengecualian diperlukan.
  const { data: invites, error: invitesErr } = await supa
    .from('qm_class_invites')
    .select('email')
    .eq('class_id', params.id)
    .is('accepted_at', null)
    .not('email', 'is', null)
    .or('expires_at.is.null,expires_at.gt.now()');
  if (invitesErr) {
    return NextResponse.json({ error: invitesErr.message }, { status: 500 });
  }
  for (const iv of invites || []) {
    baris.push({
      nama: null,
      emel: String(iv.email),
      status: 'Invited',
      joinedAt: null,
    });
  }

  const csv = binaCsvPeserta(baris);

  // Nama fail: slug ASCII daripada nama kelas, jadi tiada CR/LF atau
  // aksara berisiko boleh menembusi pengepala content-disposition.
  const tarikhFail = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const namaFail = `kuizen-${slugFail(String(klass.name ?? ''))}-participants-${tarikhFail.replace(/-/g, '')}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${namaFail}"`,
      'cache-control': 'no-store',
    },
  });
}

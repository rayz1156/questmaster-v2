/**
 * POST /api/classes/[id]/certificates/templates/from-library
 *
 * Guna item pustaka (galeri atau "Templat saya") dalam kelas ini
 * (V2-016a): cipta baris qm_certificate_templates baharu yang MERUJUK
 * fail latar/logo item pustaka (tiada salinan fail) dan membawa library_id.
 *
 * Body: { library_id, title?, criteria? }. Kriteria lalai all_members.
 *
 * Kebenaran: pemanggil pendidik kelas ini (semakPendidikKelas); item mesti
 * kelihatan kepada pemanggil (RLS pustaka). Item galeri yang bukan
 * free_tier memerlukan pelan berkesan PEMILIK kelas berbayar (402), selari
 * pencetus pelan: laluan galeri dibenarkan hanya jika item free_tier atau
 * pelan pemilik berbayar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { pelanSijilBerbayar, pelanPemilikKelas } from '@/lib/sijil/pelanSijil';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import { bacaKriteriaPustaka, type ItemPustaka } from '@/lib/sijil/pustaka';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LAJUR_ITEM =
  'id, scope, owner_id, title, kind, text_tone, background_path, logo_path, layout, free_tier, published, sort_order';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const libraryId = typeof body.library_id === 'string' ? body.library_id : '';

  if (!UUID.test(String(classId)) || !UUID.test(libraryId)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!dalamHad(`cert-lib-use:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Item mesti kelihatan kepada pemanggil (RLS: galeri diterbitkan atau
  // "Templat saya" milik sendiri; pentadbir nampak semua galeri).
  const { data: item } = await auth.supa
    .from('qm_certificate_library')
    .select(LAJUR_ITEM)
    .eq('id', libraryId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'Template not found or not published.' }, { status: 404 });
  }
  const itemPenuh = item as ItemPustaka;

  // Pelan berkesan PEMILIK kelas mengawal aset (pencetus 0052/0053):
  // galeri bukan free_tier dan laluan peribadi (library/) hanya untuk
  // pelan berbayar. Semak di sini supaya pengguna menerima 402 yang jelas
  // dan bukan latar yang dibuang secara senyap oleh pencetus.
  const pelanPemilik = await pelanPemilikKelas(auth.supa, classId);
  const asetPercuma =
    itemPenuh.scope === 'gallery'
    && itemPenuh.free_tier === true
    && !itemPenuh.background_path?.startsWith('library/')
    && !itemPenuh.logo_path?.startsWith('library/');
  if (!asetPercuma && !pelanSijilBerbayar(pelanPemilik)) {
    return NextResponse.json(
      { error: 'This template needs a Pro, Institution or Unlimited class plan.' },
      { status: 402 },
    );
  }

  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : itemPenuh.title.slice(0, 120);
  const criteria = bacaKriteriaPustaka(body.criteria) ?? { type: 'all_members' };

  // Sisipan melalui klien pengguna: RLS templat (pendidik kelas) dan
  // pencetus pelan (laluan gallery//library/) berkuat kuasa.
  const { data: template, error: insErr } = await auth.supa
    .from('qm_certificate_templates')
    .insert({
      class_id: classId,
      title,
      criteria,
      background_path: itemPenuh.background_path,
      logo_path: itemPenuh.logo_path,
      layout: normaliseSusunAtur(itemPenuh.layout),
      // Medan isian bermula kosong (V2-016b): nilai diisi setiap templat
      // kelas oleh pendidik, bukan diwarisi daripada item pustaka.
      fields: {},
      library_id: itemPenuh.id,
      created_by: userId,
    })
    .select('id, title, criteria, background_path, logo_path, layout, fields, library_id')
    .single();
  if (insErr || !template) {
    return NextResponse.json(
      { error: insErr?.message ?? 'Could not create the template.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ template }, { status: 201 });
}

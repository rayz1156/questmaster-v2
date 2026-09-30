/**
 * GET/POST /api/certificate-library
 *
 * Pustaka templat sijil (V2-016a).
 *   GET: item galeri diterbitkan (atau semua galeri untuk pentadbir) dan
 *        "Templat saya" milik pemanggil, melalui klien pengguna supaya RLS
 *        mengawal keterlihatan. Setiap item membawa preview_url (URL
 *        bertandatangan 10 minit untuk latar, dijana service role hanya
 *        selepas bacaan RLS lulus) dan locked (galeri bukan free_tier dan
 *        pelan pemanggil percuma).
 *   POST: simpan templat KELAS sedia ada ke "Templat saya": salin objek
 *        storan ke laluan library/<ownerId>/<libraryId>/ dan salin layout.
 *        Pelan berkesan PEMANGGIL mesti berbayar (402); had 50 item
 *        dikuatkuasakan pencetus (409 LIBRARY_LIMIT).
 *
 * Kebenaran GET: mana-mana pengguna sahih (RLS mengecilkan senarai).
 * Kebenaran POST: pendidik kelas asal (semakPendidikKelas).
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { pelanSijilBerbayar } from '@/lib/sijil/pelanSijil';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';
import { itemTerkunci, type ItemPustaka, type ItemPustakaApi, type JenisAset } from '@/lib/sijil/pustaka';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lajur item pustaka yang dibaca (senarai eksplisit, bukan select *). */
const LAJUR_ITEM =
  'id, scope, owner_id, title, kind, text_tone, background_path, logo_path, layout, free_tier, published, sort_order';

/** Umur URL pratonton latar. */
const SAAT_URL = 600;

/** Kriteria sah kind aset yang disalin ke pustaka peribadi. */
const JENIS_ASET: JenisAset[] = ['background', 'logo'];

/** Pelan berkesan pengguna; 'free' jika RPC gagal. */
async function pelanPemanggil(supa: import('@supabase/supabase-js').SupabaseClient, uid: string): Promise<string> {
  const { data, error } = await supa.rpc('qm_effective_plan', { p_user: uid });
  return !error && typeof data === 'string' ? data : 'free';
}

/** Bina item API dengan URL pratonton dan bendera locked. */
async function binaItemApi(
  svc: ReturnType<typeof getServiceSupabase>,
  item: ItemPustaka,
  pelan: string,
): Promise<ItemPustakaApi> {
  let previewUrl: string | null = null;
  if (item.background_path) {
    const { data: signed } = await svc.storage
      .from('certificate-assets')
      .createSignedUrl(item.background_path, SAAT_URL);
    previewUrl = signed?.signedUrl ?? null;
  }
  return { ...item, preview_url: previewUrl, locked: itemTerkunci(item, pelan) };
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  const pelan = await pelanPemanggil(auth.supa, userId);

  const [{ data: galeriData }, { data: milikData }] = await Promise.all([
    auth.supa
      .from('qm_certificate_library')
      .select(LAJUR_ITEM)
      .eq('scope', 'gallery')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
      .limit(200),
    auth.supa
      .from('qm_certificate_library')
      .select(LAJUR_ITEM)
      .eq('scope', 'personal')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  // URL bertandatangan dijana service role selepas RLS mengecilkan baris.
  const svc = getServiceSupabase();
  const galeri = await Promise.all(
    ((galeriData as ItemPustaka[] | null) ?? []).map((i) => binaItemApi(svc, i, pelan)),
  );
  const milik = await Promise.all(
    ((milikData as ItemPustaka[] | null) ?? []).map((i) => binaItemApi(svc, i, pelan)),
  );

  return NextResponse.json({ gallery: galeri, mine: milik });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fromTemplateId = typeof body.from_template_id === 'string' ? body.from_template_id : '';
  const classId = typeof body.class_id === 'string' ? body.class_id : '';

  if (!UUID.test(fromTemplateId) || !UUID.test(classId)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  if (!dalamHad(`cert-lib-save:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  // Pemanggil mesti pendidik kelas asal (templat hanya boleh dibaca pendidik
  // kelas melalui RLS qm_certificate_templates).
  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const template = await bacaTemplatKelas(auth.supa, fromTemplateId, classId);
  if (!template) {
    return NextResponse.json({ error: 'Certificate template not found.' }, { status: 404 });
  }

  // Pelan berkesan PEMANGGIL (bukan pemilik kelas): "Templat saya" milik
  // educator, boleh diguna merentas semua kelas yang dia urus.
  const pelan = await pelanPemanggil(auth.supa, userId);
  if (!pelanSijilBerbayar(pelan)) {
    return NextResponse.json(
      { error: 'My templates are available on Pro, Institution and Unlimited plans.' },
      { status: 402 },
    );
  }

  const tajukAsal =
    typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : template.title.slice(0, 120);

  // Sisipan melalui klien pengguna: RLS personal (owner_id = auth.uid())
  // dan pengawal pencetus (pelan, had 50) berkuat kuasa di pangkalan data.
  const { data: item, error: insErr } = await auth.supa
    .from('qm_certificate_library')
    .insert({
      scope: 'personal',
      owner_id: userId,
      title: tajukAsal,
      kind: null,
      text_tone: 'dark',
      background_path: null,
      logo_path: null,
      layout: normaliseSusunAtur(template.layout),
      created_by: userId,
    })
    .select(LAJUR_ITEM)
    .single();

  if (insErr || !item) {
    const msg = insErr?.message ?? '';
    if (msg.includes('LIBRARY_LIMIT')) {
      return NextResponse.json(
        { error: 'You can keep up to 50 personal templates. Delete one first.', code: 'LIBRARY_LIMIT' },
        { status: 409 },
      );
    }
    if (msg.includes('MY_TEMPLATE_PLAN')) {
      return NextResponse.json(
        { error: 'My templates are available on Pro, Institution and Unlimited plans.' },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: 'Could not save the template.' }, { status: 400 });
  }

  const idItem = (item as ItemPustaka).id;

  // Salin objek latar/logo ke ruang nama peribadi supaya item tidak
  // bergantung pada objek templat kelas (klien service role selepas semua
  // semakan lulus). Gagal salin memadam item baharu: lebih baik gagal
  // bersih daripada item tanpa latar yang dijanjikan.
  const svc = getServiceSupabase();
  const laluanBaharu: Partial<Record<JenisAset, string>> = {};
  try {
    for (const jenis of JENIS_ASET) {
      const lama = jenis === 'background' ? template.background_path : template.logo_path;
      if (!lama) continue;
      const { data: obj } = await svc.storage.from('certificate-assets').download(lama);
      if (!obj) continue;
      const ext = lama.toLowerCase().endsWith('.jpg') || lama.toLowerCase().endsWith('.jpeg') ? 'jpg' : 'png';
      const laluan = `library/${userId}/${idItem}/${jenis}-${randomBytes(8).toString('hex')}.${ext}`;
      const { error: upErr } = await svc.storage
        .from('certificate-assets')
        .upload(laluan, obj, { contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
      if (upErr) throw new Error(upErr.message);
      laluanBaharu[jenis] = laluan;
    }
  } catch {
    await auth.supa.from('qm_certificate_library').delete().eq('id', idItem).then(() => undefined, () => undefined);
    return NextResponse.json({ error: 'Could not copy the template images.' }, { status: 500 });
  }

  if (laluanBaharu.background || laluanBaharu.logo) {
    const { data: itemKini, error: updErr } = await auth.supa
      .from('qm_certificate_library')
      .update({
        ...(laluanBaharu.background ? { background_path: laluanBaharu.background } : {}),
        ...(laluanBaharu.logo ? { logo_path: laluanBaharu.logo } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', idItem)
      .select(LAJUR_ITEM)
      .single();
    if (updErr || !itemKini) {
      return NextResponse.json({ error: 'Could not attach the template images.' }, { status: 500 });
    }
    return NextResponse.json({ item: await binaItemApi(svc, itemKini as ItemPustaka, pelan) }, { status: 201 });
  }

  return NextResponse.json({ item: await binaItemApi(svc, item as ItemPustaka, pelan) }, { status: 201 });
}

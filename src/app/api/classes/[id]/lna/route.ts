/**
 * GET  /api/classes/[id]/lna: senarai LNA kelas.
 * POST /api/classes/[id]/lna: cipta LNA (guru sahaja).
 *
 * KZ-035. Guru (pemilik kelas atau ko-pendidik diterima) melihat semua
 * LNA kelas. Pelajar hanya melihat LNA yang ada pusingan terbuka, tanpa
 * POST menerima empat cara mengisi senarai item:
 *  - outcomeIds: Outcomes sedia ada kelas ini;
 *  - newOutcomes: label baharu (1 hingga 200 aksara) yang dicipta sebagai
 *    qm_learning_outcomes dalam kelas ini;
 *  - copyFromClassId: salin label/code/description Outcomes kelas lain
 *    yang guru ini juga gurunya;
 *  - freeItems (KZ-038): label item bebas, tiada Outcome; nyah-dup tidak
 *    sensitif huruf.
 * Jumlah item akhir mesti 3 hingga 15 (400 jika tidak). Susunan: sedia
 * ada, Outcome baharu, salinan, kemudian item bebas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, requireUser } from '@/lib/supabase-route';
import { bacaJsonKecil } from '@/lib/bilikAi';
import { perananKelas, sahUuid } from '@/lib/lnaAkses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface RoundRingkas {
  id: string;
  kind: string;
  status: string;
  opened_at?: string;
  closed_at?: string | null;
  qm_lna_responses?: { user_id: string }[];
}

interface LnaRingkas {
  id: string;
  title: string;
  created_at: string;
  qm_lna_rounds: RoundRingkas[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const classId = String(params.id ?? '');
  if (!sahUuid(classId)) {
    return NextResponse.json({ error: 'Not a valid class id.' }, { status: 400 });
  }

  const auth = await requireUser(_req);
  if (auth.response) return auth.response;
  const user = auth.user!;
  const svc = getServiceSupabase();

  const role = await perananKelas(svc, user.id, classId);
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await svc
    .from('qm_lna')
    .select(
      'id, title, created_at, qm_lna_rounds(id, kind, status, opened_at, closed_at, qm_lna_responses(user_id))',
    )
    .eq('class_id', classId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[lna] senarai gagal:', error.message);
    return NextResponse.json({ error: 'Senarai LNA tidak dapat dibaca.' }, { status: 500 });
  }

  const semua = (data ?? []) as unknown as LnaRingkas[];
  // Pelajar: hanya LNA yang ada pusingan terbuka, tanpa butiran lanjut.
  const senarai = role === 'teacher'
    ? semua
    : semua.filter((l) =>
        (l.qm_lna_rounds ?? []).some((r) => r.status === 'open'));

  // Bentuk paparan: kiraan responden setiap pusingan (pelajar berbeza).
  const bentuk = senarai.map((l) => ({
    id: l.id,
    title: l.title,
    createdAt: l.created_at,
    rounds: (l.qm_lna_rounds ?? []).map((r) => {
      const pengguna = new Set((r.qm_lna_responses ?? []).map((x) => x.user_id));
      return {
        id: r.id,
        kind: r.kind,
        status: r.status,
        openedAt: r.opened_at ?? null,
        closedAt: r.closed_at ?? null,
        responden: pengguna.size,
      };
    }),
  }));

  return NextResponse.json({ role, lna: bentuk });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const classId = String(params.id ?? '');
  if (!sahUuid(classId)) {
    return NextResponse.json({ error: 'Not a valid class id.' }, { status: 400 });
  }

  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const user = auth.user!;
  const svc = getServiceSupabase();

  const role = await perananKelas(svc, user.id, classId);
  if (role !== 'teacher') {
    return NextResponse.json(
      { error: 'Hanya guru boleh mencipta LNA.' },
      { status: 403 },
    );
  }

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const body = hasil.body;

  // Tajuk: 1 hingga 120 aksara (sama seperti CHECK jadual).
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 1 || title.length > 120) {
    return NextResponse.json(
      { error: 'Tajuk LNA mesti 1 hingga 120 aksara.' },
      { status: 400 },
    );
  }

  // Kumpul id outcome daripada sumber Outcome, dan label item bebas
  // (KZ-038) yang tidak menjadi Outcome.
  const idTerkumpul: string[] = [];
  const labelBaharu: string[] = [];
  const salinanKelasLain: { code: string | null; label: string; description: string | null }[] = [];
  const labelBebas: string[] = [];

  if (body.outcomeIds !== undefined) {
    if (!Array.isArray(body.outcomeIds)) {
      return NextResponse.json({ error: 'outcomeIds mesti senarai.' }, { status: 400 });
    }
    for (const x of body.outcomeIds) {
      if (typeof x !== 'string' || !sahUuid(x)) {
        return NextResponse.json({ error: 'outcomeIds mengandungi id tidak sah.' }, { status: 400 });
      }
      idTerkumpul.push(x);
    }
  }

  if (body.newOutcomes !== undefined) {
    if (!Array.isArray(body.newOutcomes)) {
      return NextResponse.json({ error: 'newOutcomes mesti senarai.' }, { status: 400 });
    }
    for (const x of body.newOutcomes) {
      if (typeof x !== 'string') {
        return NextResponse.json({ error: 'newOutcomes mesti senarai teks.' }, { status: 400 });
      }
      const label = x.trim();
      if (label.length < 1 || label.length > 200) {
        return NextResponse.json(
          { error: 'Setiap Outcome baharu mesti 1 hingga 200 aksara.' },
          { status: 400 },
        );
      }
      labelBaharu.push(label);
    }
  }

  if (body.copyFromClassId !== undefined) {
    const sumber = String(body.copyFromClassId);
    if (!sahUuid(sumber)) {
      return NextResponse.json({ error: 'copyFromClassId tidak sah.' }, { status: 400 });
    }
    // Kelas sumber mesti kelas yang guru ini juga gurunya.
    const perananSumber = await perananKelas(svc, user.id, sumber);
    if (perananSumber !== 'teacher') {
      return NextResponse.json(
        { error: 'Anda bukan guru kelas sumber.' },
        { status: 403 },
      );
    }
    const { data: outcomesSumber } = await svc
      .from('qm_learning_outcomes')
      .select('code, label, description')
      .eq('class_id', sumber)
      .order('code', { ascending: true, nullsFirst: false })
      .order('label', { ascending: true });
    for (const o of (outcomesSumber ?? []) as { code: string | null; label: string; description: string | null }[]) {
      salinanKelasLain.push({ code: o.code, label: o.label, description: o.description });
    }
  }

  if (body.freeItems !== undefined) {
    if (!Array.isArray(body.freeItems)) {
      return NextResponse.json({ error: 'freeItems mesti senarai.' }, { status: 400 });
    }
    // Nyah-dup tidak sensitif huruf: "Kemahiran A" dan "kemahiran a"
    // dianggap item yang sama.
    const dilihatBebas = new Set<string>();
    for (const x of body.freeItems) {
      if (typeof x !== 'string') {
        return NextResponse.json({ error: 'freeItems mesti senarai teks.' }, { status: 400 });
      }
      const label = x.trim();
      if (label.length < 1 || label.length > 200) {
        return NextResponse.json(
          { error: 'Setiap item bebas mesti 1 hingga 200 aksara.' },
          { status: 400 },
        );
      }
      const kunci = label.toLowerCase();
      if (dilihatBebas.has(kunci)) continue;
      dilihatBebas.add(kunci);
      labelBebas.push(label);
    }
  }

  // Outcome sedia ada mesti milik kelas ini (400 jika ada yang lain).
  if (idTerkumpul.length > 0) {
    const { data: sah } = await svc
      .from('qm_learning_outcomes')
      .select('id')
      .eq('class_id', classId)
      .in('id', idTerkumpul);
    const idsSah = new Set(((sah ?? []) as { id: string }[]).map((r) => r.id));
    for (const x of idTerkumpul) {
      if (!idsSah.has(x)) {
        return NextResponse.json(
          { error: 'Outcome tidak ditemui dalam kelas ini.' },
          { status: 400 },
        );
      }
    }
  }

  // Jumlah item akhir 3 hingga 15, dikira SEBELUM mencipta apa-apa
  // supaya LNA separuh jalan tidak wujud. Item bebas turut dikira.
  const jumlahItem =
    new Set(idTerkumpul).size + labelBaharu.length + salinanKelasLain.length
    + labelBebas.length;
  if (jumlahItem < 3 || jumlahItem > 15) {
    return NextResponse.json(
      { error: 'Jumlah item LNA mesti 3 hingga 15.' },
      { status: 400 },
    );
  }

  // Cipta Outcomes baharu (taip pantas + salinan kelas lain) dalam
  // kelas ini, kemudian LNA dan itemnya.
  const { data: lnaBaru, error: errLna } = await svc
    .from('qm_lna')
    .insert({ class_id: classId, title, created_by: user.id })
    .select('id, class_id, title, created_by, created_at, updated_at')
    .single();
  if (errLna || !lnaBaru) {
    console.error('[lna] cipta gagal:', errLna?.message);
    return NextResponse.json({ error: 'LNA tidak dapat dicipta.' }, { status: 500 });
  }

  // Kedudukan item mengikut susunan: sedia ada, taip baharu, salinan,
  // kemudian item bebas (KZ-038). Baris item Outcome membawa outcome_id;
  // baris item bebas membawa label.
  const barisItem: { lna_id: string; outcome_id?: string; label?: string; position: number }[] = [];
  const dilihat = new Set<string>();
  let kedudukan = 0;
  const tambah = (outcomeId: string) => {
    if (dilihat.has(outcomeId)) return; // nyah-dup tanpa mengubah susunan
    dilihat.add(outcomeId);
    kedudukan += 1;
    barisItem.push({ lna_id: String(lnaBaru.id), outcome_id: outcomeId, position: kedudukan });
  };
  for (const x of idTerkumpul) tambah(x);

  if (labelBaharu.length > 0 || salinanKelasLain.length > 0) {
    const benihan: { class_id: string; code: string | null; label: string; description: string | null; created_by: string }[] = [];
    for (const label of labelBaharu) {
      benihan.push({ class_id: classId, code: null, label, description: null, created_by: user.id });
    }
    for (const s of salinanKelasLain) {
      benihan.push({ class_id: classId, code: s.code, label: s.label, description: s.description, created_by: user.id });
    }
    const { data: outcomesBaru, error: errOutcomes } = await svc
      .from('qm_learning_outcomes')
      .insert(benihan)
      .select('id');
    if (errOutcomes || !outcomesBaru) {
      // Berbalik: padam LNA kosong supaya tiada LNA separuh jalan.
      await svc.from('qm_lna').delete().eq('id', String(lnaBaru.id));
      console.error('[lna] cipta outcomes gagal:', errOutcomes?.message);
      return NextResponse.json({ error: 'LNA tidak dapat dicipta.' }, { status: 500 });
    }
    for (const o of (outcomesBaru ?? []) as { id: string }[]) tambah(o.id);
  }

  // Item bebas (KZ-038): paling akhir, label sendiri tanpa Outcome.
  for (const label of labelBebas) {
    kedudukan += 1;
    barisItem.push({ lna_id: String(lnaBaru.id), label, position: kedudukan });
  }

  const { error: errItem } = await svc.from('qm_lna_items').insert(barisItem);
  if (errItem) {
    await svc.from('qm_lna').delete().eq('id', String(lnaBaru.id));
    console.error('[lna] cipta item gagal:', errItem.message);
    return NextResponse.json({ error: 'LNA tidak dapat dicipta.' }, { status: 500 });
  }

  return NextResponse.json({ lna: lnaBaru }, { status: 201 });
}

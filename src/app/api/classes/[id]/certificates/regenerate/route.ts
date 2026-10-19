/**
 * POST /api/classes/[id]/certificates/regenerate (KZ-029)
 *
 * Kemas kini reka bentuk sijil sedia ada: jana semula PDF sijil terpilih
 * dengan templat AKTIF kelas. Kod sijil, name_snapshot, issued_at, issued_by
 * dan emailed_at KEKAL; hanya template_id dan program_snapshot berubah
 * (melalui RPC qm_rebind_certificates), kemudian PDF dimuat naik semula ke
 * laluan sama `<class_id>/<code>.pdf` (upsert) supaya Resend selepas itu
 * melampirkan PDF baharu. Laluan emel TIDAK diubah.
 *
 * Semakan kebenaran dengan klien Bearer; klien service role digunakan
 * HANYA untuk bacaan baris sijil dan storage selepas kebenaran disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import {
  bacaTemplatKelas,
  janaSemulaPdfSijil,
  normaliseHasilRebind,
  tapiskanIdSijil,
  type BarisPdfSijil,
} from '@/lib/sijil/keluarkan';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// KZ-029: had kadar selari dengan laluan issue (20 seminit).
const HAD_REGEN = 20;
// Satu permintaan tidak boleh membawa lebih 50 id (selari dengan RPC).
const MAX_IDS = 50;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  if (!dalamHad(`cert-regen:${userId}`, HAD_REGEN)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const ids = tapiskanIdSijil(body.certificate_ids);
  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'certificate_ids is required.' },
      { status: 400 },
    );
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: 'Too many certificates in one request.' },
      { status: 400 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // RPC menyemak semula kebenaran, templat aktif, had dan konflik di dalam
  // pangkalan data. Id kelas lain dan sijil dibatalkan dikira skipped.
  const { data: rebind, error: rpcErr } = await auth.supa.rpc('qm_rebind_certificates', {
    p_class: classId,
    p_ids: ids,
  });
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  }
  const hasil = normaliseHasilRebind(rebind);
  const updatedIds = hasil?.updated_ids ?? [];
  const skipped = hasil?.skipped_count ?? 0;

  // Jana semula PDF untuk sijil yang berjaya dikemas kini. Gagal jana tidak
  // menggugurkan kemas kini data: pdf_path dibiarkan dan dikira failed.
  let gagal = 0;
  if (updatedIds.length > 0) {
    const svc = getServiceSupabase();
    const { data: aktif } = await svc
      .from('qm_certificate_templates')
      .select('id')
      .eq('class_id', classId)
      .eq('is_active', true)
      .maybeSingle();
    const template = aktif ? await bacaTemplatKelas(svc, aktif.id, classId) : null;
    if (template) {
      const { data: baris } = await svc
        .from('qm_certificates')
        .select('id, code, name_snapshot, program_snapshot, issued_at, issued_by')
        .in('id', updatedIds);
      // KZ-029: nama pengeluar PDF dibaca daripada issued_by sijil asal,
      // bukan daripada pendidik yang menekan butang ini.
      const pengeluarIds = Array.from(
        new Set((baris ?? []).map((r) => r.issued_by).filter((x): x is string => !!x)),
      );
      const namaPengeluar = new Map<string, string>();
      if (pengeluarIds.length > 0) {
        const { data: profil } = await svc
          .from('qm_profiles')
          .select('id, display_name')
          .in('id', pengeluarIds);
        for (const p of profil ?? []) {
          if (p.display_name) namaPengeluar.set(p.id, p.display_name);
        }
      }
      const barisPdf: BarisPdfSijil[] = (baris ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name_snapshot: r.name_snapshot,
        program_snapshot: r.program_snapshot,
        issued_at: r.issued_at,
        pengeluar: namaPengeluar.get(r.issued_by ?? ''),
      }));
      const pdf = await janaSemulaPdfSijil(svc, template, barisPdf);
      gagal = pdf.filter((h) => !h.pdf_path).length;
    } else {
      // Tiada templat aktif boleh dibaca (sangat luar jangka selepas RPC
      // berjaya): kira semua sebagai gagal jana PDF.
      gagal = updatedIds.length;
    }
  }

  return NextResponse.json({ updated: updatedIds.length, skipped, failed: gagal });
}

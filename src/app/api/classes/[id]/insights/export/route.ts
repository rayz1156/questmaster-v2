import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, requireUser } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { namaPaparanProfil } from '@/lib/bilikAi';
import {
  binaCsvInsights,
  namaFailInsights,
  separaBahagian,
  type BarisLnaEksport,
} from '@/lib/insightsCsv';
import { benderaKeyakinan, LABEL_BENDERA_LNA, senaraiMasteryDaripadaSummary } from '@/lib/lna';
import type { InsightsKelas } from '@/lib/insightsKelas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/classes/[id]/insights/export?sections=... (V2-014a)
 *
 * Eksport CSV Insights: satu bahagian (`students`, `attention`,
 * `questions`, `challenges`, `teams`, `trend`) atau `all`/senarai
 * berpisah koma. Satu bahagian memulangkan fail bahagian itu sahaja;
 * lebih satu atau semua memulangkan SATU fail dengan setiap bahagian
 * dipisahkan baris `# <Section name>` dan satu baris kosong. Tiada pakej
 * npm baharu (tiada zip).
 *
 * Kebenaran sama seperti /api/classes/[id]/insights: RPC qm_insights_kelas
 * dengan klien Bearer pemanggil. Rekod audit `insights_export` ditulis
 * melalui service role selepas RPC lulus (polisi qm_audit_log selepas
 * 0047 hanya membenarkan admin menyisip sendiri, jadi tulisan laluan
 * ialah satu-satunya cara educator direkodkan).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Tolak parameter bukan UUID (kzsec: IDOR pada [id]).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(String(params.id))) {
    return NextResponse.json({ error: 'Not a valid class id.' }, { status: 400 });
  }

  // Bahagian ditapis kepada senarai putih; sekurang-kurangnya satu sah.
  const url = new URL(req.url);
  const bahagian = separaBahagian(url.searchParams.get('sections'));
  if (bahagian.length === 0) {
    return NextResponse.json(
      { error: 'No valid sections. Use students, attention, questions, challenges, teams, trend, lna or all.' },
      { status: 400 },
    );
  }

  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;

  // Had kadar 10 eksport seminit bagi setiap pengguna, sama seperti eksport ahli.
  if (!dalamHad(`insights-export:${user!.id}`, 10)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  // Nama kelas untuk nama fail (slug). Kelas tidak wujud: 404 generik.
  const { data: klass } = await supa
    .from('qm_classes')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!klass) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Data dan kebenaran dalam satu panggilan RPC dengan klien pemanggil.
  const { data, error } = await supa.rpc('qm_insights_kelas', {
    p_class_id: params.id,
  });
  if (error) {
    if (error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('insights export rpc failed', error);
    return NextResponse.json({ error: 'Failed to export insights.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Failed to export insights.' }, { status: 500 });
  }
  const insights = data as InsightsKelas;

  // Bahagian LNA (KZ-035): datang daripada jadual qm_lna_*, bukan
  // qm_insights_kelas. Kebenaran guru sudah diluluskan oleh RPC di atas,
  // jadi bacaan di sini melalui service role selamat. Mastery dan bendera
  // diambil daripada qm_mastery_summary dengan klien Bearer pemanggil.
  let barisLna: BarisLnaEksport[] = [];
  if (bahagian.includes('lna')) {
    const svcLna = getServiceSupabase();
    const { data: lnaIds } = await svcLna
      .from('qm_lna')
      .select('id')
      .eq('class_id', params.id);
    const senaraiLna = (lnaIds ?? []) as { id: string }[];
    if (senaraiLna.length > 0) {
      const { data: roundsLna } = await svcLna
        .from('qm_lna_rounds')
        .select('id, kind')
        .in('lna_id', senaraiLna.map((l) => l.id));
      const pusinganLna = (roundsLna ?? []) as { id: string; kind: string }[];
      if (pusinganLna.length > 0) {
        // Item LNA (KZ-038): kunci item_id; item Outcome membawa
        // outcome_id, item bebas membawa label sendiri.
        const { data: itemsLna } = await svcLna
          .from('qm_lna_items')
          .select('id, outcome_id, label')
          .in('lna_id', senaraiLna.map((l) => l.id));
        const itemPeta = new Map<string, { label: string; outcomeId: string | null }>();
        for (const it of (itemsLna ?? []) as {
          id: string;
          outcome_id: string | null;
          label: string | null;
        }[]) {
          itemPeta.set(it.id, { label: it.label ?? '', outcomeId: it.outcome_id });
        }
        const { data: jawapanLna } = await svcLna
          .from('qm_lna_responses')
          .select('round_id, user_id, item_id, importance, current_level')
          .in('round_id', pusinganLna.map((r) => r.id));
        const jawapan = (jawapanLna ?? []) as {
          round_id: string;
          user_id: string;
          item_id: string;
          importance: number;
          current_level: number;
        }[];
        if (jawapan.length > 0) {
          // Label Outcome dan nama pelajar.
          const idsOutcome: string[] = [];
          for (const j of jawapan) {
            const it = itemPeta.get(j.item_id);
            if (it && it.outcomeId && idsOutcome.indexOf(it.outcomeId) < 0) {
              idsOutcome.push(it.outcomeId);
            }
          }
          const { data: outcomesLna } = await svcLna
            .from('qm_learning_outcomes')
            .select('id, label')
            .in('id', idsOutcome);
          const labelOutcome = new Map<string, string>();
          for (const o of (outcomesLna ?? []) as { id: string; label: string }[]) {
            labelOutcome.set(o.id, o.label);
          }
          const idsPelajar: string[] = [];
          for (const j of jawapan) {
            if (idsPelajar.indexOf(j.user_id) < 0) idsPelajar.push(j.user_id);
          }
          const nama = await namaPaparanProfil(svcLna, idsPelajar);

          // Mastery semasa (penguasaan sebenar) dengan klien pemanggil.
          const { data: masteryJson } = await supa.rpc('qm_mastery_summary', {
            p_class_id: params.id,
          });
          const mastery = senaraiMasteryDaripadaSummary(masteryJson);
          const masteryPeta = new Map<string, { pct: number | null; scored: number }>();
          for (const m of mastery) {
            masteryPeta.set(`${m.userId}|${m.outcomeId}`, {
              pct: m.masteryPct,
              scored: m.scored,
            });
          }

          const jenisPusingan = new Map<string, string>();
          for (const r of pusinganLna) {
            jenisPusingan.set(r.id, r.kind === 'pre' ? 'Pre' : 'Post');
          }

          barisLna = jawapan.map((j) => {
            const it = itemPeta.get(j.item_id)
              ?? { label: '', outcomeId: null };
            // Penguasaan dan bendera hanya bagi item Outcome; item
            // bebas (KZ-038) kekal kosong.
            const m = it.outcomeId != null
              ? masteryPeta.get(`${j.user_id}|${it.outcomeId}`)
              : undefined;
            const flag = benderaKeyakinan(
              j.current_level,
              m ? m.pct : null,
              m ? m.scored : 0,
            );
            return {
              nama: nama.get(j.user_id) ?? `User ${j.user_id.slice(0, 8)}`,
              outcome: it.outcomeId != null
                ? (labelOutcome.get(it.outcomeId) ?? '')
                : it.label,
              jenisItem: it.outcomeId != null ? 'Outcome' : 'Bebas',
              pusingan: jenisPusingan.get(j.round_id) ?? '',
              kepentingan: j.importance,
              tahapSemasa: j.current_level,
              masteryPct: m ? m.pct : null,
              bendera: flag ? LABEL_BENDERA_LNA[flag] : '',
            };
          });
        }
      }
    }
  }

  // CSV: BOM UTF-8 dan CRLF supaya Excel Windows selesa; pelindung suntikan
  // formula dan petikan RFC 4180 berada dalam insightsCsv (guna semula
  // csvPeserta), bukan disalin ke sini.
  const csv = binaCsvInsights(insights, bahagian, barisLna);
  const tarikhFail = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/-/g, '');
  const namaFail = namaFailInsights(String(klass.name ?? ''), bahagian, tarikhFail);

  // Rekod audit selepas kebenaran lulus: tindakan baharu insights_export
  // dengan class_id dan bahagian. Terbaik usaha: kegagalan audit tidak
  // membatalkan eksport, hanya dilog.
  try {
    const svc = getServiceSupabase();
    const { error: auditErr } = await svc.from('qm_audit_log').insert({
      actor_id: user!.id,
      action: 'insights_export',
      target_type: 'class',
      target_id: params.id,
      meta: { sections: bahagian },
    });
    if (auditErr) {
      console.error('insights export audit failed', auditErr);
    }
  } catch (e) {
    console.error('insights export audit threw', e);
  }

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${namaFail}"`,
      'cache-control': 'no-store',
    },
  });
}

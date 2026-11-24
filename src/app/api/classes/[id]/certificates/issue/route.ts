/**
 * POST /api/classes/[id]/certificates/issue
 *
 * Tanpa `confirm`: pratonton kelayakan daripada qm_certificate_eligibility.
 * Dengan `confirm: true`: keluarkan sijil melalui keluarkanSijil() dari
 * src/lib/sijil/keluarkan.ts (fungsi yang sama dipakai oleh alat MCP
 * issue_certificates), jana PDF untuk setiap sijil baharu, muat naik ke
 * bucket `certificates` pada `<class_id>/<code>.pdf` dan kemas kini
 * pdf_path.
 *
 * Semakan kebenaran sentiasa dengan klien Bearer; klien service role
 * digunakan HANYA untuk storage dan bacaan selepas kebenaran disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas, keluarkanSijil } from '@/lib/sijil/keluarkan';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { akaunDipadam, amaranSenarai, janaSemulaIkutTemplat } from '@/lib/sijil/namaSijil';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// KZ-011: had 20 seminit untuk setiap kunci, selaras dengan tiket.
const HAD_KELAYAKAN = 20;
const HAD_ISSUE = 20;
// KZ-011: satu permintaan pengeluaran tidak boleh membawa lebih 50 id.
const MAX_ID_PERMINTAAN = 50;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  const body = await req.json().catch(() => ({}));
  const templateId = typeof body.template_id === 'string' ? body.template_id : '';
  const confirm = body.confirm === true;
  let participantIds: string[] | null = Array.isArray(body.participant_ids)
    ? body.participant_ids.filter((x: unknown) => typeof x === 'string')
    : null;
  // KZ-E: pengecualian, ringkasan sahaja dan langkau akaun dipadam.
  const kecuali = new Set<string>(
    Array.isArray(body.exclude_participant_ids)
      ? body.exclude_participant_ids.filter((x: unknown) => typeof x === 'string')
      : [],
  );
  const ringkas = body.summary_only === true;
  if (!templateId) {
    return ralatJson('template_id is required.', 400);
  }
  // KZ-A: nama_overrides [{participant_id, certificate_name}] mengatasi nama
  // sijil untuk kelas ini. Pratonton: dipaparkan sahaja. confirm: disimpan
  // melalui qm_set_member_certificate_name (scope certificate) sebelum
  // sijil dikeluarkan, jadi nama itu kekal untuk sijil kelas ini.
  const overrides = new Map<string, string>();
  if (Array.isArray(body.name_overrides)) {
    for (const o of body.name_overrides as unknown[]) {
      const rec = (o ?? {}) as Record<string, unknown>;
      const pid = typeof rec.participant_id === 'string' ? rec.participant_id.trim() : '';
      const nm = typeof rec.certificate_name === 'string' ? rec.certificate_name.trim().replace(/\s+/g, ' ') : '';
      if (!pid || nm.length < 2 || nm.length > 120) {
        return ralatJson('Each name override needs participant_id and a certificate_name of 2 to 120 characters.', 400);
      }
      overrides.set(pid, nm);
    }
    if (overrides.size > MAX_ID_PERMINTAAN) {
      return ralatJson('Too many name overrides in one request.', 400);
    }
  }

  // KZ-011: kunci berasingan mengikut jenis permintaan; pratonton dan
  // pengeluaran tidak lagi berkongsi had yang sama.
  if (!confirm && !dalamHad(`cert-eligibility:${userId}`, HAD_KELAYAKAN)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429);
  }
  if (confirm) {
    if (participantIds && participantIds.length > MAX_ID_PERMINTAAN) {
      return ralatJson('Too many students in one request.', 400);
    }
    if (!dalamHad(`cert-issue:${userId}`, HAD_ISSUE)) {
      return ralatJson('Too many requests. Please wait a minute and try again.', 429);
    }
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) {
    return ralatJson('Forbidden', 403);
  }

  // Templat mesti milik kelas ini.
  const template = await bacaTemplatKelas(auth.supa, templateId, classId);
  if (!template) {
    return ralatJson('Certificate template not found.', 404);
  }

  // ------------------------------------------------------------------
  // Pratonton: tanpa confirm, pulangkan senarai kelayakan sahaja.
  // ------------------------------------------------------------------
  if (!confirm) {
    const { data, error } = await auth.supa.rpc('qm_certificate_eligibility', {
      p_template: templateId,
    });
    if (error) {
      return ralatJson(error.message, 400);
    }
    // KZ-A/KZ-E: amaran nama (belum disahkan, kurungan, pendek, gelaran,
    // dipadam, organisasi, nombor/garis bawah, pendua dalam kelas).
    const mentah = (data ?? []) as Record<string, unknown>[];
    const amaran = amaranSenarai(
      mentah.map((r) => {
        const pid = String(r.participant_id);
        const ganti = overrides.get(pid);
        return { participant_id: pid, nama: ganti ?? (r.certificate_name as string | null), disahkan: ganti ? true : r.name_confirmed === true };
      }),
    );
    type BarisPratonton = Record<string, unknown> & { warnings: ReturnType<typeof amaranSenarai> extends Map<string, infer V> ? V : never; excluded?: boolean };
    const preview = mentah.map((r): BarisPratonton => {
      const pid = String(r.participant_id);
      const ganti = overrides.get(pid);
      return {
        ...r,
        ...(ganti ? { certificate_name: ganti, name_confirmed: true, name_override: true } : {}),
        ...(kecuali.has(pid) ? { excluded: true } : {}),
        warnings: amaran.get(pid) ?? [],
      };
    });
    const sasaran = preview.filter((r) => !r.excluded && !akaunDipadam(String(r.certificate_name ?? '')));
    const namaBerisiko = sasaran.filter((r) => r.eligible === true && r.warnings.length > 0).length;
    if (ringkas) {
      const kira = (kod: string) => sasaran.filter((r) => r.warnings.some((w) => w.code === kod)).length;
      return NextResponse.json({
        summary: {
          participants: preview.length,
          eligible: sasaran.filter((r) => r.eligible === true).length,
          already_issued: sasaran.filter((r) => r.already_issued === true).length,
          to_issue: sasaran.filter((r) => r.eligible === true && r.already_issued !== true).length,
          excluded: preview.filter((r) => r.excluded).length,
          deleted_accounts: preview.filter((r) => akaunDipadam(String(r.certificate_name ?? ''))).length,
          name_warnings_count: namaBerisiko,
          warnings_by_code: Object.fromEntries(
            ['unconfirmed', 'short', 'brackets', 'nickname', 'organization', 'has_digits_or_underscore', 'duplicate', 'deleted'].map((k) => [k, kira(k)]),
          ),
        },
        // Hanya nama dengan amaran selain 'unconfirmed' (senarai pendek).
        flagged: sasaran
          .filter((r) => r.warnings.some((w) => w.code !== 'unconfirmed'))
          .map((r) => ({
            participant_id: r.participant_id,
            certificate_name: r.certificate_name,
            warnings: r.warnings.map((w) => w.code).filter((c) => c !== 'unconfirmed'),
          })),
      });
    }
    return NextResponse.json({ preview, name_warnings_count: namaBerisiko });
  }

  // ------------------------------------------------------------------
  // Pengeluaran: fungsi SQL menyemak semula kebenaran dan kelayakan.
  // ------------------------------------------------------------------
  // Semakan bebas KZ-A: sahkan semua override ahli kelas DAHULU, supaya
  // tiada nama disimpan bila satu override tidak sah.
  if (overrides.size > 0) {
    const { data: ahliOverride, error: ahliErr } = await auth.supa
      .from('qm_class_members')
      .select('user_id')
      .eq('class_id', classId)
      .in('user_id', Array.from(overrides.keys()));
    if (ahliErr) return ralatJson(ahliErr.message, 500);
    const sah = new Set((ahliOverride ?? []).map((r: { user_id: string }) => r.user_id));
    const bukanAhli = Array.from(overrides.keys()).filter((pid) => !sah.has(pid));
    if (bukanAhli.length > 0) {
      return ralatJson('Some name overrides are not members of this class. Nothing was saved or issued.', 400, {
        not_members: bukanAhli,
      });
    }
  }

  const gagalNama: { participant_id: string; error: string }[] = [];
  const disimpan: string[] = [];
  const idJanaSemula: string[] = [];
  for (const [pid, nm] of Array.from(overrides.entries())) {
    const { data: hasilNama, error } = await auth.supa.rpc('qm_set_member_certificate_name', {
      p_class: classId,
      p_user: pid,
      p_name: nm,
      p_scope: 'certificate',
    });
    if (error) {
      gagalNama.push({ participant_id: pid, error: error.message });
      continue;
    }
    disimpan.push(pid);
    const baris = Array.isArray(hasilNama) ? hasilNama[0] : hasilNama;
    for (const id of (baris?.certificate_ids ?? []) as string[]) idJanaSemula.push(id);
  }
  if (gagalNama.length > 0) {
    // Nama yang sudah disimpan kekal; PDF sijil sedia ada mereka dijana semula
    // supaya PDF dan halaman pengesahan tidak bercanggah.
    const pdfSebahagian = idJanaSemula.length > 0
      ? await janaSemulaIkutTemplat(getServiceSupabase(), classId, idJanaSemula)
      : null;
    return ralatJson('Some name overrides could not be saved. No certificates were issued.', 400, {
      name_override_errors: gagalNama,
      names_saved: disimpan,
      ...(pdfSebahagian ? { renamed_regenerated: pdfSebahagian.regenerated } : {}),
    });
  }

  // KZ-E: kecualikan peserta dan akaun dipadam ("[Deleted] ...") secara automatik.
  {
    const { data: layak } = await auth.supa.rpc('qm_certificate_eligibility', { p_template: templateId });
    const semua = ((layak ?? []) as { participant_id: string; certificate_name: string | null }[]);
    const tolak = new Set(semua.filter((r) => akaunDipadam(r.certificate_name)).map((r) => r.participant_id));
    kecuali.forEach((id) => tolak.add(id));
    if (tolak.size > 0) {
      const asas = participantIds ?? semua.map((r) => r.participant_id);
      participantIds = asas.filter((id) => !tolak.has(id));
      if (participantIds.length === 0) return NextResponse.json({ issued: 0, certificates: [], skipped: true });
      if (participantIds.length > MAX_ID_PERMINTAAN) participantIds = participantIds.slice(0, 500);
    }
  }

  try {
    const hasil = await keluarkanSijil(auth.supa, template, participantIds, userId);
    // Sijil sedia ada yang namanya baru ditukar: jana semula PDF.
    const janaSemula = idJanaSemula.length > 0
      ? await janaSemulaIkutTemplat(getServiceSupabase(), classId, idJanaSemula)
      : null;
    return NextResponse.json({
      issued: hasil.issued,
      certificates: hasil.certificates,
      ...(janaSemula ? { renamed_regenerated: janaSemula.regenerated, renamed_failed: janaSemula.failed } : {}),
      ...(hasil.skipped ? { skipped: true } : {}),
    });
  } catch (e) {
    return ralatJson(e instanceof Error ? e.message : 'Could not issue certificates.', 400);
  }
}

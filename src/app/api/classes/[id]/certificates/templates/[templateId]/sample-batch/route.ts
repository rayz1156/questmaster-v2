/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/sample-batch (KZ-A)
 *
 * Pratonton berkumpulan: satu panggilan untuk sehingga 20 nama contoh,
 * menggantikan panggilan preview_certificate berulang yang terkena had
 * kadar. Badan: { names: string[], mode?: "single_pdf" | "per_name" }.
 *   single_pdf (lalai): satu PDF berbilang halaman, satu halaman satu nama.
 *   per_name: satu URL PDF bagi setiap nama.
 * URL bertandatangan sah 10 minit dalam bucket `certificates` pada
 * samples/<class_id>/. TIADA rekod qm_certificates dicipta; kod contoh
 * CONTOH0000 tidak lulus pengesahan awam (sama dengan laluan sample).
 *
 * Kebenaran: pendidik kelas, templat milik kelas. Aset dimuat turun sekali
 * dengan service role HANYA selepas kebenaran disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { pelanSijilBerbayar, pelanPemilikKelas } from '@/lib/sijil/pelanSijil';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad, bakiSaat } from '@/lib/hadKadar';
import { janaPdfSijil } from '@/lib/sijil/janaPdf';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KOD_CONTOH = 'CONTOH0000';
const SAAT_URL = 600;
const MAX_NAMA = 20;
const HAD_BATCH = 10;

async function muatTurun(svc: ReturnType<typeof getServiceSupabase>, laluan: string | null | undefined) {
  if (!laluan) return undefined;
  try {
    const { data } = await svc.storage.from('certificate-assets').download(laluan);
    return data ? new Uint8Array(await data.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; templateId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  if (!UUID.test(String(classId)) || !UUID.test(String(params.templateId))) {
    return ralatJson('Not found.', 404);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nama = (Array.isArray(body.names) ? body.names : [])
    .filter((n): n is string => typeof n === 'string')
    .map((n) => n.trim().replace(/\s+/g, ' ').slice(0, 120))
    .filter(Boolean);
  if (nama.length === 0) return ralatJson('names is required.', 400);
  if (nama.length > MAX_NAMA) return ralatJson('At most 20 names per batch preview.', 400);
  const mode = body.mode === 'per_name' ? 'per_name' : 'single_pdf';

  const kunci = `cert-sample-batch:${userId}`;
  if (!dalamHad(kunci, HAD_BATCH)) {
    const saat = bakiSaat(kunci);
    const res = ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: saat });
    res.headers.set('Retry-After', String(saat));
    return res;
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return ralatJson('Forbidden', 403);

  const template = await bacaTemplatKelas(auth.supa, params.templateId, classId);
  if (!template) return ralatJson('Certificate template not found.', 404);

  const { data: kelas } = await auth.supa.from('qm_classes').select('name').eq('id', classId).maybeSingle();

  const svc = getServiceSupabase();
  const [latar, logo, tandatangan] = await Promise.all([
    muatTurun(svc, template.background_path),
    muatTurun(svc, template.logo_path),
    muatTurun(svc, template.signature_path),
  ]);
  const layout = normaliseSusunAtur(template.layout);
  const tera = !pelanSijilBerbayar(await pelanPemilikKelas(auth.supa, classId));
  const tarikh = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const pdfSetiap: Uint8Array[] = [];
  for (const n of nama) {
    pdfSetiap.push(
      await janaPdfSijil({
        nama: n,
        program: kelas?.name ?? 'Sample Program',
        tarikh,
        pengeluar: 'Sample Educator',
        kod: KOD_CONTOH,
        urlSah: `https://kuizen.fun/sijil/${KOD_CONTOH}`,
        latar,
        logo,
        tera,
        layout,
        medan: template.fields,
        tandatangan,
      }),
    );
  }

  async function simpan(bait: Uint8Array): Promise<string> {
    const namaFail = `samples/${classId}/${randomBytes(12).toString('hex')}.pdf`;
    const { error: upErr } = await svc.storage
      .from('certificates')
      .upload(namaFail, bait, { contentType: 'application/pdf' });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: signErr } = await svc.storage
      .from('certificates')
      .createSignedUrl(namaFail, SAAT_URL);
    if (signErr || !signed) throw new Error(signErr?.message ?? 'Could not sign the sample URL.');
    return signed.signedUrl;
  }

  try {
    if (mode === 'per_name') {
      const previews: { name: string; url: string }[] = [];
      for (let i = 0; i < nama.length; i += 1) {
        previews.push({ name: nama[i], url: await simpan(pdfSetiap[i]) });
      }
      return NextResponse.json({ mode, previews, expires_in: SAAT_URL });
    }
    const gabung = await PDFDocument.create();
    for (const bait of pdfSetiap) {
      const sumber = await PDFDocument.load(bait);
      const halaman = await gabung.copyPages(sumber, sumber.getPageIndices());
      for (const h of halaman) gabung.addPage(h);
    }
    const url = await simpan(await gabung.save());
    return NextResponse.json({ mode, url, pages: nama.length, names: nama, expires_in: SAAT_URL });
  } catch (e) {
    return ralatJson(e instanceof Error ? e.message : 'Could not create the batch preview.', 500);
  }
}

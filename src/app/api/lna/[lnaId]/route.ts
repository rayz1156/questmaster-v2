/**
 * PATCH  /api/lna/[lnaId]: ubah tajuk dan/atau senarai item (guru sahaja).
 * DELETE /api/lna/[lnaId]: padam LNA (guru sahaja).
 *
 * KZ-035. Senarai item hanya boleh diubah selagi tiada jawapan; selepas
 * itu susunan dan keahlian dikunci supaya laporan pusingan terdahulu
 * kekal bermakna. Padam bergantung pada on delete cascade (migrasi
 * 0070): item, pusingan dan jawapan turut padam.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bacaJsonKecil } from '@/lib/bilikAi';
import { aksesLna, ralatLna, sahUuid } from '@/lib/lnaAkses';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { lnaId: string } },
) {
  const akses = await aksesLna(req, String(params.lnaId ?? ''));
  if (akses.response) return akses.response;
  if (akses.role !== 'teacher') {
    return ralatLna(403, 'TEACHER_ONLY', 'Hanya guru boleh mengubah LNA.');
  }
  const supa = akses.supa!;
  const lna = akses.lna!;

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const body = hasil.body;

  const set: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      return ralatJson('Tajuk LNA mesti teks.', 400);
    }
    const title = body.title.trim();
    if (title.length < 1 || title.length > 120) {
      return ralatJson('Tajuk LNA mesti 1 hingga 120 aksara.', 400);
    }
    set.title = title;
  }

  // Ganti senarai item: Outcome dan/atau item bebas (KZ-038 menambah
  // freeItems pada bentuk yang sama). Hanya jika belum ada jawapan
  // dalam mana-mana pusingan LNA ini.
  if (body.outcomeIds !== undefined || body.freeItems !== undefined) {
    const ids: string[] = [];
    if (body.outcomeIds !== undefined) {
      if (!Array.isArray(body.outcomeIds) || body.outcomeIds.length === 0) {
        return ralatJson('outcomeIds mesti senarai tidak kosong.', 400);
      }
      for (const x of body.outcomeIds) {
        if (typeof x !== 'string' || !sahUuid(x)) {
          return ralatJson('outcomeIds mengandungi id tidak sah.', 400);
        }
        ids.push(x);
      }
    }
    const bebas: string[] = [];
    if (body.freeItems !== undefined) {
      if (!Array.isArray(body.freeItems)) {
        return ralatJson('freeItems mesti senarai.', 400);
      }
      // Nyah-dup tidak sensitif huruf (seperti POST cipta).
      const dilihatBebas = new Set<string>();
      for (const x of body.freeItems) {
        if (typeof x !== 'string') {
          return ralatJson('freeItems mesti senarai teks.', 400);
        }
        const label = x.trim();
        if (label.length < 1 || label.length > 200) {
          return ralatJson('Setiap item bebas mesti 1 hingga 200 aksara.', 400);
        }
        const kunci = label.toLowerCase();
        if (dilihatBebas.has(kunci)) continue;
        dilihatBebas.add(kunci);
        bebas.push(label);
      }
    }
    const unik = Array.from(new Set(ids));
    if (unik.length + bebas.length < 3 || unik.length + bebas.length > 15) {
      return ralatJson('Jumlah item LNA mesti 3 hingga 15.', 400);
    }
    // Semua outcome mesti milik kelas LNA ini.
    const { data: sah } = await supa
      .from('qm_learning_outcomes')
      .select('id')
      .eq('class_id', lna.class_id)
      .in('id', unik);
    const idsSah = new Set(((sah ?? []) as { id: string }[]).map((r) => r.id));
    for (const x of unik) {
      if (!idsSah.has(x)) {
        return ralatJson('Outcome tidak ditemui dalam kelas ini.', 400);
      }
    }
    // Kunci item: tiada jawapan dalam mana-mana pusingan LNA ini.
    const { data: pusingan } = await supa
      .from('qm_lna_rounds')
      .select('id')
      .eq('lna_id', lna.id);
    const idsPusingan = ((pusingan ?? []) as { id: string }[]).map((r) => r.id);
    if (idsPusingan.length > 0) {
      const { count } = await supa
        .from('qm_lna_responses')
        .select('round_id', { count: 'exact', head: true })
        .in('round_id', idsPusingan);
      if ((count ?? 0) > 0) {
        return ralatJson('Item tidak boleh diubah selepas ada jawapan pelajar.', 400);
      }
    }

    const { error: errPadam } = await supa
      .from('qm_lna_items')
      .delete()
      .eq('lna_id', lna.id);
    if (errPadam) {
      console.error('[lna] ganti item gagal (padam):', errPadam.message);
      return ralatJson('Item LNA tidak dapat diubah.', 500);
    }
    // Susunan sama seperti cipta: item Outcome dahulu, item bebas
    // kemudian (KZ-038).
    const baris: { lna_id: string; outcome_id?: string; label?: string; position: number }[] =
      unik.map((outcomeId, i) => ({
        lna_id: lna.id,
        outcome_id: outcomeId,
        position: i + 1,
      }));
    for (const label of bebas) {
      baris.push({
        lna_id: lna.id,
        label,
        position: baris.length + 1,
      });
    }
    const { error: errIsi } = await supa.from('qm_lna_items').insert(baris);
    if (errIsi) {
      console.error('[lna] ganti item gagal (isi):', errIsi.message);
      return ralatJson('Item LNA tidak dapat diubah.', 500);
    }
  }

  if (
    Object.keys(set).length === 0
    && body.outcomeIds === undefined
    && body.freeItems === undefined
  ) {
    return ralatJson('Tiada medan untuk dikemas kini.', 400);
  }

  if (Object.keys(set).length > 0) {
    set.updated_at = new Date().toISOString();
    const { error } = await supa
      .from('qm_lna')
      .update(set)
      .eq('id', lna.id);
    if (error) {
      console.error('[lna] kemas kini gagal:', error.message);
      return ralatJson('LNA tidak dapat dikemas kini.', 500);
    }
  }

  const { data: terkini } = await supa
    .from('qm_lna')
    .select('id, class_id, title, created_by, created_at, updated_at')
    .eq('id', lna.id)
    .maybeSingle();
  return NextResponse.json({ lna: terkini });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { lnaId: string } },
) {
  const akses = await aksesLna(req, String(params.lnaId ?? ''));
  if (akses.response) return akses.response;
  if (akses.role !== 'teacher') {
    return ralatLna(403, 'TEACHER_ONLY', 'Hanya guru boleh memadam LNA.');
  }
  const supa = akses.supa!;

  // on delete cascade memadam item, pusingan dan jawapan bersama LNA.
  const { error } = await supa
    .from('qm_lna')
    .delete()
    .eq('id', akses.lna!.id);
  if (error) {
    console.error('[lna] padam gagal:', error.message);
    return ralatJson('LNA tidak dapat dipadam.', 500);
  }
  return NextResponse.json({ ok: true });
}

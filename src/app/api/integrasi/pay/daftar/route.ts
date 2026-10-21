// KZ-031: POST /api/integrasi/pay/daftar (pelayan ke pelayan).
// Daftar pembeli kursus dari Veltrix Pay secara automatik dan idempoten,
// cipta akaun jika tiada, dan hantar e-mel pautan log masuk hanya bila
// pendaftaran baharu dicipta. Medan pilihan hantar_semula (temuan 2 CTO):
// bila true dan pendaftaran sedia ada dengan source 'pay', e-mel dihantar
// semula tertakluk kepada had 10 minit bagi setiap (kunci, e-mel, kursus).
// Respons tidak pernah mengandungi user_id atau pautan log masuk
// (elak pengambilalihan akaun).
import { NextRequest, NextResponse } from 'next/server';
import {
  benarkanEmelSemula,
  benarkanKadar,
  bacaBadanTerhad,
  contentTypeJson,
  hantarEmelAksesKursus,
  lamanUrl,
  sahkanBadanDaftar,
  sahkanKunciApi,
  tandaEmelDihantar,
  tandaKunciDigunakan,
} from '@/lib/integrasi-pay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // a. Sahkan kunci Bearer; semua kegagalan memulangkan 401 generik
    const kunci = await sahkanKunciApi(req);
    if (!kunci) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!benarkanKadar(kunci.id)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    // M-03: badan mesti application/json, selain itu 415
    if (!contentTypeJson(req)) {
      return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 });
    }

    // Had badan 8 KB, kemudian pengesahan medan
    const mentah = await bacaBadanTerhad(req);
    if (!mentah.ok) return NextResponse.json({ error: mentah.ralat }, { status: 400 });
    const semak = sahkanBadanDaftar(mentah.data);
    if (!semak.ok) return NextResponse.json({ error: semak.ralat }, { status: 400 });
    const badan = semak.badan;

    const { getServiceSupabase } = await import('@/lib/supabase-route');
    const db = getServiceSupabase();

    // b. Kursus mesti milik pemilik kunci dan diterbitkan; 404 generik
    //    supaya kewujudan kursus orang lain tidak dibocorkan.
    const { data: pencipta } = await db
      .from('lms_creators')
      .select('id')
      .eq('owner_id', kunci.user_id)
      .maybeSingle();
    const { data: kursus } = pencipta
      ? await db
          .from('lms_courses')
          .select('id, title')
          .eq('id', badan.course_id)
          .eq('creator_id', pencipta.id)
          .eq('is_published', true)
          .maybeSingle()
      : { data: null };
    if (!kursus) {
      await tandaKunciDigunakan(kunci.id);
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // c. Cari pengguna mengikut e-mel; cipta jika tiada.
    //    Trigger on_auth_user_created_lms mencipta lms_profiles.
    let penggunaId: string | null = null;
    let akaunBaharu = false;
    const { data: ditemui } = await db.rpc('lms_pay_cari_pengguna', { p_email: badan.email });
    penggunaId = typeof ditemui === 'string' ? ditemui : null;

    if (!penggunaId) {
      const { data: cipta, error: ralatCipta } = await db.auth.admin.createUser({
        email: badan.email,
        email_confirm: true,
        user_metadata: { name: badan.nama, role: 'participant' },
      });
      if (ralatCipta && !cipta?.user) {
        // Lumba dengan pendaftaran lain: e-mel mungkin baru sahaja dicipta
        if (/already (registered|exists)/i.test(ralatCipta.message)) {
          const { data: semula } = await db.rpc('lms_pay_cari_pengguna', { p_email: badan.email });
          penggunaId = typeof semula === 'string' ? semula : null;
        }
        if (!penggunaId) {
          // L-01: log kod atau status sahaja; mesej ralat mungkin mengandungi e-mel
          console.error(
            'KZ-031 daftar: gagal cipta pengguna',
            ralatCipta.code ?? ralatCipta.status ?? 'tiada kod',
          );
          return NextResponse.json({ error: 'Server error' }, { status: 500 });
        }
      } else if (cipta?.user) {
        penggunaId = cipta.user.id;
        akaunBaharu = true;
      }
    }
    if (!penggunaId) {
      console.error('KZ-031 daftar: pengguna tidak dikenal pasti selepas cari/cipta');
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    // d. Pendaftaran idempoten: ON CONFLICT (user_id, course_id) DO NOTHING.
    //    Baris kosong bermaksud pendaftaran sudah wujud (sedia_ada).
    const { data: didaftar, error: ralatDaftar } = await db
      .from('lms_enrollments')
      .upsert(
        {
          user_id: penggunaId,
          course_id: badan.course_id,
          source: 'pay',
          assignment_type: 'self',
          amount_cents: badan.amaun_sen,
          currency: badan.mata_wang,
          pay_order_ref: badan.rujukan_pesanan,
        },
        { onConflict: 'user_id,course_id', ignoreDuplicates: true },
      )
      .select('id');
    if (ralatDaftar) {
      console.error('KZ-031 daftar: ralat insert pendaftaran', ralatDaftar.message);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    const baharu = Array.isArray(didaftar) && didaftar.length > 0;

    // e. E-mel akses: pasti bila pendaftaran baharu dicipta. Bila sedia_ada,
    //    hanya dihantar semula bila hantar_semula true, pendaftaran sedia ada
    //    dengan source 'pay', dan had 10 minit bagi (kunci, e-mel, kursus)
    //    dibenarkan. Pautan magic link dihantar terus ke e-mel pembeli,
    //    tidak pernah dipulangkan dalam respons API.
    let emelDihantar = false;
    const pengenalEmel = `${kunci.id}:${badan.email}:${badan.course_id}`;
    let layakSemula = false;
    if (!baharu && badan.hantar_semula) {
      const { data: sediaPay } = await db
        .from('lms_enrollments')
        .select('id')
        .eq('user_id', penggunaId)
        .eq('course_id', badan.course_id)
        .eq('source', 'pay')
        .maybeSingle();
      layakSemula = !!sediaPay && benarkanEmelSemula(pengenalEmel);
    }
    if (baharu || layakSemula) {
      if (baharu) tandaEmelDihantar(pengenalEmel);
      const { data: pautan, error: ralatPautan } = await db.auth.admin.generateLink({
        type: 'magiclink',
        email: badan.email,
        options: { redirectTo: `${lamanUrl()}/learn/${badan.course_id}` },
      });
      const url = pautan?.properties?.action_link;
      if (ralatPautan || !url) {
        // L-01: log kod atau status sahaja; mesej ralat mungkin mengandungi e-mel
        console.error(
          'KZ-031 daftar: gagal jana pautan log masuk',
          ralatPautan?.code ?? ralatPautan?.status ?? 'tiada kod',
        );
      } else {
        emelDihantar = await hantarEmelAksesKursus({
          kepada: badan.email,
          nama: badan.nama,
          tajukKursus: kursus.title,
          loginUrl: url,
          akaunBaharu,
        });
      }
    }

    // g. Kemas kini last_used_at kunci
    await tandaKunciDigunakan(kunci.id);

    // f. Respons tanpa user_id dan tanpa pautan
    return NextResponse.json({
      status: baharu ? 'didaftar' : 'sedia_ada',
      akaun_baharu: akaunBaharu,
      emel_dihantar: emelDihantar,
    });
  } catch (e) {
    console.error('KZ-031 daftar: ralat tidak dijangka', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

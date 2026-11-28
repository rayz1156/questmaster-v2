import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import { muatKuizSolo, semakMasukSolo } from '@/lib/lumba-solo-api';
import { muatPelan } from '@/lib/kajian-solo-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * POST /api/solo/[code]/consent, badan { agree: boolean, version: number }.
 *
 * KZ-UTT Fasa 4: rekod keputusan persetujuan kajian peserta yang log masuk.
 * Menolak (agree=false) tidak menghalang peserta bermain: data mereka cuma
 * tidak dieksport dan mereka tidak menerima e-mel susulan. `version` mesti
 * sama dengan versi teks semasa, supaya persetujuan sentiasa merujuk teks
 * yang benar-benar dipaparkan. Keputusan baharu memadam tarik diri dan
 * berhenti langganan yang lama, kerana ia pilihan sedar peserta yang terkini.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const kuiz = await muatKuizSolo(svc, params.code);
  if (!kuiz || !kuiz.test_mode) return ralatJson('Challenge not found.', 404);

  const masuk = await semakMasukSolo(req, svc, kuiz);
  if (masuk.response) return masuk.response;
  if (!masuk.user) return ralatJson('Sign in to take this test.', 401, { code: 'LOGIN_REQUIRED' });

  const pelan = await muatPelan(svc, kuiz.id);
  if (!pelan?.consent_text) return ralatJson('This test has no research consent.', 409);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (typeof body.agree !== 'boolean') return ralatJson('agree must be true or false.', 400);
  if (Number(body.version) !== pelan.consent_version) {
    return ralatJson('The consent text has changed. Please read it again.', 409, { code: 'CONSENT_CHANGED' });
  }

  const { error } = await svc.from('qm_research_consents').upsert(
    {
      quiz_id: kuiz.id,
      user_id: masuk.user.id,
      decision: body.agree ? 'agree' : 'decline',
      consent_version: pelan.consent_version,
      decided_at: new Date().toISOString(),
      withdrawn_at: null,
      unsubscribed_at: null,
    },
    { onConflict: 'quiz_id,user_id' },
  );
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true, decision: body.agree ? 'agree' : 'decline' });
}

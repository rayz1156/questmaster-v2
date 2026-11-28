/** KZ-C: bahagian Node sahaja bagi instrumentation.ts. */
import { mulaPekerja } from '@/lib/sijil/pekerjaEmel';
import { mulaPerancang } from '@/lib/kajian-solo-perancang';

if (process.env.NEXT_PHASE !== 'phase-production-build') {
  // Tunda sedikit supaya pelayan siap mendengar dahulu.
  setTimeout(() => {
    try {
      mulaPekerja();
    } catch (e) {
      console.error('[emel-sijil] pekerja gagal dimulakan:', e);
    }
    // KZ-UTT Fasa 4: perancang e-mel susulan T2 dan T3, setiap minit.
    try {
      mulaPerancang();
    } catch (e) {
      console.error('[kajian] perancang gagal dimulakan:', e);
    }
  }, 5_000);
}

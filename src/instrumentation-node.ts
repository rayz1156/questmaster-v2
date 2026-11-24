/** KZ-C: bahagian Node sahaja bagi instrumentation.ts. */
import { mulaPekerja } from '@/lib/sijil/pekerjaEmel';

if (process.env.NEXT_PHASE !== 'phase-production-build') {
  // Tunda sedikit supaya pelayan siap mendengar dahulu.
  setTimeout(() => {
    try {
      mulaPekerja();
    } catch (e) {
      console.error('[emel-sijil] pekerja gagal dimulakan:', e);
    }
  }, 5_000);
}

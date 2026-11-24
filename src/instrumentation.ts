/**
 * KZ-C: mulakan pekerja baris gilir e-mel sijil bila pelayan Node bermula,
 * supaya baris yang tertinggal selepas pm2 restart diteruskan tanpa
 * menunggu panggilan API seterusnya.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { mulaPekerja } = await import('@/lib/sijil/pekerjaEmel');
  // Tunda sedikit supaya pelayan siap mendengar dahulu.
  setTimeout(() => {
    try {
      mulaPekerja();
    } catch (e) {
      console.error('[emel-sijil] pekerja gagal dimulakan:', e);
    }
  }, 5_000);
}

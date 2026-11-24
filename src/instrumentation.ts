/**
 * KZ-C: mulakan pekerja baris gilir e-mel sijil bila pelayan Node bermula,
 * supaya baris yang tertinggal selepas pm2 restart diteruskan tanpa
 * menunggu panggilan API seterusnya.
 *
 * Corak rasmi Next.js: import kod Node dalam blok bersyarat NEXT_RUNTIME
 * supaya bundle edge tidak menarik nodemailer (fs, stream, path).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}

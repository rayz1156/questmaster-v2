/**
 * Jadual terjemahan mesej ralat API (KZ-043 A5).
 *
 * Kunci ialah rentetan English TEPAT seperti yang ditulis dalam kod laluan
 * API. Rentetan yang tiada di sini dipulangkan tanpa ubah, jadi mesej
 * mesin (contoh ralat Supabase) dan kod ralat tidak pernah diterjemah.
 * Mesej ditambah dalam Bahagian B setelah set literal diimbas.
 */

export const RALAT_MS: Record<string, string> = {
  // Ralat am (KZ-043 glosari).
  'Forbidden': 'Akses ditolak.',
  'Unauthorized': 'Tidak dibenarkan.',
  'Not authed': 'Tidak dibenarkan.',
  'Not found': 'Tidak ditemui.',
  'Invalid request body': 'Badan permintaan tidak sah.',
  'Invalid language': 'Bahasa tidak sah.',
  'Failed to save language preference': 'Gagal menyimpan pilihan bahasa.',
};

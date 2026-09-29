/**
 * Logik penyegerakan nama profil (tiket V2-009).
 *
 * Nama pada kad Intro (intro_display_name) mesti segerakkan nama akaun
 * (display_name) supaya senarai kelas, papan pendahulu, Kuiz Langsung dan
 * sijil menunjukkan nama yang sama. Fail ini tulen (tanpa import) supaya
 * boleh diuji oleh scripts/selftest-nama-profil.ts tanpa klien Supabase.
 */

export type KemasKiniNamaIntro = {
  /** Nilai baru lajur qm_profiles.intro_display_name */
  intro_display_name: string | null;
  /** Nilai baru lajur qm_profiles.display_name; undefined bermakna JANGAN ubah */
  display_name?: string;
};

/**
 * Kira payload kemas kini untuk updateMyIntroDisplayName.
 *
 * Nama bukan kosong: kedua-dua lajur ditulis dengan nilai yang sama (had
 * 80 aksara). Nama kosong: hanya intro_display_name ditetapkan NULL; nama
 * akaun (display_name) TIDAK dikosongkan.
 */
export function kiraKemasKiniNamaIntro(name: string): KemasKiniNamaIntro {
  const trimmed = (name || '').trim();
  if (trimmed.length === 0) {
    return { intro_display_name: null };
  }
  const value = trimmed.slice(0, 80);
  return { intro_display_name: value, display_name: value };
}

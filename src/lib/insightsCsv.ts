/**
 * Binaan CSV eksport Insights kelas (tiket V2-014a) daripada JSON
 * `qm_insights_kelas`. Logik tulen tanpa akses pangkalan data supaya boleh
 * diuji dengan `npx tsx scripts/selftest-insights-csv.ts`.
 *
 * Pelindung suntikan formula (lindungFormula) dan pengkodan RFC 4180
 * (petikCsv) diguna semula dari src/lib/csvPeserta.ts supaya tingkah laku
 * konsisten dengan eksport peserta; tiada salinan formula di sini.
 */
import { lindungFormula, petikCsv, slugFail } from './csvPeserta';
import {
  BAHAGIAN_INSIGHTS,
  labelBendera,
  type InsightsKelas,
} from './insightsKelas';

/** Nama paparan setiap bahagian dalam baris tajuk `# <Section name>`. */
export const NAMA_BAHAGIAN: Record<string, string> = {
  students: 'Students',
  attention: 'Attention',
  questions: 'Questions',
  challenges: 'Challenges',
  teams: 'Teams',
  trend: 'Trend',
};

/**
 * Asahkan parameter `sections`: pecahkan ikut koma, kecilkan huruf, buang
 * ruang dan entri tidak sah, nyah-dup tanpa mengubah susunan. `all`
 * mengembangkan kepada keenam-enam bahagian. Pulangkan tatasusunan kosong
 * bila tiada bahagian sah (laluan API menolak dengan 400).
 */
export function separaBahagian(raw: string | null | undefined): string[] {
  const senarai = String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (senarai.includes('all')) return [...BAHAGIAN_INSIGHTS];
  const sah = senarai.filter((s) =>
    (BAHAGIAN_INSIGHTS as readonly string[]).includes(s),
  );
  return Array.from(new Set(sah));
}

/**
 * Nama fail eksport: satu bahagian `kuizen-insights-<slug>-<bahagian>-<tarikh>.csv`,
 * lebih satu bahagian atau semua `kuizen-insights-<slug>-all-<tarikh>.csv`.
 * slugFail menanggalkan aksara berisiko daripada nama kelas.
 */
export function namaFailInsights(
  namaKelas: string,
  bahagian: readonly string[],
  tarikhFail: string,
): string {
  const slug = slugFail(namaKelas);
  const hujung =
    bahagian.length === 1 ? String(bahagian[0]) : 'all';
  return `kuizen-insights-${slug}-${hujung}-${tarikhFail}.csv`;
}

/** Medan teks CSV: pelindung formula dahulu, kemudian petikan RFC 4180. */
function teks(v: string | null | undefined): string {
  return petikCsv(lindungFormula(String(v ?? '')));
}

/** Integer sebagai teks; nilai null atau rosak menjadi 0. */
function nombor(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.trunc(v)) : '0';
}

/** Nilai 1 titik perpuluhan; NULL menjadi medan kosong, bukan sifar. */
function peratus(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '';
}

/** Milisacond kepada saat 1 titik perpuluhan; NULL kosong. */
function saat(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return (v / 1000).toFixed(1);
}

/** Tarikh ISO penuh zon Asia/Kuala_Lumpur: 2026-09-30T15:04:05. */
export function masaKl(iso: string | null | undefined): string {
  return formatKl(iso, 'saat');
}

/** Tarikh dan jam zon Asia/Kuala_Lumpur untuk lajur trend: 2026-09-30 15:04. */
export function jamKl(iso: string | null | undefined): string {
  return formatKl(iso, 'minit');
}

function formatKl(iso: string | null | undefined, jit: 'saat' | 'minit'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pilihan: Intl.DateTimeFormatOptions = jit === 'saat'
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
  // sv-SE menghasilkan YYYY-MM-DD HH:mm[:ss] secara langsung.
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kuala_Lumpur',
    ...pilihan,
  }).format(d);
  return jit === 'saat' ? s.replace(' ', 'T') : s;
}

/** Pilihan salah paling kerap sebagai teks: label (kunci), atau kunci sahaja. */
function teksPilihanSalah(p: { key: string; label: string | null } | null): string {
  if (!p) return '';
  return p.label ? `${p.label} (${p.key})` : p.key;
}

/** Baris pelajar disusun ikut kedudukan kemudian nama. */
function pelajarSusun(data: InsightsKelas) {
  return [...data.students].sort((a, b) =>
    a.rank - b.rank || String(a.name ?? '').localeCompare(String(b.name ?? '')) ||
    (a.user_id < b.user_id ? -1 : 1),
  );
}

function barisStudents(data: InsightsKelas): string[] {
  const tajuk =
    'Rank,Name,Team,Activities,Live Quiz,Adjustments,Total,Live sessions,Answered,Correct,Accuracy %,Avg time (s),Approved,Pending,Rejected,Last active,Flags';
  const baris = pelajarSusun(data).map((s) =>
    [
      nombor(s.rank),
      teks(s.name),
      teks(s.team_name),
      nombor(s.task_score),
      nombor(s.live_score),
      nombor(s.adjustment_score),
      nombor(s.total_score),
      nombor(s.live_sessions),
      nombor(s.answered),
      nombor(s.correct),
      peratus(s.accuracy_pct),
      saat(s.avg_ms),
      nombor(s.approved),
      nombor(s.pending),
      nombor(s.rejected),
      petikCsv(masaKl(s.last_active)),
      teks(labelBendera(s.flags)),
    ].join(','),
  );
  return [tajuk, ...baris];
}

function barisAttention(data: InsightsKelas): string[] {
  const tajuk = 'Name,Flags,Total,Last active';
  const baris = pelajarSusun(data)
    .filter((s) => s.flags.length > 0)
    .map((s) =>
      [teks(s.name), teks(labelBendera(s.flags)), nombor(s.total_score), petikCsv(masaKl(s.last_active))].join(','),
    );
  return [tajuk, ...baris];
}

function barisQuestions(data: InsightsKelas): string[] {
  const tajuk = 'Quiz,Question,Answered,Correct %,Avg time (s),Most common wrong answer,Count';
  const baris = data.hard_questions.map((q) =>
    [
      teks(q.quiz_title),
      teks(q.prompt),
      nombor(q.answered),
      peratus(q.correct_pct),
      saat(q.avg_ms),
      teks(teksPilihanSalah(q.top_wrong_choice)),
      nombor(q.top_wrong_choice ? q.top_wrong_choice.count : 0),
    ].join(','),
  );
  return [tajuk, ...baris];
}

function barisChallenges(data: InsightsKelas): string[] {
  const tajuk = 'Activity,Challenge,Submitted,Approved,Rejected,Rejected %,Pending';
  const baris = data.hard_challenges.map((c) =>
    [
      teks(c.hunt_title),
      teks(c.title),
      nombor(c.submitted),
      nombor(c.approved),
      nombor(c.rejected),
      peratus(c.rejected_pct),
      nombor(c.pending),
    ].join(','),
  );
  return [tajuk, ...baris];
}

function barisTeams(data: InsightsKelas): string[] {
  const tajuk = 'Team,Members,Total,Avg per member,Top member share %,Members with 0,Unbalanced';
  const baris = data.teams.map((t) =>
    [
      teks(t.name),
      nombor(t.members),
      nombor(t.total_score),
      peratus(t.avg_per_member),
      peratus(t.top_member_share_pct),
      nombor(t.zero_members),
      t.flag_unbalanced ? 'Yes' : 'No',
    ].join(','),
  );
  return [tajuk, ...baris];
}

function barisTrend(data: InsightsKelas): string[] {
  // Lajur sesi ialah gabungan sesi ended yang dimainkan mana-mana ahli,
  // disusun ikut masa; tajuk lajur `<quiz> <YYYY-MM-DD HH:mm>`.
  const sesiPeta = new Map<string, { tajuk: string; kunci: string }>();
  for (const s of data.students) {
    for (const t of s.trend) {
      if (!sesiPeta.has(t.session_id)) {
        sesiPeta.set(t.session_id, {
          tajuk: `${t.quiz_title} ${jamKl(t.session_ended_at ?? t.played_at)}`,
          kunci: t.session_ended_at ?? t.played_at,
        });
      }
    }
  }
  // Array.from (bukan spread) kerana iterator Map memerlukan
  // downlevelIteration pada target TS projek ini.
  const sesi = Array.from(sesiPeta.entries())
    .map(([id, v]) => ({ id, tajuk: v.tajuk, kunci: v.kunci }))
    .sort((a, b) => (a.kunci < b.kunci ? -1 : a.kunci > b.kunci ? 1 : a.id < b.id ? -1 : 1));

  const tajuk = ['Name', ...sesi.map((s) => teks(s.tajuk))].join(',');
  const baris = pelajarSusun(data).map((s) => {
    const sel = sesi.map((ses) => {
      const t = s.trend.find((x) => x.session_id === ses.id);
      return peratus(t ? t.pct : null);
    });
    return [teks(s.name), ...sel].join(',');
  });
  return [tajuk, ...baris];
}

/**
 * Bina kandungan CSV penuh (BOM UTF-8, CRLF). Satu bahagian: baris tajuk
 * bahagian itu sahaja. Lebih satu bahagian: setiap bahagian didahului
 * baris `# <Section name>` dan dipisahkan satu baris kosong supaya Excel
 * boleh membuka fail tunggal tersebut.
 */
export function binaCsvInsights(data: InsightsKelas, bahagian: readonly string[]): string {
  const bina: Record<string, () => string[]> = {
    students: () => barisStudents(data),
    attention: () => barisAttention(data),
    questions: () => barisQuestions(data),
    challenges: () => barisChallenges(data),
    teams: () => barisTeams(data),
    trend: () => barisTrend(data),
  };

  const sah = bahagian.filter((b) => bina[b] != null);
  if (sah.length === 1) {
    return '\uFEFF' + bina[sah[0]]().join('\r\n') + '\r\n';
  }
  const blok = sah.map((b) => ['# ' + (NAMA_BAHAGIAN[b] ?? b), ...bina[b]()].join('\r\n'));
  return '\uFEFF' + blok.join('\r\n\r\n') + '\r\n';
}

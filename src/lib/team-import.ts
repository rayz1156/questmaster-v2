/**
 * Pecah dan sahkan CSV import kumpulan (sub-tab Teams pada skrin People).
 *
 * Corak sama dengan parseQuizCsv dalam src/lib/live-quiz.ts: semua baris
 * disahkan dahulu. Jika ada ralat, pemanggil MESTI tidak menulis apa apa,
 * supaya muat naik boleh diulang tanpa kumpulan separuh jadi.
 */
import { parseCsvRows, detectCsvDelimiter, type QuizCsvError } from '@/lib/live-quiz';

/** Had muat naik: cukup besar untuk kelas sebenar, kecil untuk nginx (1 MB). */
export const TEAMS_CSV_MAX_ROWS = 500;
export const TEAMS_CSV_MAX_BYTES = 500_000;

export const TEAMS_CSV_HEADER = 'nama_kumpulan,nama_ahli,emel,ketua';

/** Templat yang dimuat turun pendidik. CRLF supaya Excel gembira. */
export const TEAMS_CSV_TEMPLATE = [
  TEAMS_CSV_HEADER,
  'Kumpulan Orion,Ali bin Abu,ali@sekolah.edu.my,ya',
  'Kumpulan Orion,Siti Aminah,siti@sekolah.edu.my,',
  'Kumpulan Nova,Chong Wei Ming,chong@sekolah.edu.my,ya',
  'Kumpulan Nova,Devi Rajan,devi@sekolah.edu.my,',
  '',
].join('\r\n');

export interface ParsedTeamCsvRow {
  /** Nombor baris seperti dilihat dalam Excel (baris 1 = pengepala). */
  row: number;
  group: string;
  name: string;
  email: string;
  leader: boolean;
}

/** Normalkan nama lajur: huruf kecil, buang ruang dan tanda sempang. */
function normHeader(h: string): string {
  const k = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (k === 'group' || k === 'team' || k === 'team_name' || k === 'kumpulan') return 'nama_kumpulan';
  if (k === 'name' || k === 'member' || k === 'member_name' || k === 'ahli' || k === 'nama') return 'nama_ahli';
  if (k === 'email' || k === 'e_mail' || k === 'alamat_emel') return 'emel';
  if (k === 'leader' || k === 'is_leader' || k === 'ketua_kumpulan') return 'ketua';
  return k;
}

const LEADER_YES = ['ya', 'yes', 'y', '1', 'true'];
const LEADER_NO = ['', 'no', 'n', '0', 'false', 'tidak'];

/**
 * Tukar teks CSV kepada senarai baris kumpulan. Semua atau tiada: jika
 * `errors` tidak kosong, pemanggil MESTI tidak menulis apa apa.
 */
export function parseTeamCsv(text: string): { rows: ParsedTeamCsvRow[]; errors: QuizCsvError[] } {
  const errors: QuizCsvError[] = [];
  const rows: ParsedTeamCsvRow[] = [];

  const table = parseCsvRows(text, detectCsvDelimiter(text));
  const firstIdx = table.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (firstIdx === -1) {
    return { rows, errors: [{ row: 0, message: 'The file is empty.' }] };
  }

  const header = table[firstIdx].map(normHeader);
  const iGroup = header.indexOf('nama_kumpulan');
  const iName = header.indexOf('nama_ahli');
  const iEmail = header.indexOf('emel');
  const iLeader = header.indexOf('ketua');

  if (iGroup === -1) {
    errors.push({ row: firstIdx + 1, message: 'The header row has no "nama_kumpulan" column. Start from the downloaded template.' });
  }
  if (iEmail === -1) {
    errors.push({ row: firstIdx + 1, message: 'The header row has no "emel" column.' });
  }
  if (errors.length > 0) return { rows: [], errors };

  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? String(r[i] ?? '').trim() : '');

  let dataRows = 0;
  const seen = new Map<string, number>(); // emel -> baris pertama
  const leaders = new Map<string, number>(); // kumpulan (normalized) -> bilangan ketua

  for (let r = firstIdx + 1; r < table.length; r++) {
    const raw = table[r];
    if (!raw.some((c) => c.trim() !== '')) continue; // baris kosong dilangkau
    const rowNo = r + 1;
    dataRows++;

    const group = cell(raw, iGroup);
    if (!group) {
      errors.push({ row: rowNo, message: 'the team name is empty.' });
      continue;
    }
    const email = cell(raw, iEmail).toLowerCase();
    if (!email) {
      errors.push({ row: rowNo, message: 'the "emel" column is empty.' });
      continue;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push({ row: rowNo, message: `"emel" is not a valid email address, but it reads "${email}".` });
      continue;
    }
    const first = seen.get(email);
    if (first !== undefined) {
      errors.push({ row: rowNo, message: `this email appears twice in the file, first on row ${first}.` });
      continue;
    }
    seen.set(email, rowNo);

    const gkey = group.trim().toLowerCase();
    const leaderRaw = iEmail !== -1 ? cell(raw, iLeader) : '';
    const leaderVal = leaderRaw.toLowerCase();
    let leader = false;
    if (LEADER_YES.includes(leaderVal)) leader = true;
    else if (!LEADER_NO.includes(leaderVal)) {
      errors.push({ row: rowNo, message: `"ketua" must be yes or no (or empty), but it reads "${leaderRaw}".` });
      continue;
    }
    if (leader) {
      const n = (leaders.get(gkey) ?? 0) + 1;
      if (n > 1) {
        errors.push({ row: rowNo, message: `team "${group.trim()}" has two leaders marked in the file. A team can have only one leader.` });
        continue;
      }
      leaders.set(gkey, n);
    }

    rows.push({
      row: rowNo,
      group: group.trim(),
      name: cell(raw, iName),
      email,
      leader,
    });
  }

  if (errors.length === 0 && rows.length === 0) {
    errors.push({ row: 0, message: 'The file has a header row but no members under it.' });
  }
  if (errors.length === 0 && dataRows > TEAMS_CSV_MAX_ROWS) {
    errors.push({
      row: 0,
      message: `The file holds ${dataRows} rows. The limit is ${TEAMS_CSV_MAX_ROWS} per upload. Split it into smaller files.`,
    });
  }
  return { rows: errors.length ? [] : rows, errors };
}
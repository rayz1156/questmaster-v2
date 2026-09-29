// selftest-admin-audit.ts
// Ujian tulen untuk src/lib/adminAudit.ts (V2-011a). Jalankan dengan:
//   npx tsx scripts/selftest-admin-audit.ts
// Tiada pangkalan data. Setiap semakan mencetak LULUS/GAGAL; kod tamat 1
// jika ada kegagalan.

import { labelTindakan, bezaAudit, alasanAudit } from '../src/lib/adminAudit';

let bilGagal = 0;

// Pembantu: banding nilai sebenar dengan jangkaan.
function semak(nama: string, benar: unknown, jangka: unknown) {
  const sama = JSON.stringify(benar) === JSON.stringify(jangka);
  if (sama) {
    console.log(`LULUS: ${nama}`);
  } else {
    bilGagal += 1;
    console.log(`GAGAL: ${nama} | jangka ${JSON.stringify(jangka)} | dapat ${JSON.stringify(benar)}`);
  }
}

// 1. labelTindakan: tindakan dikenali
semak('1a user_suspend danger', labelTindakan('user_suspend'), { label: 'Suspended account', tone: 'danger' });
semak('1b user_unsuspend good', labelTindakan('user_unsuspend'), { label: 'Restored account', tone: 'good' });
semak('1c suspend (lama) danger', labelTindakan('suspend'), { label: 'Suspended account', tone: 'danger' });
semak('1d unsuspend (lama) good', labelTindakan('unsuspend'), { label: 'Restored account', tone: 'good' });
semak('1e role_change warn', labelTindakan('role_change'), { label: 'Changed role', tone: 'warn' });
semak('1f set_plan warn', labelTindakan('set_plan'), { label: 'Changed plan', tone: 'warn' });
semak('1g set_class_limits neutral', labelTindakan('set_class_limits'), { label: 'Changed class limits', tone: 'neutral' });
semak('1h approve good', labelTindakan('approve'), { label: 'Approved educator', tone: 'good' });
semak('1i unapprove warn', labelTindakan('unapprove'), { label: 'Revoked approval', tone: 'warn' });
semak('1j delete_user danger', labelTindakan('delete_user'), { label: 'Deleted user', tone: 'danger' });
semak('1k verify_email_manual good', labelTindakan('verify_email_manual'), { label: 'Verified email', tone: 'good' });
semak('1l verify_email_manual_and_approve good', labelTindakan('verify_email_manual_and_approve'), { label: 'Verified email and approved', tone: 'good' });
semak('1m enable_capability neutral', labelTindakan('enable_capability'), { label: 'Enabled upload', tone: 'neutral' });
semak('1n disable_capability neutral', labelTindakan('disable_capability'), { label: 'Disabled upload', tone: 'neutral' });
semak('1o class_edit neutral', labelTindakan('class_edit'), { label: 'Edited class', tone: 'neutral' });
semak('1p class_delete danger', labelTindakan('class_delete'), { label: 'Deleted class', tone: 'danger' });
semak('1q team_edit neutral', labelTindakan('team_edit'), { label: 'Edited team', tone: 'neutral' });
semak('1r team_delete danger', labelTindakan('team_delete'), { label: 'Deleted team', tone: 'danger' });
semak('1s challenge_points warn', labelTindakan('challenge_points'), { label: 'Changed points', tone: 'warn' });
semak('1t moderation_override warn', labelTindakan('moderation_override'), { label: 'Overrode review', tone: 'warn' });
semak('1u password_reset_sent neutral', labelTindakan('password_reset_sent'), { label: 'Sent password reset', tone: 'neutral' });
semak('1v class_archive neutral', labelTindakan('class_archive'), { label: 'Archived class', tone: 'neutral' });
semak('1w class_unarchive good', labelTindakan('class_unarchive'), { label: 'Restored class', tone: 'good' });

// 2. labelTindakan: tindakan tidak dikenali menjadi ayat, tone neutral
semak('2a foo_bar menjadi Foo bar', labelTindakan('foo_bar'), { label: 'Foo bar', tone: 'neutral' });
semak('2b tiga_perkataan menjadi ayat', labelTindakan('tiga_perkataan_x'), { label: 'Tiga perkataan x', tone: 'neutral' });

// 3. bezaAudit: meta lengkap dengan before dan after
semak(
  '3a before/after penuh',
  bezaAudit({ reason: 'ujian', before: { suspended: false }, after: { suspended: true } }),
  [{ key: 'suspended', before: 'false', after: 'true' }],
);

// 4. bezaAudit: kesatuan kunci tersusun dengan kunci bertindih
semak(
  '4a kesatuan kunci tersusun',
  bezaAudit({ before: { b: 1, a: 1 }, after: { c: 3, a: 2 } }),
  [
    { key: 'a', before: '1', after: '2' },
    { key: 'b', before: '1', after: '(none)' },
    { key: 'c', before: '(none)', after: '3' },
  ],
);

// 5. bezaAudit: before sahaja, after sahaja
semak(
  '5a before sahaja',
  bezaAudit({ before: { points: 10 } }),
  [{ key: 'points', before: '10', after: '(none)' }],
);
semak(
  '5b after sahaja',
  bezaAudit({ after: { points: 25 } }),
  [{ key: 'points', before: '(none)', after: '25' }],
);

// 6. bezaAudit: meta null, meta rentetan, meta tanpa before/after
semak('6a meta null', bezaAudit(null), []);
semak('6b meta rentetan', bezaAudit('bukan objek'), []);
semak('6c meta tanpa before/after', bezaAudit({ reason: 'x', lain: 1 }), []);
semak('6d before bukan objek', bezaAudit({ before: 'teks', after: { a: 1 } }), [{ key: 'a', before: '(none)', after: '1' }]);
semak('6e tatasusunan meta', bezaAudit([1, 2]), []);

// 7. bezaAudit: nilai khas
semak(
  '7a nilai null dan objek',
  bezaAudit({ before: { reviewed_by: null }, after: { reviewed_by: { id: 'u1' } } }),
  [{ key: 'reviewed_by', before: '(none)', after: '{"id":"u1"}' }],
);
semak(
  '7b nilai boolean dan nombor',
  bezaAudit({ before: { points: 10, flag: true }, after: { points: 25, flag: false } }),
  [
    { key: 'flag', before: 'true', after: 'false' },
    { key: 'points', before: '10', after: '25' },
  ],
);

// 8. alasanAudit
semak('8a alasan ada', alasanAudit({ reason: 'Melanggar peraturan' }), 'Melanggar peraturan');
semak('8b alasan tiada', alasanAudit({ before: {}, after: {} }), null);
semak('8c meta null', alasanAudit(null), null);
semak('8d meta rentetan', alasanAudit('bukan objek'), null);
semak('8e alasan bukan rentetan', alasanAudit({ reason: 42 }), null);

// 9. Tidak melontar pada input aneh
let tiadaLontar = true;
try {
  bezaAudit(undefined as unknown as Record<string, unknown>);
  alasanAudit(undefined as unknown as Record<string, unknown>);
  labelTindakan('');
} catch {
  tiadaLontar = false;
}
semak('9a input aneh tidak melontar', tiadaLontar, true);

if (bilGagal > 0) {
  console.log(`GAGAL: ${bilGagal} semakan tidak lulus`);
  process.exit(1);
}
console.log('SEMUA SEMAKAN LULUS');
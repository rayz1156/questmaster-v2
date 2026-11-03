/**
 * Templat e-mel dwibahasa (KZ-043 A6).
 *
 * Setiap templat menerima bahasa penerima dan nilai (nama kelas, nama
 * penghantar, URL) lalu memulangkan `{ subject, html, text? }`. Semua
 * nilai pengguna yang masuk ke HTML di-escape menerusi `escapeHtml`
 * di sini; laluan tidak perlu (dan tidak boleh) mengurangkan escaping
 * yang sedia ada.
 *
 * Pengirim, penerima, lampiran, had kadar dan logik penghantaran kekal
 * dalam laluan; fail ini hanya menyusun teks.
 */

import type { Bahasa } from './index';

/** Escape nilai pengguna sebelum dimasukkan ke badan HTML e-mel. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface NilaiSijil {
  /** Nama program (contoh "Kursus Asas AI"). */
  program: string;
  /** Kod pengesahan awam sijil. */
  kod: string;
  /** URL senarai sijil peserta. */
  senaraiUrl: string;
  /** URL pengesahan awam /sijil/<kod>. */
  sahUrl: string;
  /** Benar jika PDF dilampirkan pada e-mel. */
  adaLampiran: boolean;
}

/** E-mel sijil: subjek dan badan HTML/teks dalam bahasa penerima. */
export function emelSijil(bahasa: Bahasa, nilai: NilaiSijil): { subject: string; html: string; text: string } {
  const program = escapeHtml(nilai.program);
  const kod = escapeHtml(nilai.kod);
  if (bahasa === 'ms') {
    const ayatLampiran = nilai.adaLampiran
      ? 'Sijil anda dilampirkan pada e-mel ini dalam bentuk PDF.'
      : 'Muat turun sijil anda dari Kuizen melalui butang di bawah.';
    return {
      subject: `Sijil anda: ${nilai.program}`,
      html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">Sijil anda sudah sedia</h2>
          <p style="color:#374151;line-height:1.5;">
            Tahniah! Sijil anda bagi
            <b>${program}</b> telah dikeluarkan.
          </p>
          <p style="color:#374151;line-height:1.5;">${ayatLampiran}</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${nilai.senaraiUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Muat turun sijil anda
            </a>
          </p>
          <p style="color:#374151;line-height:1.5;font-size:13px;">
            Sesiapa sahaja boleh mengesahkan sijil ini dengan kodnya
            <b>${kod}</b> di
            <a href="${nilai.sahUrl}">${nilai.sahUrl}</a>.
          </p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;">
            Anda menerima e-mel ini kerana sijil telah dikeluarkan kepada anda di Kuizen.
          </p>
        </div>
      </div>`,
      text:
        `Tahniah! Sijil anda bagi "${nilai.program}" telah dikeluarkan.\n\n` +
        `${ayatLampiran}\n` +
        `Muat turun sijil anda: ${nilai.senaraiUrl}\n` +
        `Sahkan dalam talian dengan kod ${nilai.kod}: ${nilai.sahUrl}\n`,
    };
  }
  const ayatLampiran = nilai.adaLampiran
    ? 'Your certificate is attached to this email as a PDF.'
    : 'Download your certificate from Kuizen using the button below.';
  return {
    subject: `Your certificate: ${nilai.program}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">Your certificate is ready</h2>
          <p style="color:#374151;line-height:1.5;">
            Congratulations! Your certificate for
            <b>${program}</b> has been issued.
          </p>
          <p style="color:#374151;line-height:1.5;">${ayatLampiran}</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${nilai.senaraiUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Download your certificate
            </a>
          </p>
          <p style="color:#374151;line-height:1.5;font-size:13px;">
            Anyone can verify this certificate with its code
            <b>${kod}</b> at
            <a href="${nilai.sahUrl}">${nilai.sahUrl}</a>.
          </p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;">
            You received this because a certificate was issued to you on Kuizen.
          </p>
        </div>
      </div>`,
    text:
      `Congratulations! Your certificate for "${nilai.program}" has been issued.\n\n` +
      `${ayatLampiran}\n` +
      `Download your certificate: ${nilai.senaraiUrl}\n` +
      `Verify online with code ${nilai.kod}: ${nilai.sahUrl}\n`,
  };
}

export interface NilaiJemputanKelas {
  /** Nama kelas yang dijemput sertai. */
  namaKelas: string;
  /** Pautan terima jemputan /join/<token>. */
  pautan: string;
}

/** Jemputan kelas (Brevo htmlContent): subjek dan HTML sahaja. */
export function emelJemputanKelas(bahasa: Bahasa, nilai: NilaiJemputanKelas): { subject: string; html: string } {
  const namaKelas = escapeHtml(nilai.namaKelas);
  if (bahasa === 'ms') {
    return {
      subject: `Anda dijemput menyertai "${nilai.namaKelas}" di Kuizen`,
      html: `<p>Salam!</p><p>Anda telah dijemput menyertai kelas <b>${namaKelas}</b> di Kuizen.</p><p><a href="${nilai.pautan}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Terima jemputan</a></p><p>Atau buka pautan ini: <a href="${nilai.pautan}">${nilai.pautan}</a></p>`,
    };
  }
  return {
    subject: `You're invited to join "${nilai.namaKelas}" on Kuizen`,
    html: `<p>Hello!</p><p>You've been invited to join the class <b>${namaKelas}</b> on Kuizen.</p><p><a href="${nilai.pautan}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Accept invite</a></p><p>Or open this link: <a href="${nilai.pautan}">${nilai.pautan}</a></p>`,
  };
}

export interface NilaiJemputanPendidik {
  /** Nama paparan penghantar. */
  namaPenghantar: string;
  /** Nama kelas yang diajar bersama. */
  namaKelas: string;
  /** Emel penerima jemputan. */
  emelPenerima: string;
  /** Kod jemputan 8 aksara. */
  kod: string;
  /** Pautan terima /educator/invites?code=... */
  pautanTerima: string;
  /** URL halaman kod jemputan (siteUrl + /educator/invites). */
  pautanSesi: string;
}

/** Jemputan pendidik bersama: subjek dan badan HTML/teks. */
export function emelJemputanPendidik(
  bahasa: Bahasa,
  nilai: NilaiJemputanPendidik,
): { subject: string; html: string; text: string } {
  const namaPenghantar = escapeHtml(nilai.namaPenghantar);
  const namaKelas = escapeHtml(nilai.namaKelas);
  const emelPenerima = escapeHtml(nilai.emelPenerima);
  const kod = escapeHtml(nilai.kod);
  if (bahasa === 'ms') {
    return {
      subject: `[Kuizen] Anda dijemput mengajar bersama kelas "${nilai.namaKelas}"`,
      html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">Jemputan pendidik</h2>
          <p style="color:#374151;line-height:1.5;">Salam,</p>
          <p style="color:#374151;line-height:1.5;">
            <b>${namaPenghantar}</b> menjemput anda mengajar bersama kelas
            <b>${namaKelas}</b> di Kuizen.
          </p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${nilai.pautanTerima}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Terima jemputan
            </a>
          </p>
          <p style="color:#374151;line-height:1.5;font-size:13px;">
            Jika butang tidak berfungsi, log masuk ke Kuizen menggunakan
            <b>${emelPenerima}</b> dan tampal kod 8 aksara ini di
            <a href="${nilai.pautanSesi}">${nilai.pautanSesi}</a>:
          </p>
          <div style="text-align:center;margin:16px 0;">
            <code style="display:inline-block;font-family:monospace;font-size:22px;letter-spacing:4px;background:#f3f4f6;color:#111827;padding:12px 20px;border-radius:8px;border:1px solid #e5e7eb;">${kod}</code>
          </div>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;">
            Anda menerima e-mel ini kerana seseorang menjemput anda sebagai pendidik di Kuizen.
            Jika ini tidak dijangka, anda boleh mengabaikan e-mel ini.
          </p>
        </div>
      </div>`,
      text:
        `${nilai.namaPenghantar} menjemput anda mengajar bersama kelas "${nilai.namaKelas}" di Kuizen.\n\n` +
        `Pautan terima: ${nilai.pautanTerima}\n\n` +
        `Jika pautan tidak berfungsi, log masuk dengan ${nilai.emelPenerima} dan tampal kod ini di ${nilai.pautanSesi} :\n` +
        `${nilai.kod}\n`,
    };
  }
  return {
    subject: `[Kuizen] You're invited to co-teach "${nilai.namaKelas}"`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">Educator invite</h2>
          <p style="color:#374151;line-height:1.5;">Hello,</p>
          <p style="color:#374151;line-height:1.5;">
            <b>${namaPenghantar}</b> has invited you to co-teach the class
            <b>${namaKelas}</b> on Kuizen.
          </p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${nilai.pautanTerima}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Accept invite
            </a>
          </p>
          <p style="color:#374151;line-height:1.5;font-size:13px;">
            If the button doesn't work, sign in to Kuizen using
            <b>${emelPenerima}</b> and paste this 8-character code at
            <a href="${nilai.pautanSesi}">${nilai.pautanSesi}</a>:
          </p>
          <div style="text-align:center;margin:16px 0;">
            <code style="display:inline-block;font-family:monospace;font-size:22px;letter-spacing:4px;background:#f3f4f6;color:#111827;padding:12px 20px;border-radius:8px;border:1px solid #e5e7eb;">${kod}</code>
          </div>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;">
            You received this because someone invited you as an educator on Kuizen.
            If this wasn't expected, you can ignore this email.
          </p>
        </div>
      </div>`,
    text:
      `${nilai.namaPenghantar} invited you to co-teach "${nilai.namaKelas}" on Kuizen.\n\n` +
      `Accept link: ${nilai.pautanTerima}\n\n` +
      `If the link doesn't work, sign in with ${nilai.emelPenerima} and paste this code at ${nilai.pautanSesi} :\n` +
      `${nilai.kod}\n`,
  };
}

export interface NilaiPendidikMenunggu {
  /** Nama pendidik baharu (mungkin kosong). */
  nama: string;
  /** Emel pendidik baharu. */
  emel: string;
  /** Masa pendaftaran, sudah diformat mengikut lokal penerima. */
  tarikhDaftar: string;
  /** URL halaman semakan pentadbir. */
  pautanSemak: string;
}

/** Notis pendidik menunggu kelulusan (kepada pentadbir): subjek dan HTML. */
export function emelPendidikMenunggu(
  bahasa: Bahasa,
  nilai: NilaiPendidikMenunggu,
): { subject: string; html: string } {
  const nama = escapeHtml(nilai.nama || '(not provided)');
  const emel = escapeHtml(nilai.emel);
  if (bahasa === 'ms') {
    return {
      subject: `[Kuizen] Pendidik baharu menunggu kelulusan: ${nilai.nama || nilai.emel}`,
      html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">Pendidik Baharu Menunggu Kelulusan</h2>
          <p style="color:#374151;">Seorang pendidik baharu telah mendaftar di Kuizen dan menunggu kelulusan anda.</p>
          <table style="width:100%;margin:16px 0;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#6b7280;">Nama:</td><td style="padding:6px 0;color:#111827;font-weight:600;">${escapeHtml(nilai.nama || '(tidak diberi)')}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Emel:</td><td style="padding:6px 0;color:#111827;font-weight:600;">${emel}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Mendaftar pada:</td><td style="padding:6px 0;color:#111827;">${escapeHtml(nilai.tarikhDaftar)}</td></tr>
          </table>
          <a href="${nilai.pautanSemak}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Semak dan luluskan</a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Notifikasi Pentadbir Kuizen</p>
        </div>
      </div>`,
    };
  }
  return {
    subject: `[Kuizen] New educator pending approval: ${nilai.nama || nilai.emel}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111827;">New Educator Awaiting Approval</h2>
          <p style="color:#374151;">A new educator has registered on Kuizen and is awaiting your approval.</p>
          <table style="width:100%;margin:16px 0;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#6b7280;">Name:</td><td style="padding:6px 0;color:#111827;font-weight:600;">${nama}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Email:</td><td style="padding:6px 0;color:#111827;font-weight:600;">${emel}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Registered:</td><td style="padding:6px 0;color:#111827;">${escapeHtml(nilai.tarikhDaftar)}</td></tr>
          </table>
          <a href="${nilai.pautanSemak}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Review &amp; Approve</a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Kuizen Admin Notification</p>
        </div>
      </div>`,
  };
}

import { BRANDING } from '@/lib/branding.config';
import { teks } from '@/i18n/teks';

export interface EmailContext {
  recipientName: string;
  recipientEmail: string;
  orgName?: string;
  lang?: 'en' | 'ms';
}

function baseTemplate(opts: { title: string; previewText: string; body: string }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;background:#f8fafc;font-family:'Roboto',Arial,sans-serif;color:#0f172a">
<span style="display:none;opacity:0;font-size:0;line-height:0">${escapeHtml(opts.previewText)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(15,30,53,0.06)">
      <tr><td style="background:linear-gradient(135deg,#0f1e35 0%,#243d65 100%);padding:28px 32px">
        <table role="presentation"><tr>
          <td style="vertical-align:middle"><span style="color:#fff;font-size:20px;font-weight:700;font-family:'Nunito','Arial',sans-serif">${teks.jenama.bahagian1} <span style="color:#fbbf24">${teks.jenama.bahagian2}</span></span></td>
          <td style="vertical-align:middle;padding-left:10px;color:#fbbf24;font-size:10px;letter-spacing:.2em;text-transform:uppercase;font-weight:700">${teks.emel.olehVeltrix}</td>
        </tr></table>
        <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;letter-spacing:.18em;text-transform:uppercase">${teks.emel.platform}</p>
      </td></tr>
      <tr><td style="padding:32px">${opts.body}</td></tr>
      <tr><td style="background:#0f1e35;color:#cbd5e1;padding:20px 32px;font-size:11px;line-height:1.6">
        <strong style="color:#fff">${teks.jenama.nama}</strong><br/>
        ${teks.emel.produkVeltrix}<br/>
        ${teks.emel.upsi}<br/><br/>
        <a href="https://${BRANDING.migration.newDomain}" style="color:#fbbf24;text-decoration:none">${BRANDING.migration.newDomain}</a>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function escapeHtml(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }

function cta(label: string, href: string) {
  return `<table role="presentation" style="margin:18px 0"><tr><td style="background:#6576ff;border-radius:10px"><a href="${href}" style="display:inline-block;padding:12px 24px;color:#fff;font-weight:700;text-decoration:none;font-size:14px">${label}</a></td></tr></table>`;
}

export const Emails = {
  welcomeLearner(ctx: EmailContext & { firstProgram?: string; loginUrl: string }) {
    const greeting = ctx.lang === 'ms' ? teks.emel.salam(ctx.recipientName) : teks.emel.sapaan(ctx.recipientName);
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#6576ff;font-size:28px;margin:0 0 14px">${teks.emel.tajukSambutan}</h1>
      <p style="margin:0 0 14px;line-height:1.6">${greeting}</p>
      <p style="margin:0 0 14px;line-height:1.6">${ctx.orgName ? escapeHtml(ctx.orgName) : teks.emel.organisasiAnda}${teks.emel.sambutanBadan}</p>
      ${ctx.firstProgram ? `<p style="margin:0 0 14px;line-height:1.6">${teks.emel.programPertama}<strong>${escapeHtml(ctx.firstProgram)}</strong></p>` : ''}
      ${cta(teks.emel.ctaSambutan, ctx.loginUrl)}
      <p style="margin:14px 0 0;line-height:1.6;color:#475569;font-size:13px">${teks.emel.sambutanBantuan}</p>`;
    return { subject: teks.emel.subjekSambutan(teks.jenama.nama, ctx.orgName), html: baseTemplate({ title: teks.emel.tajukSambutan, previewText: teks.emel.pratontonSambutan, body }) };
  },
  assignmentNotification(ctx: EmailContext & { programName: string; hours: number; dueDate: string; mandatory: boolean; accreditations: string[]; learnUrl: string; outcomes?: string[] }) {
    const greeting = ctx.lang === 'ms' ? teks.emel.salam(ctx.recipientName) : teks.emel.sapaan(ctx.recipientName);
    const body = `
      <p style="margin:0 0 14px">${greeting}</p>
      <p style="margin:0 0 18px">${ctx.orgName ? escapeHtml(ctx.orgName) : teks.emel.organisasiAnda}${teks.emel.daftarBadan}</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 18px">
        <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#0f1e35">📚 ${escapeHtml(ctx.programName)}</p>
        <p style="margin:0;color:#475569;font-size:13px">${teks.emel.jamTamat(ctx.hours, escapeHtml(ctx.dueDate))}${ctx.mandatory ? `<strong style="color:#b45309">${teks.emel.wajib}</strong>` : teks.emel.pilihan}</p>
        ${ctx.accreditations.length ? `<p style="margin:8px 0 0">${ctx.accreditations.map(a => `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(a)}</span>`).join(' ')}</p>` : ''}
      </div>
      ${cta(teks.emel.ctaMula, ctx.learnUrl)}
      ${ctx.outcomes && ctx.outcomes.length ? `<p style="margin:14px 0 6px;font-weight:700;color:#0f1e35">${teks.emel.belajar}</p><ul style="margin:0 0 14px;padding-left:18px;color:#475569">${ctx.outcomes.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : ''}
      <p style="margin:18px 0 0;color:#475569;font-size:13px">${teks.emel.soalanHubungi}</p>`;
    return { subject: teks.emel.subjekDaftar(teks.jenama.nama, ctx.programName), html: baseTemplate({ title: teks.emel.tajukDaftar, previewText: teks.emel.pratontonDaftar(ctx.dueDate), body }) };
  },
  deadlineReminder(ctx: EmailContext & { programName: string; daysLeft: number; learnUrl: string }) {
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#b45309;font-size:24px;margin:0 0 14px">${teks.emel.tempohTajuk}</h1>
      <p>${teks.emel.sapaan(escapeHtml(ctx.recipientName))}</p>
      <p>${teks.emel.tempohBadan(escapeHtml(ctx.programName), ctx.daysLeft)}</p>
      ${cta(teks.emel.ctaSambung, ctx.learnUrl)}`;
    return { subject: teks.emel.subjekPeringatan(ctx.programName, ctx.daysLeft), html: baseTemplate({ title: teks.emel.tajukPeringatan, previewText: teks.emel.pratontonPeringatan(ctx.daysLeft), body }) };
  },
  certificateDelivery(ctx: EmailContext & { programName: string; certificateUrl: string; verifyUrl: string }) {
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#6576ff;font-size:28px;margin:0 0 14px">${teks.emel.tahniah}</h1>
      <p>${teks.emel.sapaan(escapeHtml(ctx.recipientName))}</p>
      <p>${teks.emel.sijilBadan(escapeHtml(ctx.programName))}</p>
      ${cta(teks.emel.ctaMuat, ctx.certificateUrl)}
      <p style="font-size:13px;color:#475569;margin-top:14px">${teks.emel.sahkan}<a href="${ctx.verifyUrl}" style="color:#6576ff">${ctx.verifyUrl}</a></p>`;
    return { subject: teks.emel.subjekSijil(ctx.programName), html: baseTemplate({ title: teks.emel.tajukSijil, previewText: teks.emel.pratontonSijil, body }) };
  },
  managerDigest(ctx: EmailContext & { teamSize: number; avgCompletion: number; overdueCount: number; topPerformer?: string; reportUrl: string }) {
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#0f1e35;font-size:24px;margin:0 0 14px">${teks.emel.pasukanTajuk}</h1>
      <p>${teks.emel.sapaan(escapeHtml(ctx.recipientName))}</p>
      <p>${teks.emel.ringkasan}</p>
      <ul style="line-height:1.8;color:#475569">
        <li>${teks.emel.saizPasukan}<strong>${ctx.teamSize}</strong></li>
        <li>${teks.emel.purata}<strong>${ctx.avgCompletion}%</strong></li>
        <li>${teks.emel.tertunggak}<strong>${ctx.overdueCount}</strong></li>
        ${ctx.topPerformer ? `<li>${teks.emel.cemerlang}<strong>${escapeHtml(ctx.topPerformer)}</strong></li>` : ''}
      </ul>
      ${cta(teks.emel.ctaLaporan, ctx.reportUrl)}`;
    return { subject: teks.emel.subjekRingkasan, html: baseTemplate({ title: teks.emel.tajukRingkasan, previewText: teks.emel.pratontonRingkasan(ctx.overdueCount), body }) };
  },
  // KZ-031: e-mel akses kursus selepas pembelian di Veltrix Pay.
  // BM tulen untuk StafKita, EN untuk Veltrix (melalui lapisan teks).
  payAksesKursus(ctx: EmailContext & { courseTitle: string; loginUrl: string; akaunBaharu: boolean }) {
    const greeting = ctx.lang === 'ms'
      ? teks.emel.salam(escapeHtml(ctx.recipientName))
      : teks.emel.sapaan(escapeHtml(ctx.recipientName));
    const perenggan = ctx.akaunBaharu
      ? teks.emel.payBadanBaharu(teks.jenama.nama)
      : teks.emel.payBadanSedia(teks.jenama.nama);
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#6576ff;font-size:28px;margin:0 0 14px">${teks.emel.payTajuk}</h1>
      <p style="margin:0 0 14px;line-height:1.6">${greeting}</p>
      <p style="margin:0 0 14px;line-height:1.6">${perenggan}</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 18px">
        <p style="margin:0;font-size:18px;font-weight:700;color:#0f1e35">🎓 ${escapeHtml(ctx.courseTitle)}</p>
      </div>
      ${cta(teks.emel.payCtaMula, ctx.loginUrl)}
      <p style="margin:14px 0 0;line-height:1.6;color:#475569;font-size:13px">${teks.emel.payNota}</p>`;
    return {
      subject: teks.emel.paySubjek(ctx.courseTitle, teks.jenama.nama),
      html: baseTemplate({ title: teks.emel.payTajuk, previewText: teks.emel.payPratonton, body }),
    };
  },
  migrationAnnouncement(ctx: EmailContext & { newDomainUrl: string }) {
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#6576ff;font-size:28px;margin:0 0 14px">${teks.emel.migrasiTajuk}</h1>
      <p>${teks.emel.sapaan(escapeHtml(ctx.recipientName))}</p>
      <p>${teks.emel.migrasiBadan}</p>
      <p><strong>${teks.emel.migrasiPerubahan}</strong></p>
      <ul style="line-height:1.8;color:#475569"><li>${teks.emel.migrasiNama}</li><li>${teks.emel.migrasiDomain(BRANDING.migration.newDomain)}</li><li>${teks.emel.migrasiCiri}</li><li>${teks.emel.migrasiHrdc}</li><li>${teks.emel.migrasiData}</li></ul>
      <p><strong>${teks.emel.migrasiArahan}</strong> ${teks.emel.migrasiArahanBadan}</p>
      ${cta(teks.emel.ctaLawat, ctx.newDomainUrl)}`;
    return { subject: teks.emel.subjekMigrasi, html: baseTemplate({ title: teks.emel.tajukMigrasi, previewText: teks.emel.pratontonMigrasi, body }) };
  },
};

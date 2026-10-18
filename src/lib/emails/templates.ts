import { BRANDING } from '@/lib/branding.config';

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
          <td style="vertical-align:middle"><span style="color:#fff;font-size:20px;font-weight:700;font-family:'Nunito','Arial',sans-serif">StafKita <span style="color:#fbbf24">Akademi</span></span></td>
          <td style="vertical-align:middle;padding-left:10px;color:#fbbf24;font-size:10px;letter-spacing:.2em;text-transform:uppercase;font-weight:700">by Veltrix</td>
        </tr></table>
        <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;letter-spacing:.18em;text-transform:uppercase">Enterprise Learning Platform</p>
      </td></tr>
      <tr><td style="padding:32px">${opts.body}</td></tr>
      <tr><td style="background:#0f1e35;color:#cbd5e1;padding:20px 32px;font-size:11px;line-height:1.6">
        <strong style="color:#fff">StafKita Akademi</strong><br/>
        A Veltrix Technology Center Product<br/>
        An UPSI Spin-Off Initiative<br/><br/>
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
    const greeting = ctx.lang === 'ms' ? `Salam ${ctx.recipientName},` : `Dear ${ctx.recipientName},`;
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#6576ff;font-size:28px;margin:0 0 14px">Welcome to StafKita Akademi</h1>
      <p style="margin:0 0 14px;line-height:1.6">${greeting}</p>
      <p style="margin:0 0 14px;line-height:1.6">${ctx.orgName ? escapeHtml(ctx.orgName) : 'Your organization'} has set up your learning account. You can now access your assigned programs, track progress, and earn HRDCorp-claimable certificates.</p>
      ${ctx.firstProgram ? `<p style="margin:0 0 14px;line-height:1.6">Your first program: <strong>${escapeHtml(ctx.firstProgram)}</strong></p>` : ''}
      ${cta('Sign in to your account →', ctx.loginUrl)}
      <p style="margin:14px 0 0;line-height:1.6;color:#475569;font-size:13px">Need help getting started? Reach your L&D administrator.</p>`;
    return { subject: `Welcome to StafKita Akademi${ctx.orgName ? ', ' + ctx.orgName : ''}`, html: baseTemplate({ title: 'Welcome to StafKita Akademi', previewText: 'Your learning account is ready.', body }) };
  },
  assignmentNotification(ctx: EmailContext & { programName: string; hours: number; dueDate: string; mandatory: boolean; accreditations: string[]; learnUrl: string; outcomes?: string[] }) {
    const greeting = ctx.lang === 'ms' ? `Salam ${ctx.recipientName},` : `Dear ${ctx.recipientName},`;
    const body = `
      <p style="margin:0 0 14px">${greeting}</p>
      <p style="margin:0 0 18px">${ctx.orgName ? escapeHtml(ctx.orgName) : 'Your organization'} has enrolled you in the following program:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 18px">
        <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#0f1e35">📚 ${escapeHtml(ctx.programName)}</p>
        <p style="margin:0;color:#475569;font-size:13px">⏱ ${ctx.hours} hours · 📅 Due ${escapeHtml(ctx.dueDate)} · ${ctx.mandatory ? '<strong style="color:#b45309">Mandatory</strong>' : 'Optional'}</p>
        ${ctx.accreditations.length ? `<p style="margin:8px 0 0">${ctx.accreditations.map(a => `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(a)}</span>`).join(' ')}</p>` : ''}
      </div>
      ${cta('Start learning now →', ctx.learnUrl)}
      ${ctx.outcomes && ctx.outcomes.length ? `<p style="margin:14px 0 6px;font-weight:700;color:#0f1e35">What you’ll learn:</p><ul style="margin:0 0 14px;padding-left:18px;color:#475569">${ctx.outcomes.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : ''}
      <p style="margin:18px 0 0;color:#475569;font-size:13px">Questions? Contact your L&D administrator or our support team.</p>`;
    return { subject: `You’ve been enrolled in ${ctx.programName} | StafKita Akademi`, html: baseTemplate({ title: 'New program assignment', previewText: `Due by ${ctx.dueDate}`, body }) };
  },
  deadlineReminder(ctx: EmailContext & { programName: string; daysLeft: number; learnUrl: string }) {
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#b45309;font-size:24px;margin:0 0 14px">Deadline approaching</h1>
      <p>Dear ${escapeHtml(ctx.recipientName)},</p>
      <p>Your training <strong>${escapeHtml(ctx.programName)}</strong> is due in <strong>${ctx.daysLeft} day${ctx.daysLeft === 1 ? '' : 's'}</strong>. Please complete it to stay compliant.</p>
      ${cta('Resume training →', ctx.learnUrl)}`;
    return { subject: `Reminder: Complete ${ctx.programName} in ${ctx.daysLeft} day(s)`, html: baseTemplate({ title: 'Deadline reminder', previewText: `${ctx.daysLeft} day(s) left`, body }) };
  },
  certificateDelivery(ctx: EmailContext & { programName: string; certificateUrl: string; verifyUrl: string }) {
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#6576ff;font-size:28px;margin:0 0 14px">Congratulations 🎓</h1>
      <p>Dear ${escapeHtml(ctx.recipientName)},</p>
      <p>You’ve successfully completed <strong>${escapeHtml(ctx.programName)}</strong>. Your certificate is now available.</p>
      ${cta('Download certificate →', ctx.certificateUrl)}
      <p style="font-size:13px;color:#475569;margin-top:14px">Verify anytime at <a href="${ctx.verifyUrl}" style="color:#6576ff">${ctx.verifyUrl}</a></p>`;
    return { subject: `Your certificate is ready: ${ctx.programName}`, html: baseTemplate({ title: 'Certificate ready', previewText: 'Your training certificate has been issued.', body }) };
  },
  managerDigest(ctx: EmailContext & { teamSize: number; avgCompletion: number; overdueCount: number; topPerformer?: string; reportUrl: string }) {
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#0f1e35;font-size:24px;margin:0 0 14px">Your team’s learning progress</h1>
      <p>Dear ${escapeHtml(ctx.recipientName)},</p>
      <p>Here’s your weekly summary:</p>
      <ul style="line-height:1.8;color:#475569">
        <li>👥 Team size: <strong>${ctx.teamSize}</strong></li>
        <li>📈 Average completion: <strong>${ctx.avgCompletion}%</strong></li>
        <li>⚠️ Overdue learners: <strong>${ctx.overdueCount}</strong></li>
        ${ctx.topPerformer ? `<li>⭐ Top performer: <strong>${escapeHtml(ctx.topPerformer)}</strong></li>` : ''}
      </ul>
      ${cta('View full report →', ctx.reportUrl)}`;
    return { subject: `Team digest | StafKita Akademi`, html: baseTemplate({ title: 'Team digest', previewText: `${ctx.overdueCount} overdue this week`, body }) };
  },
  migrationAnnouncement(ctx: EmailContext & { newDomainUrl: string }) {
    const body = `
      <h1 style="font-family:'Nunito','Arial',sans-serif;color:#6576ff;font-size:28px;margin:0 0 14px">The platform is now StafKita Akademi</h1>
      <p>Dear ${escapeHtml(ctx.recipientName)},</p>
      <p>We’re excited to share that the platform has evolved into <strong>StafKita Akademi</strong>, part of the Veltrix Technology ecosystem.</p>
      <p><strong>What’s changing:</strong></p>
      <ul style="line-height:1.8;color:#475569"><li>New name: StafKita Akademi by Veltrix</li><li>New domain: <code>${BRANDING.migration.newDomain}</code> (current URL will redirect)</li><li>Enhanced enterprise features for corporate training</li><li>HRDCorp claimable programs</li><li>Same data, same login</li></ul>
      <p><strong>What you need to do:</strong> Nothing! Your data and credentials are preserved. Update your bookmarks when convenient.</p>
      ${cta('Visit StafKita Akademi →', ctx.newDomainUrl)}`;
    return { subject: 'Important: We are becoming StafKita Akademi', html: baseTemplate({ title: 'We have evolved', previewText: 'New name. Same data. Same login.', body }) };
  },
};

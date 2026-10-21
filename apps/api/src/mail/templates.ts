import type { MailMessage } from './mail.service';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function layout(heading: string, intro: string, buttonLabel: string, url: string, footnote: string) {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html><body style="margin:0;background:#F2EFE8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#121212">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FBFAF6;border:1.5px solid #121212;border-radius:6px">
        <tr><td style="padding:28px 28px 8px;font-size:15px;font-weight:900;font-style:italic;letter-spacing:-0.01em;text-transform:uppercase">Jump</td></tr>
        <tr><td style="padding:8px 28px 0;font-size:26px;font-weight:900;text-transform:uppercase;line-height:1.1">${escapeHtml(heading)}</td></tr>
        <tr><td style="padding:14px 28px 0;font-size:15px;line-height:1.55;color:#55524B">${escapeHtml(intro)}</td></tr>
        <tr><td style="padding:24px 28px">
          <a href="${safeUrl}" style="display:inline-block;background:#FF4D12;color:#121212;border:1.5px solid #121212;border-radius:4px;padding:14px 22px;font-size:14px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none">${escapeHtml(buttonLabel)}</a>
        </td></tr>
        <tr><td style="padding:0 28px 28px;font-size:12px;line-height:1.55;color:#8A857B">
          ${escapeHtml(footnote)}<br><br>Button not working? Paste this link into your browser:<br>
          <a href="${safeUrl}" style="color:#8A857B;word-break:break-all">${safeUrl}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function verificationEmail(to: { address: string; name?: string }, url: string): MailMessage {
  const greeting = to.name ? `Hi ${to.name}, confirm` : 'Confirm';
  const intro = `${greeting} this is your email so you can enter paid competitions and recover your account.`;
  const footnote = 'This link expires in 24 hours. If you didn’t create a Jump account, you can ignore this email.';
  return {
    to,
    subject: 'Verify your email for Jump',
    html: layout('Verify your email', intro, 'Verify email', url, footnote),
    text: `${intro}\n\nVerify your email: ${url}\n\n${footnote}`,
  };
}

export function passwordResetEmail(to: { address: string; name?: string }, url: string): MailMessage {
  const intro = 'Someone (hopefully you) asked to reset the password on your Jump account.';
  const footnote = 'This link expires in 1 hour and signs you out everywhere once used. If you didn’t ask for this, ignore this email. Your password won’t change.';
  return {
    to,
    subject: 'Reset your Jump password',
    html: layout('Reset your password', intro, 'Choose a new password', url, footnote),
    text: `${intro}\n\nChoose a new password: ${url}\n\n${footnote}`,
  };
}

export function challengeInviteEmail(to: { address: string; name?: string }, title: string, url: string): MailMessage {
  const intro = `You’ve been invited to ${title} on Jump. Open the competition to see the rules and join when you’re ready.`;
  return {
    to,
    subject: `Join ${title} on Jump`,
    html: layout('Competition invitation', intro, 'View competition', url, 'If you weren’t expecting this invitation, you can ignore it.'),
    text: `${intro}\n\nView competition: ${url}`,
  };
}

export function challengeReminderEmail(to: { address: string; name?: string }, title: string, url: string): MailMessage {
  const intro = `Your daily reminder for ${title}: record a walk or run today to keep moving up the board. Only verified activities during the competition count.`;
  return {
    to,
    subject: `Time to move · ${title}`,
    html: layout('Your daily competition reminder', intro, 'View competition', url, 'You receive this because you joined this competition. The host chose its daily reminder time.'),
    text: `${intro}\n\nView competition: ${url}\n\nYou receive this because you joined this competition.`,
  };
}

import type { MailMessage } from './mail.service';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Hosted on the web app so every mail client can load it; the alt text stands in when images are off. */
const WORDMARK = '<img src="https://startajump.com/email-wordmark.png" width="73" height="28" alt="JUMP" style="display:block;border:0;height:28px;width:73px">';
const SITE = 'https://startajump.com';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function layout(heading: string, intro: string, buttonLabel: string, url: string, footnote: string) {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html><body style="margin:0;background:#F2EFE8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#121212">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FBFAF6;border:1.5px solid #121212;border-radius:6px">
        <tr><td style="padding:28px 28px 8px">${WORDMARK}</td></tr>
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

/**
 * The founder's hello, sent when someone signs up. Deliberately a plain personal note, not a branded
 * template, and replies go to a real inbox.
 */
/** First moves for a new runner, shown under the note. */
const FIRST_MOVES: Array<[string, string]> = [
  ['Join a free competition', 'Your next walk or run counts toward it straight away.'],
  ['Record with your phone', 'Every kilometre is checked before it counts, so the board is fair.'],
  ['Bring a friend', 'Racing someone you know is the best reason to get out the door.'],
];

/**
 * A personal note from the founder, in Jump's own look: the wordmark, a volt welcome, the note, three
 * first moves and one button. Sent from Laolu, and replies go to a real inbox.
 */
export function welcomeEmail(to: { address: string; name?: string }): MailMessage {
  const first = to.name?.trim().split(/\s+/)[0];
  const paragraphs = [
    first ? `Hey ${first}!` : 'Hey!',
    'I’m glad you signed up to join our community! ❤️',
    'I’m Laolu, founder of Jump, and I’m happy to have you here.',
    'We’re building something exciting, and since you’re here early, I’d love for you to be part of the journey. You can join challenges, compete with people around the world, climb leaderboards, and eventually meet people you probably wouldn’t have met otherwise, all through something as simple as walking or running.',
    'If you have any issues, questions, or ideas on how we can make Jump better, just hit reply. I read the replies myself, and I’d love to hear from you!',
    'See you on the Jump,',
  ];
  const moves = FIRST_MOVES.map(([title, body], index) => `
          <tr><td style="padding:${index ? '14px' : '0'} 0 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="34" valign="top"><div style="width:26px;height:26px;border:1.5px solid #121212;border-radius:6px;background:${index === 0 ? '#E4FF3A' : '#FBFAF6'};font-size:13px;font-weight:800;line-height:26px;text-align:center">${index + 1}</div></td>
              <td valign="top" style="font-size:15px;line-height:1.45"><b>${title}</b><br><span style="color:#55524B">${body}</span></td>
            </tr></table>
          </td></tr>`).join('');
  const html = `<!doctype html>
<html><body style="margin:0;background:#F2EFE8;font-family:${FONT};color:#121212">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FBFAF6;border:1.5px solid #121212;border-radius:12px;overflow:hidden">
        <tr><td style="padding:24px 28px">${WORDMARK}</td></tr>
        <tr><td style="background:#E4FF3A;border-top:1.5px solid #121212;border-bottom:1.5px solid #121212;padding:28px">
          <div style="font-size:30px;font-weight:900;line-height:1.05;letter-spacing:-0.01em;text-transform:uppercase">Welcome to Jump${first ? `,<br>${escapeHtml(first)}` : ''}.</div>
          <div style="margin-top:10px;font-size:15px;line-height:1.5">Walk, run and ride in competitions with your friends, your club and your city.</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;font-size:16px;line-height:1.6">
          ${paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('\n          ')}
          <p style="margin:0">Laolu<br><span style="color:#55524B">Founder, Jump</span></p>
        </td></tr>
        <tr><td style="padding:20px 28px 0"><div style="border-top:1px solid #DCD7CC;padding-top:22px;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#55524B">Your first moves</div></td></tr>
        <tr><td style="padding:14px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${moves}
        </table></td></tr>
        <tr><td style="padding:26px 28px 28px">
          <a href="${SITE}/dashboard" style="display:inline-block;background:#FF4D12;color:#121212;border:1.5px solid #121212;border-radius:6px;padding:14px 24px;font-size:14px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none">Find a competition</a>
        </td></tr>
      </table>
      <div style="max-width:520px;padding:16px 8px 0;font-size:12px;line-height:1.5;color:#8A857B;text-align:center">You’re getting this because you created a Jump account. Reply any time, it reaches a real person.</div>
    </td></tr>
  </table>
</body></html>`;
  const text = `${paragraphs.join('\n\n')}\n\nLaolu\nFounder, Jump\n\nYour first moves:\n${FIRST_MOVES.map(([title, body], index) => `${index + 1}. ${title}: ${body}`).join('\n')}\n\nFind a competition: ${SITE}/dashboard`;
  return {
    to,
    subject: 'Welcome to Jump ❤️',
    html,
    text,
    fromName: 'Laolu from Jump',
    replyTo: 'start@startajump.com',
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

export function adminCodeEmail(to: { address: string }, code: string, purpose: 'login' | 'confirm'): MailMessage {
  const intro = purpose === 'login'
    ? `Your Jump admin sign-in code is ${code}. It works once, for 10 minutes.`
    : `Your code to confirm this admin action is ${code}. It works once, for 10 minutes.`;
  return {
    to,
    subject: purpose === 'login' ? `${code} is your Jump admin code` : `${code} confirms your Jump admin action`,
    html: layout(purpose === 'login' ? 'Admin sign-in' : 'Confirm admin action', intro, 'Open Jump admin', 'https://admin.startajump.com', 'If you didn’t ask for this code, someone may be trying to get into the admin console. Tell the team.'),
    text: `${intro}\n\nIf you didn’t ask for this code, tell the team.`,
  };
}

export function prizeWonEmail(to: { address: string; name?: string }, prize: string, competition: string, dueDate: string, url: string): MailMessage {
  const intro = `You won ${prize} in ${competition} on Jump. Send your delivery details by ${dueDate} so it can reach you. After that date the prize passes to the next eligible finisher.`;
  return {
    to,
    subject: `You won ${prize} · send your delivery details`,
    html: layout('You won a prize', intro, 'Claim your prize', url, 'We only ask winners for delivery details, and only the team delivering your prize sees them.'),
    text: `${intro}\n\nClaim your prize: ${url}`,
  };
}

export function prizeReminderEmail(to: { address: string; name?: string }, prize: string, dueDate: string, url: string): MailMessage {
  const intro = `Your prize (${prize}) is waiting. Send your delivery details by ${dueDate}, or it passes to the next eligible finisher.`;
  return {
    to,
    subject: `Reminder: claim your ${prize}`,
    html: layout('Your prize is waiting', intro, 'Claim your prize', url, 'We only ask winners for delivery details.'),
    text: `${intro}\n\nClaim your prize: ${url}`,
  };
}

export function prizeShippedEmail(to: { address: string; name?: string }, prize: string, status: 'SHIPPED' | 'DELIVERED', note: string | null, url: string): MailMessage {
  const intro = status === 'SHIPPED'
    ? `Your ${prize} is on its way.${note ? ` ${note}` : ''}`
    : `Your ${prize} was marked delivered. Enjoy it, and tag the club when you post.`;
  return {
    to,
    subject: status === 'SHIPPED' ? `Your ${prize} has shipped` : `Your ${prize} was delivered`,
    html: layout(status === 'SHIPPED' ? 'Your prize is on its way' : 'Prize delivered', intro, 'View your prizes', url, 'Questions about delivery? Reply to start@startajump.com.'),
    text: `${intro}\n\n${url}`,
  };
}

export function clubInviteEmail(to: { address: string; name?: string }, club: string, inviter: string, url: string): MailMessage {
  const intro = `${inviter} invited you to join ${club} on Jump. See what the club is about, then join in one tap. Club competitions add you automatically.`;
  return {
    to,
    subject: `Join ${club} on Jump`,
    html: layout('You’re invited to a club', intro, 'See the club', url, 'If you weren’t expecting this invitation, you can ignore it.'),
    text: `${intro}\n\nSee the club: ${url}`,
  };
}

export function challengeReminderEmail(to: { address: string; name?: string }, title: string, url: string): MailMessage {
  const intro = `Your daily reminder for ${title}: record an eligible activity today to keep moving up the board. Only verified activities during the competition count.`;
  return {
    to,
    subject: `Time to move · ${title}`,
    html: layout('Your daily competition reminder', intro, 'View competition', url, 'You receive this because you joined this competition. The host chose its daily reminder time.'),
    text: `${intro}\n\nView competition: ${url}\n\nYou receive this because you joined this competition.`,
  };
}

export function activityUpdatesEmail(to: { address: string; name?: string }, titles: string[], url: string, settingsUrl: string): MailMessage {
  const intro = titles.length === 1 ? titles[0] : `You have ${titles.length} new updates: ${titles.slice(0, 3).join(' · ')}${titles.length > 3 ? ' · and more' : ''}`;
  return {
    to,
    subject: titles.length === 1 ? `${titles[0]} · Jump` : `${titles.length} new updates on Jump`,
    html: layout('Your Jump updates', intro, 'Open Jump', url, `You can turn off activity emails in your profile settings: ${settingsUrl}`),
    text: `${intro}\n\nOpen Jump: ${url}\n\nEmail settings: ${settingsUrl}`,
  };
}

export function streakReminderEmail(to: { address: string; name?: string }, days: number, url: string, settingsUrl: string): MailMessage {
  const streak = `${days}-day streak`;
  return {
    to,
    subject: `Keep your ${streak} alive 🔥`,
    html: layout(`Your ${streak} ends tonight`, `You haven’t moved yet today. A short walk, run or ride before midnight keeps the fire lit.`, 'Start an activity', url, `Turn off activity emails in your profile settings: ${settingsUrl}`),
    text: `Your ${streak} ends tonight. A short walk, run or ride before midnight keeps it going.\n\nStart: ${url}\n\nEmail settings: ${settingsUrl}`,
  };
}

export function competitionDigestEmail(to: { address: string; name?: string }, competitions: Array<{ title: string; entrants: number }>, url: string, settingsUrl: string): MailMessage {
  const intro = `Popular competitions on Jump: ${competitions.map((competition) => `${competition.title} (${competition.entrants} joined)`).join(' · ')}. Find one to move with.`;
  return {
    to,
    subject: 'Popular competitions on Jump',
    html: layout('Find your next competition', intro, 'Explore competitions', url, `Sent every three days. Turn it off in your profile settings: ${settingsUrl}`),
    text: `Popular competitions on Jump:\n${competitions.map((competition) => `• ${competition.title} — ${competition.entrants} joined`).join('\n')}\n\nExplore: ${url}\n\nEmail settings: ${settingsUrl}`,
  };
}

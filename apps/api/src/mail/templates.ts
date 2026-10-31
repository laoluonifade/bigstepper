import type { MailMessage } from './mail.service';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

const WORDMARK = '<img src="https://startajump.com/email-wordmark.png" width="73" height="28" alt="JUMP" style="display:block;border:0;height:28px;width:73px">';
const SITE = 'https://startajump.com';
const FONT = "Arial,Helvetica,sans-serif";

interface LayoutOptions {
  eyebrow?: string;
  preheader?: string;
  highlight?: { label: string; value: string };
  extra?: string;
  footerLink?: { label: string; url: string };
}

function layout(heading: string, intro: string, buttonLabel: string, url: string, footnote: string, options: LayoutOptions = {}) {
  const safeUrl = escapeHtml(url);
  const isCode = options.highlight?.label === 'One-time code';
  const highlight = options.highlight ? `<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFF3ED" style="background:#FFF3ED;border:1px solid #F0DBD1;border-radius:12px"><tr><td align="${isCode ? 'center' : 'left'}" style="padding:${isCode ? '18px 14px' : '14px 16px'}"><div style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:#8B351D">${escapeHtml(options.highlight.label)}</div><div style="padding-top:6px;font-size:${isCode ? '32px' : '17px'};font-family:${isCode ? 'Menlo,Consolas,monospace' : FONT};font-weight:700;line-height:1.25;letter-spacing:${isCode ? '0.16em' : 'normal'};color:#121212">${escapeHtml(options.highlight.value)}</div></td></tr></table></td></tr>` : '';
  const extra = options.extra ? `<tr><td style="padding:20px 24px 0">${options.extra}</td></tr>` : '';
  const footerLink = options.footerLink
    ? `<div style="padding-top:10px"><a href="${escapeHtml(options.footerLink.url)}" style="color:#55524B;text-decoration:underline">${escapeHtml(options.footerLink.label)}</a></div>`
    : '';
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;background:#F2EFE8;font-family:${FONT};color:#121212;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(options.preheader ?? intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EFE8" style="padding:24px 12px;background:#F2EFE8">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FBFAF6" style="max-width:560px;background:#FBFAF6;border:1px solid #E2DED5;border-radius:16px;overflow:hidden">
        <tr><td style="padding:20px 24px 16px;border-bottom:1px solid #EEEAE3">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>${WORDMARK}</td><td align="right" style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#777166">${escapeHtml(options.eyebrow ?? 'JUMP')}</td></tr></table>
          <div style="height:3px;width:30px;background:#FF4D12;border-radius:3px;margin-top:14px;font-size:1px;line-height:3px">&nbsp;</div>
        </td></tr>
        <tr><td style="padding:24px 24px 0">
          <h1 style="margin:0;font-family:${FONT};font-size:28px;font-weight:750;line-height:1.1;letter-spacing:-0.025em;color:#121212">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:12px 24px 0;font-family:${FONT};font-size:16px;line-height:1.55;color:#55524B">${escapeHtml(intro)}</td></tr>
        ${highlight}
        ${extra}
        <tr><td style="padding:22px 24px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FF4D12" style="background:#FF4D12;border-radius:9px">
          <a href="${safeUrl}" style="display:inline-block;background:#FF4D12;color:#121212;border-radius:9px;padding:14px 22px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;text-decoration:none">${escapeHtml(buttonLabel)}</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 24px 20px;border-top:1px solid #EEEAE3;font-family:${FONT};font-size:13px;line-height:1.55;color:#666157">
          ${escapeHtml(footnote)}${footerLink}<div style="padding-top:12px">Button not working? <a href="${safeUrl}" style="color:#55524B;text-decoration:underline;word-break:break-all">Open this link</a></div>
        </td></tr>
      </table>
      <div style="max-width:560px;padding:14px 8px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#777166;text-align:center">Keep moving. Keep jumping.</div>
    </td></tr>
  </table>
</body></html>`;
}

export function verificationEmail(to: { address: string; name?: string }, url: string): MailMessage {
  const intro = `${to.name ? `Hi ${to.name}, v` : 'V'}erify your email to enter paid competitions and recover your account.`;
  const footnote = 'This link expires in 24 hours. If you didn’t create a Jump account, you can ignore this email.';
  return {
    to,
    subject: 'Verify your email for Jump',
    html: layout('Verify your email', intro, 'Verify email', url, footnote, { eyebrow: 'ACCOUNT SECURITY', preheader: 'Confirm your email to finish setting up Jump.' }),
    text: `${intro}\n\nVerify your email: ${url}\n\n${footnote}`,
  };
}

const FIRST_MOVES: Array<[string, string]> = [
  ['Join a free competition', 'Your next walk or run counts toward it straight away.'],
  ['Record with your phone', 'Every kilometre is checked before it counts, so the board is fair.'],
  ['Bring a friend', 'Racing someone you know is the best reason to get out the door.'],
];

export function welcomeEmail(to: { address: string; name?: string }): MailMessage {
  const first = to.name?.trim().split(/\s+/)[0];
  const paragraphs = [
    first ? `Hey ${first}!` : 'Hey!',
    'I’m Laolu, founder of Jump. I’m glad you’re here.',
    'Jump brings people together through walking, running and riding. Join a competition, find your place on the leaderboard, and invite someone to move with you.',
    'If you have a question or idea, just hit reply. I read every message.',
    'See you on the Jump,',
  ];
  const moves = FIRST_MOVES.map(([title, body], index) => `
          <tr><td style="padding:${index ? '13px' : '0'} 0 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="36" valign="top"><div style="width:26px;height:26px;border-radius:8px;background:${index === 0 ? '#E4FF3A' : '#F2EFE8'};font-size:13px;font-weight:700;line-height:26px;text-align:center;color:#121212">${index + 1}</div></td>
              <td valign="top" style="font-size:15px;line-height:1.45;color:#121212"><b>${escapeHtml(title)}</b><br><span style="color:#55524B">${escapeHtml(body)}</span></td>
            </tr></table>
          </td></tr>`).join('');
  const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;background:#F2EFE8;font-family:${FONT};color:#121212;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">A note from Laolu, plus three ways to get moving.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EFE8" style="padding:24px 12px;background:#F2EFE8"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FBFAF6" style="max-width:560px;background:#FBFAF6;border:1px solid #E2DED5;border-radius:16px;overflow:hidden">
      <tr><td style="padding:20px 24px 16px;border-bottom:1px solid #EEEAE3">${WORDMARK}</td></tr>
      <tr><td bgcolor="#E4FF3A" style="background:#E4FF3A;padding:24px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#363B10">A note from the founder</div>
        <h1 style="margin:8px 0 0;font-family:${FONT};font-size:30px;line-height:1.08;letter-spacing:-0.03em;font-weight:750;color:#121212">Welcome to Jump${first ? `, ${escapeHtml(first)}` : ''}.</h1>
        <div style="margin-top:10px;font-size:16px;line-height:1.5;color:#24231F">Walk, run and ride in competitions with your friends, your club and your city.</div>
      </td></tr>
      <tr><td style="padding:24px 24px 6px;font-size:15px;line-height:1.55;color:#25231F">
        ${paragraphs.map((paragraph) => `<p style="margin:0 0 13px">${escapeHtml(paragraph)}</p>`).join('\n        ')}
        <p style="margin:0">Laolu<br><span style="color:#666157">Founder, Jump</span></p>
      </td></tr>
      <tr><td style="padding:20px 24px 0"><div style="border-top:1px solid #E2DED5;padding-top:18px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#55524B">Your first moves</div></td></tr>
      <tr><td style="padding:14px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${moves}</table></td></tr>
      <tr><td style="padding:22px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#FF4D12" style="background:#FF4D12;border-radius:9px"><a href="${SITE}/dashboard" style="display:inline-block;background:#FF4D12;color:#121212;border-radius:9px;padding:14px 22px;font-size:14px;line-height:20px;font-weight:700;text-decoration:none">Find a competition</a></td></tr></table></td></tr>
    </table>
    <div style="max-width:560px;padding:14px 8px 0;font-size:12px;line-height:1.5;color:#777166;text-align:center">You’re getting this because you created a Jump account. Reply any time, it reaches a real person.</div>
  </td></tr></table>
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
  const intro = 'Someone requested a password reset for your Jump account. If that was you, choose a new password below.';
  const footnote = 'This link expires in 1 hour and signs you out everywhere once used. If you didn’t ask for this, ignore this email. Your password won’t change.';
  return {
    to,
    subject: 'Reset your Jump password',
    html: layout('Reset your password', intro, 'Choose a new password', url, footnote, { eyebrow: 'ACCOUNT SECURITY', preheader: 'The secure link expires in one hour. Your current password stays unchanged.' }),
    text: `${intro}\n\nChoose a new password: ${url}\n\n${footnote}`,
  };
}

export function challengeInviteEmail(to: { address: string; name?: string }, title: string, url: string): MailMessage {
  const intro = `You’ve been invited to ${title} on Jump. Open the competition to see the rules and join when you’re ready.`;
  return {
    to,
    subject: `Join ${title} on Jump`,
    html: layout(title, intro, 'View competition', url, 'If you weren’t expecting this invitation, you can ignore it.', { eyebrow: 'YOU’RE INVITED', preheader: 'See the rules and decide if you want to join.' }),
    text: `${intro}\n\nView competition: ${url}\n\nIf you weren’t expecting this invitation, you can ignore it.`,
  };
}

export function adminCodeEmail(to: { address: string }, code: string, purpose: 'login' | 'confirm'): MailMessage {
  const intro = purpose === 'login'
    ? `Your Jump admin sign-in code is ${code}. It works once, for 10 minutes.`
    : `Your code to confirm this admin action is ${code}. It works once, for 10 minutes.`;
  return {
    to,
    subject: purpose === 'login' ? `${code} is your Jump admin code` : `${code} confirms your Jump admin action`,
    html: layout(purpose === 'login' ? 'Admin sign-in' : 'Confirm admin action', purpose === 'login' ? 'Enter this one-time code to sign in to Jump Admin.' : 'Enter this one-time code to approve the admin action you started.', 'Open Jump admin', 'https://admin.startajump.com', 'This code works once and expires in 10 minutes. If you didn’t request it, tell the team.', { eyebrow: 'SECURE ACCESS', highlight: { label: 'One-time code', value: code }, preheader: purpose === 'login' ? 'Use this one-time code to sign in to Jump Admin.' : 'Use this one-time code to confirm your admin action.' }),
    text: `${intro}\n\nOpen Jump Admin: https://admin.startajump.com\n\nIf you didn’t ask for this code, tell the team.`,
  };
}

export function prizeWonEmail(to: { address: string; name?: string }, prize: string, competition: string, dueDate: string, url: string): MailMessage {
  const intro = `You won ${prize} in ${competition} on Jump. Send your delivery details by ${dueDate} so it can reach you. After that date the prize passes to the next eligible finisher.`;
  return {
    to,
    subject: `You won ${prize} · send your delivery details`,
    html: layout(`You won ${prize}`, `You finished strong in ${competition}. Send your delivery details before the deadline to receive your prize. If you miss the date, the prize passes to the next eligible finisher.`, 'Claim your prize', url, 'We only ask winners for delivery details, and only the team delivering your prize sees them.', { eyebrow: 'A WIN WORTH CELEBRATING', highlight: { label: 'Send your details by', value: dueDate }, preheader: `You won ${prize} in ${competition}.` }),
    text: `${intro}\n\nClaim your prize: ${url}`,
  };
}

export function prizeReminderEmail(to: { address: string; name?: string }, prize: string, dueDate: string, url: string): MailMessage {
  const intro = `Your prize (${prize}) is waiting. Send your delivery details by ${dueDate}, or it passes to the next eligible finisher.`;
  return {
    to,
    subject: `Reminder: claim your ${prize}`,
    html: layout(`${prize} is waiting`, `Send your delivery details by ${dueDate} so we can get your prize to you. If you miss the date, it passes to the next eligible finisher.`, 'Claim your prize', url, 'We only ask winners for delivery details.', { eyebrow: 'PRIZE REMINDER', highlight: { label: 'Deadline', value: dueDate }, preheader: `Claim ${prize} by ${dueDate} to receive it.` }),
    text: `${intro}\n\nClaim your prize: ${url}`,
  };
}

export function prizeShippedEmail(to: { address: string; name?: string }, prize: string, status: 'SHIPPED' | 'DELIVERED', note: string | null, url: string): MailMessage {
  const intro = status === 'SHIPPED'
    ? `Your ${prize} is on its way.${note ? ` ${note}` : ''}`
    : `Your ${prize} was marked delivered. Enjoy it.`;
  return {
    to,
    subject: status === 'SHIPPED' ? `Your ${prize} has shipped` : `Your ${prize} was delivered`,
    html: layout(status === 'SHIPPED' ? `${prize} is on its way` : `${prize} was delivered`, intro, 'View your prizes', url, 'Questions about delivery? Reply to start@startajump.com.', { eyebrow: status === 'SHIPPED' ? 'PRIZE SHIPPED' : 'PRIZE DELIVERED', highlight: { label: 'Status', value: status === 'SHIPPED' ? 'On its way' : 'Delivered' }, preheader: status === 'SHIPPED' ? 'See the current shipping note in Jump.' : 'See the current delivery status in Jump.' }),
    text: `${intro}\n\n${url}`,
  };
}

export function clubInviteEmail(to: { address: string; name?: string }, club: string, inviter: string, url: string): MailMessage {
  const intro = `${inviter} invited you to join ${club} on Jump. See what the club is about, then join in one tap. Club competitions add you automatically.`;
  return {
    to,
    subject: `Join ${club} on Jump`,
    html: layout(club, intro, 'See the club', url, 'If you weren’t expecting this invitation, you can ignore it.', { eyebrow: `INVITED BY ${inviter}`, preheader: 'See what joining this club adds to your Jump experience.' }),
    text: `${intro}\n\nSee the club: ${url}\n\nIf you weren’t expecting this invitation, you can ignore it.`,
  };
}

export function challengeReminderEmail(to: { address: string; name?: string }, title: string, url: string): MailMessage {
  const intro = `Your daily reminder for ${title}: record an eligible activity today to keep moving up the board. Only verified activities during the competition count.`;
  return {
    to,
    subject: `Time to move · ${title}`,
    html: layout(title, 'A little movement today can move you up the board. Record an eligible activity before the day ends.', 'View competition', url, 'You receive this because you joined this competition. The host chose its daily reminder time.', { eyebrow: 'TODAY’S CHALLENGE', preheader: 'A little movement today can move you up the board.' }),
    text: `${intro}\n\nView competition: ${url}\n\nYou receive this because you joined this competition.`,
  };
}

export function activityUpdatesEmail(to: { address: string; name?: string }, titles: string[], url: string, settingsUrl: string): MailMessage {
  const intro = titles.length === 1 ? titles[0] : `You have ${titles.length} new updates on Jump.`;
  const visibleTitles = titles.slice(0, 5);
  const updates = visibleTitles.map((title) => `<tr><td style="padding:11px 14px;border-bottom:1px solid #E8E3D9;font-size:15px;font-weight:700;line-height:1.45;color:#25231F">${escapeHtml(title)}</td></tr>`).join('');
  return {
    to,
    subject: titles.length === 1 ? `${titles[0]} · Jump` : `${titles.length} new updates on Jump`,
    html: layout(titles.length === 1 ? 'A new Jump update' : `${titles.length} new updates`, 'Here’s what’s new since your last visit.', 'Open Jump', url, 'Choose which activity emails you receive.', { eyebrow: 'YOUR COMMUNITY', extra: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="border:1px solid #E8E3D9;border-radius:12px;background:#FFFFFF">${updates}</table>`, footerLink: { label: 'Email preferences', url: settingsUrl }, preheader: titles.length === 1 ? 'Open Jump to see your new update.' : `You have ${titles.length} updates waiting in Jump.` }),
    text: `${titles.length === 1 ? intro : `${intro}:\n${visibleTitles.map((title) => `• ${title}`).join('\n')}${titles.length > visibleTitles.length ? `\n…and ${titles.length - visibleTitles.length} more in Jump` : ''}`}\n\nOpen Jump: ${url}\n\nEmail settings: ${settingsUrl}`,
  };
}

export function streakReminderEmail(to: { address: string; name?: string }, days: number, url: string, settingsUrl: string): MailMessage {
  const streak = `${days}-day streak`;
  return {
    to,
    subject: `Keep your ${streak} alive 🔥`,
    html: layout(`Keep your ${streak} going`, 'You haven’t moved yet today. A short walk, run or ride before midnight keeps the fire lit.', 'Start an activity', url, 'You can change your activity email preferences at any time.', { eyebrow: 'YOUR MOVEMENT STREAK', highlight: { label: 'Current streak', value: streak }, footerLink: { label: 'Email preferences', url: settingsUrl }, preheader: 'A short activity today keeps your current streak going.' }),
    text: `Your ${streak} ends tonight. A short walk, run or ride before midnight keeps it going.\n\nStart: ${url}\n\nEmail settings: ${settingsUrl}`,
  };
}

export interface CompetitionDigestItem {
  title: string;
  entrants: number;
  challengeType: string;
  format: string;
  scoringMethod: string;
  bannerUrl: string | null;
  code: string;
}

function digestActivity(type: string) {
  const value = type.toUpperCase();
  if (value === 'RUN') return { label: 'Run', icon: '🏃' };
  if (value === 'WALK') return { label: 'Walk', icon: '🚶' };
  if (value === 'CYCLING') return { label: 'Cycle', icon: '🚴' };
  if (value === 'STEP') return { label: 'Steps', icon: '👟' };
  if (value === 'TIMED') return { label: 'Timed activity', icon: '⏱' };
  return { label: 'Distance', icon: '📍' };
}

function digestFormat(format: string) {
  const value = format.toLowerCase();
  if (value === 'open') return 'Virtual';
  if (value === 'invite') return 'Invite only';
  if (value === 'head_to_head') return 'Head to head';
  return digestScoring(format);
}

function digestScoring(method: string) {
  return method.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function competitionDigestEmail(to: { address: string; name?: string }, competitions: CompetitionDigestItem[], origin: string, url: string, settingsUrl: string): MailMessage {
  const safeUrl = escapeHtml(url);
  const safeSettingsUrl = escapeHtml(settingsUrl);
  const first = to.name?.trim().split(/\s+/)[0];
  const competitionUrl = (code: string) => `${origin.replace(/\/+$/, '')}/competitions/${encodeURIComponent(code)}`;
  const cards = competitions.map((competition) => {
    const activity = digestActivity(competition.challengeType);
    const link = escapeHtml(competitionUrl(competition.code));
    return `<tr><td style="padding:0 20px 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #E7E3DC;border-radius:13px;overflow:hidden">
        ${competition.bannerUrl ? `<tr><td style="padding:0"><a href="${link}" style="display:block;text-decoration:none"><img src="${escapeHtml(competition.bannerUrl)}" width="520" alt="Banner for ${escapeHtml(competition.title)}" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px 12px 0 0"></a></td></tr>` : ''}
        <tr><td style="padding:15px 16px 16px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#E5F5EC" style="background:#E5F5EC;border-radius:999px;padding:5px 9px;font-family:${FONT};font-size:10px;font-weight:700;color:#286443">Competition</td><td style="padding-left:9px;font-family:${FONT};font-size:13px;color:#68645D">${escapeHtml(activity.label)} · ${escapeHtml(digestFormat(competition.format))}</td></tr></table>
          <div style="padding-top:10px;font-family:${FONT};font-size:19px;font-weight:700;line-height:1.2;color:#121212"><a href="${link}" style="color:#121212;text-decoration:none">${escapeHtml(competition.title)}</a></div>
          <div style="padding-top:5px;font-family:${FONT};font-size:14px;line-height:1.45;color:#68645D">${escapeHtml(digestScoring(competition.scoringMethod))}</div>
          <div style="padding-top:13px;border-top:1px solid #EEEAE3;margin-top:13px;font-family:${FONT};font-size:13px;line-height:1.4;color:#55524B"><span style="color:#C94722;font-weight:700">${competition.entrants.toLocaleString('en-US')}</span> people joined</div>
        </td></tr>
      </table>
    </td></tr>`;
  }).join('');
  const greeting = first ? `Hi ${escapeHtml(first)}, ` : '';
  const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;background:#F2EFE8;font-family:${FONT};color:#121212;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">A few current competitions to explore on Jump.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EFE8" style="background:#F2EFE8">
    <tr><td align="center" style="padding:20px 12px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FBFAF6" style="max-width:560px;background:#FBFAF6;border:1px solid #E2DED5;border-radius:16px;overflow:hidden">
        <tr><td style="padding:20px 22px 15px;border-bottom:1px solid #EEEAE3">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="90" valign="middle">${WORDMARK}</td><td align="right" valign="middle" style="font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.1em;color:#68645D">EXPLORE</td></tr></table>
          <div style="height:3px;width:30px;background:#FF4D12;border-radius:3px;margin-top:14px;font-size:1px;line-height:3px">&nbsp;</div>
        </td></tr>
        <tr><td style="padding:23px 20px 16px">
          <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;color:#B83B18">Popular on Jump</div>
          <h1 style="margin:8px 0 0;font-family:${FONT};font-size:29px;font-weight:750;line-height:1.06;letter-spacing:-0.03em;color:#121212">There’s always a new way to move.</h1>
          <div style="padding-top:11px;font-family:${FONT};font-size:16px;line-height:1.5;color:#55524B">${greeting}Discover what’s happening on Jump. Find competitions and see who’s leading the way.</div>
        </td></tr>
        ${cards}
        <tr><td style="padding:2px 20px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FF4D12" style="background:#FF4D12;border-radius:9px">
            <a href="${safeUrl}" style="display:inline-block;min-height:20px;padding:14px 20px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:#121212;border-radius:9px;text-decoration:none">Explore all competitions</a>
          </td></tr></table>
          <div style="padding-top:10px;font-family:${FONT};font-size:14px;line-height:1.45;color:#55524B">Your next challenge could be one tap away.</div>
        </td></tr>
        <tr><td style="padding:24px 20px 18px">
          <div style="border-top:1px solid #E2DED5;padding-top:15px;font-family:${FONT};font-size:12px;color:#55524B">Keep moving. Keep jumping.</div>
          <div style="padding-top:10px;font-family:${FONT};font-size:12px;line-height:1.5;color:#777166">You’re receiving this because competition picks are enabled on your Jump profile. <a href="${safeSettingsUrl}" style="color:#55524B;text-decoration:underline">Email preferences</a></div>
          <div style="padding-top:10px;font-family:${FONT};font-size:11px;color:#777166">Button not working? <a href="${safeUrl}" style="color:#55524B;text-decoration:underline;word-break:break-all">Open all competitions</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const plain = competitions.map((competition) => {
    const activity = digestActivity(competition.challengeType);
    return `• ${competition.title}\n  ${activity.label} · ${digestScoring(competition.scoringMethod)} · ${competition.entrants} joined\n  ${competitionUrl(competition.code)}`;
  }).join('\n\n');
  return {
    to,
    subject: 'Popular competitions on Jump',
    html,
    text: `THERE’S ALWAYS A NEW WAY TO MOVE.\n\nDiscover what’s happening on Jump. Find competitions and see who’s leading the way.\n\n${plain}\n\nExplore all competitions: ${url}\nYour next challenge could be one tap away.\n\nKeep moving. Keep jumping.\nEmail preferences: ${settingsUrl}`,
  };
}

export interface EventEmail {
  title: string;
  club: string;
  when: string;
  venue: string;
  address: string | null;
  accent: string;
  coverUrl: string | null;
  directionsUrl: string | null;
}

function eventShell(preheader: string, banner: string, body: string, footer: string) {
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;background:#F2EFE8;font-family:${FONT};color:#121212;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EFE8" style="padding:22px 12px;background:#F2EFE8">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FBFAF6" style="max-width:560px;background:#FBFAF6;border:1px solid #E2DED5;border-radius:16px;overflow:hidden">
        <tr><td style="padding:19px 22px 15px;border-bottom:1px solid #EEEAE3"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>${WORDMARK}</td><td align="right" style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#777166">JUMP EVENTS</td></tr></table></td></tr>
        ${banner}
        ${body}
      </table>
      <div style="max-width:560px;padding:14px 8px 0;font-size:12px;line-height:1.5;color:#777166;text-align:center">${footer}</div>
    </td></tr>
  </table>
</body></html>`;
}

function onAccent(hex: string) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255);
  const luminance = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? '#121212' : '#FFFFFF';
}

function eventBanner(event: EventEmail, eyebrow: string, state: 'cancelled' | 'normal' = 'normal') {
  const background = state === 'cancelled' ? '#FCE9E6' : event.accent;
  const ink = state === 'cancelled' ? '#7C2517' : onAccent(event.accent);
  const cover = event.coverUrl && state !== 'cancelled'
    ? `<tr><td><img src="${escapeHtml(event.coverUrl)}" width="560" alt="Cover image for ${escapeHtml(event.title)}" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>`
    : '';
  const venue = [event.venue, event.address].filter(Boolean).join(', ');
  return `${cover}
        <tr><td bgcolor="${background}" style="background:${background};color:${ink};padding:21px 24px 22px">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(eyebrow)}</div>
          <h1 style="margin:8px 0 0;font-family:${FONT};font-size:26px;font-weight:750;line-height:1.08;letter-spacing:-0.02em;color:${ink}">${escapeHtml(event.title)}</h1>
          <div style="margin-top:12px;font-size:16px;line-height:1.4;font-weight:700;color:${ink}">${escapeHtml(event.when)}</div>
          <div style="margin-top:4px;font-size:14px;line-height:1.45;color:${ink}">${escapeHtml(venue)}</div>
        </td></tr>`;
}

function button(label: string, url: string, tone: 'primary' | 'quiet' = 'primary') {
  const style = tone === 'primary'
    ? 'background:#FF4D12;color:#121212;border:1px solid #FF4D12'
    : 'background:#FBFAF6;color:#121212;border:1px solid #DCD7CC';
  return `<a href="${escapeHtml(url)}" style="display:inline-block;${style};border-radius:9px;padding:13px 19px;min-height:20px;font-size:14px;line-height:20px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;
}

function linkFallback(url: string) {
  const safeUrl = escapeHtml(url);
  return `<div style="padding-top:12px;font-size:12px;line-height:1.5;color:#666157">Button not working? <a href="${safeUrl}" style="color:#55524B;text-decoration:underline;word-break:break-all">Open your pass</a></div>`;
}

export function eventTicketEmail(to: { address: string; name?: string }, event: EventEmail, pass: { code: string; ticketType: string; url: string; qrUrl: string }): MailMessage {
  const first = to.name?.trim().split(/\s+/)[0];
  const body = `
        <tr><td style="padding:21px 24px 0;font-size:16px;line-height:1.5;color:#25231F">${first ? `${escapeHtml(first)}, you’re in.` : 'You’re in.'} Show this pass when you arrive. The host can check you in with the QR or pass code below.</td></tr>
        <tr><td style="padding:17px 24px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="border:1px solid #E7E3DC;border-radius:14px;background:#FFFFFF;overflow:hidden">
            <tr><td style="padding:15px 17px 0"><div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#777166">Pass holder</div><div style="margin-top:4px;font-size:16px;line-height:1.4;font-weight:700;color:#121212">${escapeHtml(to.name ?? 'Pass holder')}</div><div style="margin-top:11px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#777166">Ticket type</div><div style="margin-top:4px;font-size:15px;line-height:1.4;color:#121212">${escapeHtml(pass.ticketType)}</div></td></tr>
            <tr><td align="center" style="padding:16px 16px 0"><img src="${escapeHtml(pass.qrUrl)}" width="160" height="160" alt="Jump event pass QR code for ${escapeHtml(pass.code)}. The pass code is also shown below." style="display:block;width:160px;height:160px;border:0;background:#FFFFFF"></td></tr>
            <tr><td align="center" style="padding:11px 16px 17px"><div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#777166">Pass code</div><div style="margin-top:5px;font-family:Menlo,Consolas,monospace;font-size:22px;line-height:1.25;font-weight:700;letter-spacing:0.08em;color:#121212">${escapeHtml(pass.code)}</div></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 24px 0">${button('View my pass', pass.url)}${event.directionsUrl ? `<div style="padding-top:12px"><a href="${escapeHtml(event.directionsUrl)}" style="font-size:14px;color:#55524B;text-decoration:underline">Get directions</a></div>` : ''}${linkFallback(pass.url)}</td></tr>
        <tr><td style="padding:18px 24px 23px;font-size:14px;line-height:1.5;color:#666157">Keep this email. Your pass opens without the app or a password.</td></tr>`;
  return {
    to,
    subject: `Your pass: ${event.title}`,
    html: eventShell(`Your pass for ${event.title}. ${event.when}.`, eventBanner(event, `${event.club} · Your pass`), body,
      `You’re getting this because you registered for ${escapeHtml(event.title)} on Jump.`),
    text: `You're in for ${event.title} with ${event.club}.\n\nWhen: ${event.when}\nWhere: ${[event.venue, event.address].filter(Boolean).join(', ')}\nTicket: ${pass.ticketType}\nPass holder: ${to.name ?? 'Pass holder'}\nPass code: ${pass.code}\n\nView your pass: ${pass.url}${event.directionsUrl ? `\nDirections: ${event.directionsUrl}` : ''}`,
    replyTo: 'start@startajump.com',
  };
}

export function eventReminderEmail(to: { address: string; name?: string }, event: EventEmail, heading: string, passUrl: string): MailMessage {
  const body = `
        <tr><td style="padding:21px 24px 0;font-size:16px;line-height:1.5;color:#25231F">${escapeHtml(heading)}. Keep your pass ready so the host can check you in.</td></tr>
        <tr><td style="padding:20px 24px 23px">${button('Show my pass', passUrl)}${event.directionsUrl ? `<div style="padding-top:12px"><a href="${escapeHtml(event.directionsUrl)}" style="font-size:14px;color:#55524B;text-decoration:underline">Get directions</a></div>` : ''}${linkFallback(passUrl)}</td></tr>`;
  return {
    to,
    subject: `${heading}: ${event.title}`,
    html: eventShell(`${event.when} at ${event.venue}. Reopen your pass.`, eventBanner(event, `${event.club} · Reminder`), body, `You’re getting this because you have a pass for ${escapeHtml(event.title)}.`),
    text: `${heading}: ${event.title} with ${event.club}.\nWhen: ${event.when}\nWhere: ${[event.venue, event.address].filter(Boolean).join(', ')}\n\nYour pass: ${passUrl}${event.directionsUrl ? `\nDirections: ${event.directionsUrl}` : ''}`,
  };
}

export function eventChangedEmail(to: { address: string; name?: string }, event: EventEmail, changes: string[], passUrl: string): MailMessage {
  const changeRows = changes.map((change) => `<tr><td style="padding:9px 0;border-bottom:1px solid #EEEAE3;font-size:15px;line-height:1.45;color:#25231F">${escapeHtml(change)}</td></tr>`).join('');
  const body = `
        <tr><td style="padding:21px 24px 0;font-size:16px;line-height:1.5;color:#25231F">${escapeHtml(event.club)} updated this event. Here are the fields that changed. Your existing pass still works.</td></tr>
        <tr><td style="padding:15px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFF8F4" style="background:#FFF8F4;border:1px solid #F0DBD1;border-radius:12px"><tr><td style="padding:13px 15px"><div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#8B351D">Updated details</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:7px">${changeRows}</table></td></tr></table></td></tr>
        <tr><td style="padding:20px 24px 23px">${button('Show my pass', passUrl)}${linkFallback(passUrl)}</td></tr>`;
  return {
    to,
    subject: `Update: ${event.title} has a new ${changes[0]}`,
    html: eventShell(`${event.title} details changed. Your pass still works.`, eventBanner(event, `${event.club} · Details updated`), body, `You’re getting this because you have a pass for ${escapeHtml(event.title)}.`),
    text: `${event.club} changed ${changes.join(' and ')} for ${event.title}.\n\nWhen: ${event.when}\nWhere: ${[event.venue, event.address].filter(Boolean).join(', ')}\nYour pass still works.\n\nYour pass: ${passUrl}`,
  };
}

export function eventCancelledEmail(to: { address: string; name?: string }, event: EventEmail, exploreUrl: string): MailMessage {
  const body = `
        <tr><td style="padding:21px 24px 0;font-size:16px;line-height:1.5;color:#25231F">${escapeHtml(event.club)} has called off this event, so your pass won’t be needed. Sorry about that. There are other runs and meet-ups on Jump.</td></tr>
        <tr><td style="padding:20px 24px 23px">${button('Find another event', exploreUrl)}</td></tr>`;
  return {
    to,
    subject: `Called off: ${event.title}`,
    html: eventShell(`${event.title} has been cancelled. Find another event on Jump.`, eventBanner(event, 'Event cancelled', 'cancelled'), body, `You’re getting this because you had a pass for ${escapeHtml(event.title)}.`),
    text: `${event.club} has called off ${event.title}. Your pass won't be needed.\n\nFind another event: ${exploreUrl}`,
  };
}

export function eventGuestWelcomeEmail(to: { address: string; name?: string }, event: { title: string; club: string }, links: { setPassword: string; app: string; unsubscribe: string | null }): MailMessage {
  const first = to.name?.trim().split(/\s+/)[0];
  const greeting = first ? `${escapeHtml(first)}, your pass works already.` : 'Your pass works already.';
  const body = `
        <tr><td bgcolor="#E4FF3A" style="background:#E4FF3A;padding:22px 24px">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#363B10">For ${escapeHtml(event.title)}</div>
          <h1 style="margin:8px 0 0;font-family:${FONT};font-size:25px;font-weight:750;line-height:1.1;letter-spacing:-0.02em;color:#121212">${greeting}</h1>
          <div style="margin-top:9px;font-size:15px;line-height:1.5;color:#24231F">Your pass is in the separate ticket email. You don’t need a password or the app to get in.</div>
        </td></tr>
        <tr><td style="padding:22px 24px 0;font-size:15px;line-height:1.55;color:#25231F">We created a free Jump account to keep your event passes together. If you want to sign in later, set a password below.</td></tr>
        <tr><td style="padding:17px 24px 0">${button('Set a password', links.setPassword, 'quiet')}</td></tr>
        <tr><td style="padding:14px 24px 22px;font-size:14px"><a href="${escapeHtml(links.app)}" style="color:#55524B;font-weight:700;text-decoration:underline">Get the Jump app</a></td></tr>`;
  const footer = links.unsubscribe
    ? `You chose to hear about other runs and events. <a href="${escapeHtml(links.unsubscribe)}" style="color:#55524B;text-decoration:underline">Unsubscribe</a> any time.`
    : 'We’ll only email you about passes you register for.';
  return {
    to,
    subject: 'Your Jump account is ready',
    html: eventShell('Your event pass works already. Account setup is optional.', '', body, footer),
    text: `Your pass for ${event.title} is in the separate ticket email and works without a password or the app.\n\nWe created a free Jump account to keep your passes together. Set a password if you want to sign in: ${links.setPassword}\nGet the Jump app: ${links.app}${links.unsubscribe ? `\n\nUnsubscribe from event news: ${links.unsubscribe}` : '\n\nWe’ll only email you about passes you register for.'}`,
    replyTo: 'start@startajump.com',
  };
}

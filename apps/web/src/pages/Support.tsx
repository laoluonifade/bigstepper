import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';

const EMAIL = 'start@startajump.com';

const QUESTIONS: Array<{ q: string; a: string }> = [
  { q: 'My walk, run or ride didn’t count', a: 'Jump counts distance from GPS, after checking the route. Record outdoors with location set to “Always” (or keep Jump open), and keep moving: distance counts once GPS sees you leave the spot you started. An activity can be flagged if it looks like it wasn’t done on foot or by bike; open it in Jump to see why.' },
  { q: 'Steps aren’t adding distance', a: 'Steps count as steps (for step competitions), not as distance. That keeps it fair: a phone can count steps without anyone moving.' },
  { q: 'Payments, entry fees and payouts', a: 'Card payments go through Paystack. A pending payment shows on your dashboard until it’s confirmed. Winnings are paid to the bank account in your wallet once the competition is settled.' },
  { q: 'Claiming a prize', a: 'Winners get a claim form under You → Prizes. Fill it in before the date shown, and the club will be in touch about delivery.' },
  { q: 'Deleting your account', a: `In the app, go to You → Account → Delete account. If you can’t sign in, email ${EMAIL} from the address on your account. Some payment records are kept, without your name, as the law requires; see the Privacy Policy.` },
  { q: 'Reporting a runner, club or post', a: `Email ${EMAIL} with the username or link. For anything urgent about someone’s safety, contact local emergency services first.` },
];

/** Help and contact, for the app stores' support link and anyone stuck. */
export function SupportPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Support · Jump';
    return () => { document.title = previous; };
  }, []);

  return <article className="mx-auto max-w-2xl pb-16">
    <p className="eyebrow">Help</p>
    <h1 className="mt-1 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[36px]">Support</h1>
    <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
      Stuck, or something not right? Email <a href={`mailto:${EMAIL}`} className="font-semibold text-ink underline underline-offset-2">{EMAIL}</a> and
      we’ll get back to you, usually within one working day. Include your Jump username and, for an activity or competition, its link.
    </p>

    <div className="mt-8 divide-y divide-line rounded-xl border-[1.5px] border-ink bg-card">
      {QUESTIONS.map(({ q, a }) => <details key={q} className="group px-4 py-3">
        <summary className="cursor-pointer list-none text-[15px] font-bold marker:hidden">{q}</summary>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{a}</p>
      </details>)}
    </div>

    <p className="mt-8 text-[13px] text-ink-3">
      Jump is operated by Voyatech Limited. See the <Link to="/terms" className="underline">Terms of Service</Link>, <Link to="/privacy" className="underline">Privacy Policy</Link> and <Link to="/safety" className="underline">Safety &amp; Acceptable Use</Link>.
    </p>
  </article>;
}

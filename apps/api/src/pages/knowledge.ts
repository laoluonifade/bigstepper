import { breadcrumbs, esc, heading, SeoPage } from './seo-render';

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  sections: Array<{ title: string; paragraphs: string[] }>;
  related: Array<{ path: string; label: string }>;
}
export const GUIDES: Guide[] = [
  {
    slug: 'virtual-running-challenge',
    title: 'How to organize a virtual running challenge',
    summary:
      'Choose a clear scoring rule, agree what counts and give runners a shared finish date without requiring everyone to meet in one place.',
    sections: [
      {
        title: 'Choose the outcome before the leaderboard',
        paragraphs: [
          'Decide whether the challenge rewards total distance, reaching a distance target or completing regular sessions. These are different goals. Total distance suits a mileage challenge; a target gives participants a defined finish. Avoid mixing daily step totals with GPS running distance without explaining the difference.',
          'Write down the start, finish and entry deadline with a time zone. Tell participants whether late entry is allowed and whether activities before joining count. Choose a manageable duration and a goal that fits the intended group instead of promising a universal fitness target.',
        ],
      },
      {
        title: 'Publish the activity and scoring rules',
        paragraphs: [
          'Specify running only or a mix of activities, any minimum session distance or duration, and which tracking sources are eligible. Explain how a participant checks an activity before the deadline. A phone losing signal, a delayed sync and a manually entered activity are different cases and should not be treated as interchangeable evidence.',
          'Give the group one place to find the rules and updates. Ask a few participants to test the join and tracking flow before inviting everyone. Use those results to clarify the instructions rather than changing scoring rules after people have started.',
        ],
      },
      {
        title: 'Use Jump where it fits',
        paragraphs: [
          'On Jump, create a competition with its eligible activities, scoring method, target where required and entry/scoring windows. Review the details before sharing its link. People can browse public competition information without signing in; joining follows the existing account and eligibility flow.',
          'During the challenge, point participants to their recorded activity and the competition rules when totals differ. At the finish, allow the defined scoring window to close before communicating results. Do not promise prizes, paid entry availability or credit for every imported activity unless the specific competition supports them.',
        ],
      },
    ],
    related: [
      {
        path: '/virtual-fitness-challenges',
        label: 'Explore virtual challenges',
      },
      { path: '/competitions/new', label: 'Create a competition' },
    ],
  },
  {
    slug: 'employee-step-competition',
    title: 'How to run an employee step competition',
    summary:
      'Build a workplace challenge around a clear step goal, voluntary participation and a tracking setup employees can test before the start.',
    sections: [
      {
        title: 'Set a fair scope',
        paragraphs: [
          'Start with the purpose: bringing colleagues together, encouraging walking breaks or giving a workplace club a shared goal. Pick dates, a time zone and a scoring method that employees can understand. Account for different schedules and mobility needs when designing participation; a single large target will not suit every colleague.',
          'Explain who can join and whether results are individual. Choose a private workplace club when membership should be controlled, and use the supported invitation flow. Do not describe an individual leaderboard as a team-scoring competition unless that format is actually available.',
        ],
      },
      {
        title: 'Test tracking and protect personal information',
        paragraphs: [
          'Ask participants to connect their eligible tracking source before the challenge begins. On a supported iPhone build, Jump can read everyday steps from Apple Health after permission is granted. Background synchronization is scheduled by iOS, so totals can arrive later than the walk itself. Give people a way to refresh and check their connection.',
          'Tell employees what will be visible to other participants and keep participation voluntary. Do not ask colleagues to publish health records or GPS routes to prove daily steps. Sharing step posts and joining a leaderboard are separate product choices; do not assume consent to one implies consent to every other use.',
        ],
      },
      {
        title: 'Launch and close the challenge',
        paragraphs: [
          'Use a Jump club and step competition to publish the goal, eligible activity, entry window and scoring deadline. Share one set of instructions and a contact for setup problems. Check a small pilot before launch, particularly if employees use different phones or older app versions.',
          'During the competition, use the leaderboard as a shared progress view, not as a measure of employee performance or health. At the end, review the actual results and invite feedback on accessibility and tracking. Avoid claiming a productivity or medical benefit from participation counts alone.',
        ],
      },
    ],
    related: [
      { path: '/business', label: 'Jump for workplaces' },
      { path: '/step-challenges', label: 'Explore step challenges' },
    ],
  },
  {
    slug: 'create-running-club',
    title: 'How to create a running club',
    summary:
      'Give the club a clear identity, a practical first meeting and a consistent way for runners to find the next run.',
    sections: [
      {
        title: 'Make the invitation useful',
        paragraphs: [
          'Decide who the club is for and what a newcomer can expect. Describe the location, typical route or distance, pace approach and whether walkers or beginners are welcome. Only publish information the club can support. A specific, honest description is more useful than calling every club suitable for everyone.',
          'Choose a recognizable name and an accurate location. If the club has no fixed meeting place, say so and put the meeting point on each event. Avoid listing a city solely because it is nearby or because you want to appear in searches there.',
        ],
      },
      {
        title: 'Decide how membership and events work',
        paragraphs: [
          'Choose open membership for a publicly discoverable community or invitation-based membership for a controlled group. Decide who will manage the club, publish events and respond to new members. Explain how to get help if someone cannot join.',
          'For the first run, publish a date, local time, meeting point and clear description. Agree how participants hear about changes, what happens if conditions change and how newcomers identify the group. An event page should support those decisions rather than replace an organizer on the day.',
        ],
      },
      {
        title: 'Set up the club on Jump',
        paragraphs: [
          'Create a club in Jump, add its description and location, and choose the appropriate privacy setting. Open club pages can explain the community and show upcoming public runs. Participants use the join action and the normal account flow; an invite-only club still requires its invitation.',
          'Publish a run from the club, then share the event link instead of relying on a screenshot that becomes outdated. Once the group has a stable schedule, use recurring events and review the next occurrence regularly. Ask members what information was missing from their first visit and improve the description.',
        ],
      },
    ],
    related: [
      { path: '/running-clubs', label: 'Find public running clubs' },
      { path: '/register?redirect=%2Fclubs', label: 'Start a club' },
    ],
  },
  {
    slug: 'organize-5k-event',
    title: 'How to organize a 5K running event',
    summary:
      'Separate the work of planning a real running event from the tools used to publish information and issue registration passes.',
    sections: [
      {
        title: 'Plan the route and operations first',
        paragraphs: [
          'Define the intended participants and choose a route you can operate responsibly. Confirm access to the venue and any local permissions, road arrangements or support the event needs with the relevant people. A route displayed in an app is not proof of a measured or certified 5K course.',
          'Assign responsibility for check-in, route guidance, communication and the finish area. Decide how you will communicate changes or cancellation. Keep an organizer contact available and explain the meeting point clearly enough that a first-time visitor can find it.',
        ],
      },
      {
        title: 'Publish complete registration information',
        paragraphs: [
          'State the event name, date, start time, time zone, venue and address. Explain whether the event is a social run or a timed race, the intended distance, and what registration includes. Set a realistic capacity and distinguish registration from attendance on the day.',
          'Test the registration page on a phone. A participant should be able to find the location, understand the pass option and know how to retrieve their pass. Do not advertise entry fees or ticket sales until the actual purchase flow is supported and tested.',
        ],
      },
      {
        title: 'Use Jump for publishing and passes',
        paragraphs: [
          'A Jump club organizer can create an event, review the draft and publish its public page. The page can show the real date, venue, organizer and available pass information. The Get Pass flow supports guest registration for published eligible events, with the existing email/pass delivery and QR workflow.',
          'Use actual pass and guest controls for event operations, while keeping attendee contact details private. Jump does not automatically provide course certification, chip timing, venue permission or event staffing. Check the event details after publishing and communicate changes through the available organizer channels.',
        ],
      },
    ],
    related: [
      { path: '/events', label: 'Browse published events' },
      {
        path: '/register?redirect=%2Fclubs',
        label: 'Create an organizer club',
      },
    ],
  },
  {
    slug: 'phone-walking-competitions',
    title: 'How to track walking competitions using a phone',
    summary:
      'Understand the difference between everyday step totals and recorded walking sessions before choosing a competition.',
    sections: [
      {
        title: 'Match the tracker to the rules',
        paragraphs: [
          'A daily step challenge counts eligible steps during a defined window. A walking distance challenge may require a recorded activity with a route, duration or minimum distance. A total on your phone is not automatically eligible for every competition, even when it represents real movement.',
          'Read the activity types, scoring method, time zone and deadlines before joining. Connect the source you intend to use before the challenge starts. On Jump, imported daily totals can include a history view, but competition credit is restricted by connection time and the competition’s rules.',
        ],
      },
      {
        title: 'Understand Apple Health synchronization',
        paragraphs: [
          'In a supported Jump iPhone build, connect Apple Health and grant read permission for the requested data. Jump can sync eligible everyday steps without starting a separate GPS recording for each walk. This connection is an iPhone integration; do not assume the same Apple Health feature is available on Android or in a browser.',
          'iOS controls background updates, so synchronization is not an instant live feed. If the displayed total is old, open Jump, check the connection and use the available sync action. Manually entered health samples are excluded from daily step imports. An all-day total does not create a GPS route for the commute or lunchtime walk.',
        ],
      },
      {
        title: 'Check discrepancies without sharing private data',
        paragraphs: [
          'Compare the date and time zone first, then the last successful sync and the activity types allowed by the challenge. A difference can come from an eligibility rule or a delayed import, not just a missing walk. Do not repeatedly add manual copies of the same activity to force a leaderboard change.',
          'If you need help, describe the connection state and the competition rule involved rather than posting private health screenshots or location history publicly. Disconnecting Apple Health in Jump removes imported health activity and daily steps from Jump and can change active competition scores; it does not delete the records from Apple Health.',
        ],
      },
    ],
    related: [
      {
        path: '/step-challenges',
        label: 'Explore walking and step challenges',
      },
      { path: '/about', label: 'Read how Jump works' },
    ],
  },
  {
    slug: 'recurring-club-events',
    title: 'How to organize recurring running club events',
    summary:
      'Use a repeatable schedule while keeping the next run’s time, meeting point and registration information accurate.',
    sections: [
      {
        title: 'Choose the schedule the club can maintain',
        paragraphs: [
          'Start with the day or days of the week, local start time and meeting point. Decide whether the series ends on a particular date. A predictable weekly run can be easier for newcomers to understand than a changing schedule, but the schedule should reflect what organizers can actually deliver.',
          'For a monthly series, distinguish a calendar date from a pattern such as a particular weekday in the month. Keep the event’s time zone explicit, especially for visitors or communities that travel. Review the displayed next occurrence rather than assuming every month has the same dates.',
        ],
      },
      {
        title: 'Keep information current across occurrences',
        paragraphs: [
          'Include the expected distance, pace approach and where participants should gather. Assign someone to check the next event before each run. A recurring schedule does not confirm that the venue remains accessible or that a specific organizer will be present.',
          'Explain how participants learn about changes, and update the event when a meeting point or schedule changes. Share the current event link so people can read the latest details. If the series ends, do not leave an outdated invitation describing it as an upcoming run.',
        ],
      },
      {
        title: 'Set up recurring events on Jump',
        paragraphs: [
          'Jump club events support one-off, daily, weekly and monthly schedules, with a local time zone and an optional end date for a series. Review the schedule and meeting-point details in the draft, then publish the event. Eligible public pages show the next scheduled occurrence.',
          'Participants can use the public event page to review the date and available pass information. Club membership and event registration are separate actions; an invite-only host does not make every explicitly published event private. Keep guest/contact records in the organizer controls rather than putting them in a public description.',
        ],
      },
    ],
    related: [
      { path: '/running-events', label: 'Find upcoming running events' },
      { path: '/running-clubs', label: 'Explore running clubs' },
    ],
  },
];

export const PRODUCT_FAQS = [
  {
    question: 'What is Jump?',
    answer:
      'Jump is a platform for running, walking and cycling competitions, clubs and events. Individuals can discover activities, clubs can publish runs, event organizers can issue passes, and workplaces can organize employee step challenges.',
  },
  {
    question: 'Do everyday steps require a separate recording?',
    answer:
      'On a supported iPhone build, Jump can sync eligible daily steps from Apple Health after you connect and grant permission. You do not need to start a separate GPS recording for each everyday walk. iOS controls background sync timing, and competition rules determine what counts.',
  },
  {
    question: 'Can I browse events without an account?',
    answer:
      'Published public event details can be read without signing in, and the Get Pass flow supports guest registration for eligible events. Joining a club or competition follows Jump’s existing account and eligibility requirements.',
  },
  {
    question: 'Does Apple Health sync work on every phone?',
    answer:
      'Apple Health is an iPhone integration in supported Jump builds. Do not assume that Android or browser tracking uses the same integration. Check the tracking options available on your device and the rules of the competition you choose.',
  },
];
const list = (items: Array<{ path: string; label: string }>) =>
  `<nav aria-label="Related information" class="mt-8 flex flex-wrap gap-4">${items.map((i) => `<a class="underline underline-offset-4" href="${esc(i.path)}">${esc(i.label)}</a>`).join('')}</nav>`;
export function knowledgePage(path: string, origin: string): SeoPage | null {
  const trail = (name: string) =>
    breadcrumbs(origin, [
      { name: 'Jump', path: '/' },
      ...(path !== '/learn' ? [{ name: 'Guides', path: '/learn' }] : []),
      { name, path },
    ]);
  if (path === '/about') {
    const title = 'What Jump is and how it works';
    const description =
      'Learn how Jump supports movement competitions, Apple Health step syncing, running clubs, event passes and workplace challenges.';
    const sections = [
      [
        'For individuals',
        'Browse public events and challenges, read their rules and choose an activity that fits. Joining a competition uses an account and its entry requirements. Create a competition by choosing eligible activities, a scoring method, any required goal and the entry/scoring dates.',
      ],
      [
        'Automatic steps on iPhone',
        'Connect Apple Health in a supported iPhone build and grant read permission. Jump syncs eligible everyday steps and can import supported recorded workouts. Background timing is controlled by iOS, so updates may be delayed. Daily totals exclude manually entered samples; competition credit depends on connection time and the specific rules. Daily steps are not GPS routes.',
      ],
      [
        'For clubs and event organizers',
        'Create an open or invite-only club, describe its real location and organize one-off or recurring runs. Organizers can review and publish event details, including the next date, time zone and meeting point. Eligible published events offer Get Pass, including guest registration. Available pass options must be checked on the event itself.',
      ],
      [
        'For workplaces',
        'Use a workplace club and a step competition to bring colleagues together around a defined goal and deadline. Explain eligibility, device support and what participants share. Individual leaderboards are not a promise of team scoring, health outcomes or employee productivity gains.',
      ],
    ];
    return {
      path,
      title: title + ' | Jump',
      description,
      indexable: true,
      status: 200,
      body:
        heading(title, PRODUCT_FAQS[0].answer) +
        sections
          .map(
            ([h, p]) =>
              `<section class="mt-8"><h2 class="wide text-2xl font-bold">${esc(h)}</h2><p class="mt-3 max-w-2xl text-lg text-ink-2">${esc(p)}</p></section>`,
          )
          .join('') +
        `<section class="mt-10"><h2 class="wide text-2xl font-bold">Questions about Jump</h2>${PRODUCT_FAQS.map((f) => `<div class="mt-6"><h3 class="text-xl font-bold">${esc(f.question)}</h3><p class="mt-2 max-w-2xl text-ink-2">${esc(f.answer)}</p></div>`).join('')}</section>` +
        list([
          { path: '/events', label: 'Find an event' },
          { path: '/competitions', label: 'Explore competitions' },
          { path: '/running-clubs', label: 'Find a club' },
          { path: '/business', label: 'Workplace challenges' },
          { path: '/learn', label: 'Read the guides' },
        ]),
      jsonLd: [
        breadcrumbs(origin, [
          { name: 'Jump', path: '/' },
          { name: 'About Jump', path },
        ]),
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          '@id': origin + '/#application',
          name: 'Jump',
          url: origin + path,
          applicationCategory: 'HealthApplication',
          operatingSystem: 'Web, iOS',
          description: PRODUCT_FAQS[0].answer,
          publisher: { '@id': origin + '/#organization' },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: PRODUCT_FAQS.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        },
      ],
    };
  }
  if (path === '/learn')
    return {
      path,
      title: 'Running, walking, event and workplace challenge guides | Jump',
      description:
        'Practical guides to organizing movement challenges, running clubs, recurring runs and event registration, with clear explanations of phone tracking.',
      indexable: true,
      status: 200,
      body:
        heading(
          'Movement guides',
          'Plan a challenge, start a club or organize an event. Learn what to decide before choosing a tool and where Jump can help.',
        ) +
        `<ul class="mt-8 grid gap-6 sm:grid-cols-2">${GUIDES.map((g) => `<li class="rounded-2xl border border-line bg-card p-5"><h2 class="wide text-xl font-bold"><a href="/learn/${g.slug}">${esc(g.title)}</a></h2><p class="mt-3 text-ink-2">${esc(g.summary)}</p></li>`).join('')}</ul>` +
        list([
          { path: '/about', label: 'What Jump is and how it works' },
          { path: '/events', label: 'Explore real events' },
        ]),
      jsonLd: [trail('Guides')],
    };
  const guide = GUIDES.find((g) => path === '/learn/' + g.slug);
  if (!guide) return null;
  return {
    path,
    title: guide.title + ' | Jump',
    description: guide.summary,
    indexable: true,
    status: 200,
    body:
      '<article>' +
      heading(guide.title, guide.summary) +
      '<p class="mt-4 text-sm text-ink-2">Jump guides</p>' +
      guide.sections
        .map(
          (s) =>
            `<section class="mt-8"><h2 class="wide text-2xl font-bold">${esc(s.title)}</h2>${s.paragraphs.map((p) => `<p class="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">${esc(p)}</p>`).join('')}</section>`,
        )
        .join('') +
      list([
        ...guide.related,
        { path: '/learn', label: 'All guides' },
        { path: '/about', label: 'About Jump' },
      ]) +
      '</article>',
    jsonLd: [
      trail(guide.title),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: guide.title,
        description: guide.summary,
        mainEntityOfPage: origin + path,
        author: { '@type': 'Organization', name: 'Jump', url: origin + '/' },
        publisher: { '@id': origin + '/#organization' },
      },
    ],
  };
}

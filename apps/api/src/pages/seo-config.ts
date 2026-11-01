export const SEO_STATIC = {
  '/': {
    title: 'Jump | Running, walking, cycling, clubs and events',
    description:
      'Find movement events, join clubs and take part in walking, running and cycling competitions on Jump.',
  },
  '/business': {
    title: 'Workplace step challenges and corporate wellness | Jump',
    description:
      'Bring colleagues together with workplace step challenges, Apple Health step syncing on iPhone and individual leaderboards.',
  },
  '/brands': {
    title: 'Sponsor movement competitions and events | Jump for brands',
    description:
      'Connect your brand with runners and walkers through sponsored competitions on Jump. Explore partnerships with our team.',
  },
} as const;
export const SEO_HUBS = {
  '/competitions': {
    title: 'Movement competitions',
    description:
      'Explore public running, walking, cycling and step competitions. Read the goals, rules and entry details before joining.',
    kind: 'virtual',
  },
  '/events': {
    title: 'Movement events',
    description:
      'Discover upcoming running, walking and cycling events. See the venue, organizer and registration details before getting your pass.',
    kind: 'events',
  },
  '/running-events': {
    title: 'Running events',
    description:
      'Find upcoming runs hosted by clubs on Jump. Check the meeting point and local start time, then get a pass on the event page.',
    kind: 'runs',
  },
  '/running-clubs': {
    title: 'Running clubs',
    description:
      'Discover public clubs hosting running events or running competitions. Read about each club, explore upcoming runs and join its community.',
    kind: 'clubs',
  },
  '/step-challenges': {
    title: 'Walking and step competitions',
    description:
      'Explore public step and walking challenges. Compare goals, eligible activities and scoring windows before choosing a competition.',
    kind: 'steps',
  },
  '/virtual-fitness-challenges': {
    title: 'Virtual fitness challenges',
    description:
      'Join a movement competition from wherever you are. Compare walking, running and cycling goals and read the participation rules.',
    kind: 'virtual',
  },
} as const;

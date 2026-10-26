export const REACTIONS = ['HEART', 'FIRE', 'CLAP', 'LIKE', 'LAUGH', 'WOW', 'SAD', 'STRONG', 'PARTY', 'HUNDRED', 'RUN', 'PRAY'] as const;
export type Reaction = (typeof REACTIONS)[number];

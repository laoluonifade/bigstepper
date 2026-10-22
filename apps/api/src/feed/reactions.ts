/** Reactions for Rant posts and messages. The web app maps each code to its emoji. */
export const REACTIONS = ['HEART', 'FIRE', 'CLAP', 'LIKE', 'LAUGH', 'WOW', 'SAD', 'STRONG', 'PARTY', 'HUNDRED', 'RUN', 'PRAY'] as const;
export type Reaction = (typeof REACTIONS)[number];

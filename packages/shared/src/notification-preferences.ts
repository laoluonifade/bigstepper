export const NOTIFICATION_CATEGORIES = {
  competitions: 'Competitions and leaderboards',
  clubs: 'Club activity',
  milestones: 'Personal achievements',
  recommendations: 'Recommended competitions',
  summaries: 'Weekly summaries',
  social: 'Social activity',
} as const;
export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;
export type NotificationPreferences = {
  timeZone: string | null;
  quietStart: number;
  quietEnd: number;
  categories: Partial<Record<NotificationCategory, Partial<Record<'push' | 'email' | 'inapp', boolean>>>>;
};

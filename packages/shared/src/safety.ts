/** What can be reported, and why: the API accepts exactly these. */
export type ReportTarget = 'rant' | 'comment' | 'message' | 'profile';

export type ReportReason = 'harassment' | 'spam' | 'inappropriate' | 'cheating' | 'impersonation' | 'other';

export const REPORT_REASONS: Array<{ value: ReportReason; label: string; detail: string }> = [
  { value: 'harassment', label: 'Harassment or bullying', detail: 'Targeting, threatening or insulting someone' },
  { value: 'inappropriate', label: 'Inappropriate content', detail: 'Nudity, violence, hate or graphic material' },
  { value: 'spam', label: 'Spam or scam', detail: 'Ads, repeated posts, suspicious links or money requests' },
  { value: 'cheating', label: 'Cheating', detail: 'Faked activities or gaming a competition' },
  { value: 'impersonation', label: 'Pretending to be someone', detail: 'Posing as another person, club or brand' },
  { value: 'other', label: 'Something else', detail: 'Tell us what’s wrong' },
];

export const REPORT_NOUN: Record<ReportTarget, string> = { rant: 'Rant', comment: 'comment', message: 'message', profile: 'profile' };

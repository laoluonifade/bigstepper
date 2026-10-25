/** The policy pages, for footers and cross-links. */
export const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/safety', label: 'Safety & Acceptable Use' },
] as const;

/** Jump on social media, for the settings footer. */
export const SOCIAL_LINKS = [
  { href: 'https://x.com/startajump', label: 'Jump on X' },
  { href: 'https://www.instagram.com/startajump', label: 'Jump on Instagram' },
] as const;

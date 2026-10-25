import { welcomeEmail } from './templates';

describe('welcome email', () => {
  it('is a personal note from Laolu that can be replied to', () => {
    const email = welcomeEmail({ address: 'ada@example.com', name: 'Ada' });
    expect(email.fromName).toBe('Laolu from Jump');
    expect(email.replyTo).toBe('start@startajump.com');
    expect(email.text).toContain('I’m Laolu, founder of Jump');
    expect(email.text).toContain('just hit reply');
    expect(email.text.trim().endsWith('Laolu\nFounder, Jump')).toBe(true);
    expect(email.html).toContain('See you on the Jump,');
  });
});

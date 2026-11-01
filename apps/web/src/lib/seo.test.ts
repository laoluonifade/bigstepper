import { describe, it, expect } from 'vitest';
import { isSeoPath } from '@jump/shared/seo';
import { organicSource } from './organic';
describe('public metadata routing', () => {
  it.each([
    '/',
    '/business',
    '/events',
    '/events/public-event',
    '/clubs/public-club',
    '/competitions/ABCD1234',
    '/running-clubs/in/lagos',
  ])('recognizes public path %s', (path) => expect(isSeoPath(path)).toBe(true));
  it.each([
    '/login',
    '/register',
    '/settings/profile',
    '/passes/private-token',
    '/payments/return',
    '/clubs/example/dashboard',
    '/events/example/guests',
    '/runners/private-name',
    '/competitions/new',
  ])('excludes sensitive path %s', (path) =>
    expect(isSeoPath(path)).toBe(false),
  );
  it.each([
    ['https://chatgpt.com/c/example', 'chatgpt'],
    ['https://chat.openai.com/', 'chatgpt'],
    ['https://www.perplexity.ai/search/private?query=secret', 'perplexity'],
    ['https://gemini.google.com/app/secret', 'gemini'],
    ['https://copilot.microsoft.com/', 'copilot'],
    ['https://www.copilot.com/chats/example', 'copilot'],
    ['https://copilot.cloud.microsoft/', 'copilot'],
    ['https://m365.cloud.microsoft/', 'copilot'],
    ['https://claude.ai/', 'claude'],
    ['https://www.google.com/search?q=ai', 'google'],
    ['https://www.bing.com/chat', 'bing'],
  ])('classifies only identifiable hosts %s', (url, source) =>
    expect(organicSource(url)).toBe(source),
  );
  it.each([
    'https://chatgpt.com.evil.test',
    'https://copilot.com.evil.test',
    'https://evilchatgpt.com',
    'https://perplexity.ai.evil.test',
    'https://example.com/?utm_source=chatgpt',
    'not a URL',
    'ftp://chatgpt.com',
  ])('does not trust spoofed AI sources %s', (url) =>
    expect(organicSource(url)).toBeNull(),
  );
  it.each(['/about', '/learn', '/learn/phone-walking-competitions'])(
    'supports public knowledge route %s',
    (path) => expect(isSeoPath(path)).toBe(true),
  );
  it('tracks only search engine referrer categories without query strings', () => {
    expect(organicSource('https://www.google.com/search?q=private')).toBe(
      'google',
    );
    expect(organicSource('https://www.bing.com/search?q=private')).toBe('bing');
    expect(organicSource('https://bing.com.evil.test')).toBeNull();
    expect(organicSource('')).toBeNull();
  });
});

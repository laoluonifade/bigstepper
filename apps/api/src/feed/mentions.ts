/** Usernames tagged as @handle in a post or comment, lowercased, at most ten. */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/(^|[^a-z0-9_@])@([a-z0-9_]{2,30})\b/gi)) {
    found.add(match[2].toLowerCase());
    if (found.size === 10) break;
  }
  return [...found];
}

/** Reactions shared by Rant posts and messages; codes match the API's list. */
export const REACTIONS = [
  { value: 'HEART', emoji: '❤️', label: 'Love' },
  { value: 'FIRE', emoji: '🔥', label: 'Fire' },
  { value: 'CLAP', emoji: '👏', label: 'Clap' },
  { value: 'STRONG', emoji: '💪', label: 'Strong' },
  { value: 'LAUGH', emoji: '😂', label: 'Haha' },
  { value: 'WOW', emoji: '😮', label: 'Wow' },
  { value: 'PARTY', emoji: '🎉', label: 'Party' },
  { value: 'HUNDRED', emoji: '💯', label: '100' },
  { value: 'RUN', emoji: '🏃', label: 'Run' },
  { value: 'LIKE', emoji: '👍', label: 'Like' },
  { value: 'SAD', emoji: '😢', label: 'Sad' },
  { value: 'PRAY', emoji: '🙏', label: 'Respect' },
] as const;

export type Reaction = (typeof REACTIONS)[number]['value'];

export function reactionEmoji(value: string) {
  return REACTIONS.find((reaction) => reaction.value === value)?.emoji ?? '❤️';
}

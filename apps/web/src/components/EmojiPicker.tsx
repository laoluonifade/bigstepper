import { RefObject, useState } from 'react';
import { EmojiPopover } from './EmojiPopover';
import { cx } from './ui';

const GROUPS: Array<{ label: string; icon: string; emoji: string[] }> = [
  { label: 'Smileys', icon: '😀', emoji: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😎 🤓 🥳 😏 😌 😴 🥱 😮‍💨 🤯 😳 🥵 🥶 😱 😤 😭 😢 🥲 😬 🙄 🤔 🤫 🤗 🫡 🫠 😅 🤞 🤝'.split(' ') },
  { label: 'Fitness', icon: '🏃', emoji: '🏃 🏃‍♀️ 🚶 🚶‍♀️ 🚴 🚴‍♀️ 🏋️ 🤸 🧘 🏊 ⛹️ 🤾 👟 🩳 ⌚ 🥇 🥈 🥉 🏅 🏆 🎯 ⏱️ 💪 🦵 🫀 🫁 💦 🔥 ⚡ 💯 🚀 📈 🗺️ 📍 🏁'.split(' ') },
  { label: 'Hands & hearts', icon: '❤️', emoji: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❤️‍🔥 💕 💖 👍 👎 👏 🙌 🙏 👊 ✊ 🤜 🤛 ✌️ 🤟 🤘 👌 🫶 👋 💅 👀 🫵'.split(' ') },
  { label: 'Food & drink', icon: '🍌', emoji: '🍌 🍎 🍉 🍓 🥑 🥗 🍗 🍚 🍲 🥤 🧃 💧 ☕ 🍵 🍫 🍕 🍔 🌮 🍝 🥛 🧊 🍺 🥂'.split(' ') },
  { label: 'Nature & weather', icon: '☀️', emoji: '☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌈 🌙 ⭐ 🌟 ✨ 🌍 🌳 🌴 🌊 ⛰️ 🏔️ 🌸 🌻 🍂 ❄️ 🐐 🦁 🐆 🐢'.split(' ') },
  { label: 'Celebrate', icon: '🎉', emoji: '🎉 🎊 🥳 🎂 🎁 🎈 🍾 🎶 🎵 📸 🤳 🇳🇬 🏳️ 🆒 🆕 ✅ ❌ ⚠️ 💤 💬 📣'.split(' ') },
];

/** Full emoji picker for composers: category tabs and a scrollable grid. */
export function EmojiPicker({ anchor, onPick, onClose }: { anchor: RefObject<HTMLElement>; onPick: (emoji: string) => void; onClose: () => void }) {
  const [group, setGroup] = useState(0);
  const width = Math.min(window.innerWidth - 16, 340);
  return <EmojiPopover anchor={anchor} label="Emoji" width={width} height={320} onClose={onClose}>
    <div className="flex gap-1 border-b border-line pb-1.5">
      {GROUPS.map((entry, index) => <button key={entry.label} type="button" className={cx('flex h-9 flex-1 items-center justify-center rounded-xl text-[18px] transition-colors', group === index ? 'bg-ink/[0.07]' : 'opacity-60 hover:opacity-100')} title={entry.label} aria-label={entry.label} aria-pressed={group === index} onClick={() => setGroup(index)}>{entry.icon}</button>)}
    </div>
    <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{GROUPS[group].label}</p>
    <div className="grid h-[236px] grid-cols-8 content-start overflow-y-auto overscroll-contain">
      {GROUPS[group].emoji.map((emoji, index) => <button key={`${emoji}-${index}`} type="button" className="flex aspect-square items-center justify-center rounded-xl text-[24px] transition-transform hover:scale-125 hover:bg-ink/[0.05]" onClick={() => onPick(emoji)}>{emoji}</button>)}
    </div>
  </EmojiPopover>;
}

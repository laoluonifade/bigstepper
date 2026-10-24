import type { AvatarStyle, Gender } from './types';

/**
 * Pictures for people without a photo, drawn from their name so everyone keeps the same one. As SVG
 * data URLs, so the app and exported images (canvas) draw exactly the same picture.
 *
 * AVATAR_STYLE picks the look: 'cartoon' (a little runner) or 'initials' (colour, shape and initial).
 */
export const AVATAR_STYLE: 'cartoon' | 'initials' = 'cartoon';

export function avatarStyleForGender(gender: Gender | null | undefined): AvatarStyle {
  return gender === 'male' ? 'masculine' : gender === 'female' ? 'feminine' : 'neutral';
}

const INK = '#121212';
const BACKGROUNDS = ['#FF5A1F', '#E4FF3A', '#8B7CF6', '#5EE0C1', '#FF8FB1', '#FFC53D', '#6FB7FF'];
const SKIN = ['#F9D7B9', '#EDB98A', '#D08B5B', '#AE5D29', '#8D4A1F', '#5C3317'];
const HAIR = ['#121212', '#3B2314', '#6A3E1F', '#B5651D', '#E3B04B', '#8B7CF6'];
const SHIRTS = ['#121212', '#F2EFE8', '#FF5A1F', '#E4FF3A', '#6FB7FF', '#5EE0C1'];

function hash(value: string) {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Picks from a list using a different slice of the hash each time, so features vary independently. */
function picker(seed: number) {
  let state = seed || 1;
  return <T,>(list: T[]) => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
    return list[((state ^ (state >>> 16)) >>> 0) % list.length];
  };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase();
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function cartoon(name: string, avatarStyle: AvatarStyle) {
  const pick = picker(hash(name.toLowerCase()));
  const bg = pick(BACKGROUNDS);
  const skin = pick(SKIN);
  const hair = pick(HAIR.filter((colour) => colour !== bg));
  const shirt = pick(SHIRTS.filter((colour) => colour !== bg));
  const style = avatarStyle === 'feminine'
    ? pick(['short', 'afro', 'bun', 'long', 'cap', 'band'] as const)
    : pick(['short', 'afro', 'cap', 'band', 'buzz'] as const);
  const eyes = pick(['dots', 'happy', 'wink', 'dots'] as const);
  const mouth = pick(['smile', 'grin', 'smile', 'o'] as const);
  const stroke = `stroke="${INK}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"`;

  const behind = {
    afro: `<circle cx="20" cy="15.5" r="11.5" fill="${hair}" ${stroke}/>`,
    long: `<path d="M9.5 18c0-7 4.5-11 10.5-11s10.5 4 10.5 11v9h-21z" fill="${hair}" ${stroke}/>`,
    bun: `<circle cx="20" cy="5.2" r="3.6" fill="${hair}" ${stroke}/>`,
  }[style as 'afro' | 'long' | 'bun'] ?? '';

  const front = {
    short: `<path d="M11 15.5c0-5 4-8.2 9-8.2s9 3.2 9 8.2c-2.6-2.6-6-3.4-9-3.4s-6.4.8-9 3.4z" fill="${hair}" ${stroke}/>`,
    afro: `<path d="M11.2 15c1.6-2.8 4.8-4 8.8-4s7.2 1.2 8.8 4" fill="none" ${stroke}/>`,
    bun: `<path d="M11 16c0-5.3 4-8.4 9-8.4s9 3.1 9 8.4c-3-2.2-6-2.9-9-2.9s-6 .7-9 2.9z" fill="${hair}" ${stroke}/>`,
    // A running cap with a peak.
    cap: `<path d="M10.6 14.4c.4-4.6 4.4-7.6 9.4-7.6s9 3 9.4 7.6z" fill="${shirt === INK ? '#FF5A1F' : INK}" ${stroke}/><path d="M26 14.4h7.5c-.5 1.3-2 2-3.6 2H26z" fill="${shirt === INK ? '#FF5A1F' : INK}" ${stroke}/>`,
    // Hair with a sweatband across the forehead.
    band: `<path d="M11 15c0-5 4-8 9-8s9 3 9 8z" fill="${hair}" ${stroke}/><rect x="10.6" y="12.6" width="18.8" height="3.2" rx="1.2" fill="${bg === '#FF5A1F' ? '#E4FF3A' : '#FF5A1F'}" ${stroke}/>`,
    long: `<path d="M11 16.5c0-5.6 4-9 9-9s9 3.4 9 9c-1.5-3.5-5-5.4-9-5.4s-7.5 1.9-9 5.4z" fill="${hair}" ${stroke}/>`,
    buzz: `<path d="M11.4 14.6c.8-4.4 4.4-7 8.6-7s7.8 2.6 8.6 7c-2.8-1.6-5.6-2.2-8.6-2.2s-5.8.6-8.6 2.2z" fill="${hair}" opacity="0.85"/>`,
  }[style];

  const eyeMarks = {
    dots: `<circle cx="16.6" cy="18.6" r="1.25" fill="${INK}"/><circle cx="23.4" cy="18.6" r="1.25" fill="${INK}"/>`,
    happy: `<path d="M15.2 19.2c.8-1.3 2-1.3 2.8 0M22 19.2c.8-1.3 2-1.3 2.8 0" fill="none" ${stroke}/>`,
    wink: `<circle cx="16.6" cy="18.6" r="1.25" fill="${INK}"/><path d="M22 19c.8-.9 2-.9 2.8 0" fill="none" ${stroke}/>`,
  }[eyes];

  const mouthMark = {
    smile: `<path d="M17.2 22.6c1.6 1.5 4 1.5 5.6 0" fill="none" ${stroke}/>`,
    grin: `<path d="M16.8 22.2h6.4c-.4 2.2-1.8 3.2-3.2 3.2s-2.8-1-3.2-3.2z" fill="#FFFFFF" ${stroke}/>`,
    o: `<ellipse cx="20" cy="23.3" rx="1.3" ry="1.5" fill="${INK}"/>`,
  }[mouth];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">`
    + `<rect width="40" height="40" fill="${bg}"/>`
    + `<path d="M5 41c1.4-7.6 7.4-11.6 15-11.6S33.6 33.4 35 41z" fill="${shirt}" ${stroke}/>`
    + `<path d="M17 26.5v4c1.8 1.2 4.2 1.2 6 0v-4" fill="${skin}" ${stroke}/>`
    + behind
    + `<circle cx="20" cy="18" r="9" fill="${skin}" ${stroke}/>`
    + front
    + eyeMarks
    + mouthMark
    + `</svg>`;
}

function initialsTile(name: string) {
  const pick = picker(hash(name.toLowerCase()));
  const base = pick(BACKGROUNDS);
  const shape = pick(['circle', 'lanes', 'wedge'] as const);
  const turn = pick([0, 45, 90, 135, 180, 225, 270, 315]);
  const tint = '#FFFFFF" fill-opacity="0.45';
  const art = {
    circle: `<circle cx="31" cy="31" r="16" fill="${tint}"/>`,
    lanes: `<rect x="-10" y="24" width="60" height="5" fill="${tint}"/><rect x="-10" y="32" width="60" height="5" fill="${tint}"/>`,
    wedge: `<path d="M40 0v40H8z" fill="${tint}"/>`,
  }[shape];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${base}"/>`
    + `<g transform="rotate(${turn} 20 20)">${art}</g>`
    + `<text x="20" y="21" dominant-baseline="central" text-anchor="middle" fill="${INK}" font-size="15" font-weight="800" font-family="Archivo, system-ui, sans-serif">${escape(initials(name))}</text></svg>`;
}

const svgCache = new Map<string, string>();

/** The SVG markup for someone's default picture, the same drawing on every platform. */
export function defaultAvatarSvg(name: string | null | undefined, avatarStyle: AvatarStyle = 'neutral') {
  const key = (name ?? '').trim() || '?';
  const cacheKey = `${avatarStyle}:${key}`;
  let svg = svgCache.get(cacheKey);
  if (!svg) {
    svg = AVATAR_STYLE === 'cartoon' ? cartoon(key, avatarStyle) : initialsTile(key);
    if (svgCache.size > 2000) svgCache.clear();
    svgCache.set(cacheKey, svg);
  }
  return svg;
}

/** A data URL for someone's default picture. */
export function defaultAvatarUrl(name: string | null | undefined, avatarStyle: AvatarStyle = 'neutral') {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(defaultAvatarSvg(name, avatarStyle))}`;
}

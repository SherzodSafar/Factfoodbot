// Surati yo'q odamlar uchun yoshiga mos, yuzsiz shablon avatarlar (inline SVG).
const SKIN = 'rgba(255,255,255,.94)';
const BODY = 'rgba(255,255,255,.72)';
const HAIR = 'rgba(48,28,18,.55)';
const GREY = 'rgba(255,255,255,.98)';

const shapes = {
  baby: () => `<path d="M14 64c0-12 8-17 18-17s18 5 18 17z" fill="${BODY}"/><circle cx="32" cy="31" r="13" fill="${SKIN}"/><path d="M29 18c1-4 6-4 6 0-2-1-4-1-6 0z" fill="${HAIR}"/>`,
  boy: () => `<path d="M15 64c0-11 7-16 17-16s17 5 17 16z" fill="${BODY}"/><circle cx="32" cy="29" r="12" fill="${SKIN}"/><path d="M20 27c0-9 6-13 12-13s12 4 12 13c-3-4-7-6-12-6s-9 2-12 6z" fill="${HAIR}"/>`,
  girl: () => `<path d="M15 64c0-11 7-16 17-16s17 5 17 16z" fill="${BODY}"/><circle cx="17" cy="30" r="4.5" fill="${HAIR}"/><circle cx="47" cy="30" r="4.5" fill="${HAIR}"/><circle cx="32" cy="29" r="12" fill="${SKIN}"/><path d="M20 28c0-9 6-14 12-14s12 5 12 14c-4-5-8-7-12-7s-8 2-12 7z" fill="${HAIR}"/>`,
  man: () => `<path d="M9 64c0-14 10-21 23-21s23 7 23 21z" fill="${BODY}"/><circle cx="32" cy="25" r="11" fill="${SKIN}"/><path d="M21 24c0-8 5-12 11-12s11 4 11 12c-2-3-6-5-11-5s-9 2-11 5z" fill="${HAIR}"/>`,
  woman: () => `<path d="M19 22c0-9 6-13 13-13s13 4 13 13v20c-4 2-22 2-26 0z" fill="${HAIR}"/><path d="M9 64c0-14 10-21 23-21s23 7 23 21z" fill="${BODY}"/><circle cx="32" cy="25" r="10.5" fill="${SKIN}"/><path d="M21.5 23c1-7 5-10 10.5-10s9.5 3 10.5 10c-3-3-6-5-10.5-5s-7.5 2-10.5 5z" fill="${HAIR}"/>`,
  oldman: () => `<path d="M9 64c0-14 10-21 23-21s23 7 23 21z" fill="${BODY}"/><circle cx="32" cy="26" r="11" fill="${SKIN}"/><path d="M23 29c2 9 6 12 9 12s7-3 9-12c-3 3-6 4-9 4s-6-1-9-4z" fill="${GREY}" stroke="rgba(0,0,0,.12)" stroke-width=".6"/><path d="M21.5 20l1.5-6h18l1.5 6c-6-1.5-15-1.5-21 0z" fill="rgba(20,20,24,.6)"/>`,
  oldwoman: () => `<path d="M9 64c0-14 10-21 23-21s23 7 23 21z" fill="${BODY}"/><path d="M32 10c-10 0-15 7-15 16 0 7 3 12 6 15h18c3-3 6-8 6-15 0-9-5-16-15-16z" fill="rgba(255,255,255,.82)" stroke="rgba(0,0,0,.1)" stroke-width=".6"/><ellipse cx="32" cy="27" rx="8.5" ry="10" fill="${SKIN}" stroke="rgba(0,0,0,.08)" stroke-width=".5"/>`,
};

export function ageGroup(p, a) {
  if (a == null) return p.deceased ? 'old' : 'adult';
  if (a < 3) return 'baby';
  if (a < 13) return 'kid';
  if (a < 55) return 'adult';
  return 'old';
}

export function defaultAvatar(p, a) {
  const g = ageGroup(p, a);
  const f = p.gender === 'f';
  const key = g === 'baby' ? 'baby' : g === 'kid' ? (f ? 'girl' : 'boy') : g === 'adult' ? (f ? 'woman' : 'man') : f ? 'oldwoman' : 'oldman';
  return `<svg class="ph" viewBox="0 0 64 64" aria-hidden="true">${shapes[key]()}</svg>`;
}

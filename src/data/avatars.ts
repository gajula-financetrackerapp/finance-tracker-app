import type { ImageSourcePropType } from 'react-native';

export type AvatarStyleId =
  | 'classic'
  | 'ravi'
  | 'aya'
  | 'sami'
  | 'mila'
  | 'ken'
  | 'yuki'
  | 'troy'
  | 'hana'
  | 'leo'
  | 'mia'
  | 'alex'
  | 'jade'
  | 'devon'
  | 'nia'
  | 'chris'
  | 'lena'
  | 'omar'
  | 'priya'
  | 'victor'
  | 'anita'
  | 'harold'
  | 'elise'
  | 'walter'
  | 'rose'
  | 'jamal'
  | 'zuri'
  | 'tunde'
  | 'kemi'
  | 'andre'
  | 'ime'
  | 'kwame'
  | 'folake'
  | 'ibrahim'
  | 'blessing'
  | 'elijah'
  | 'grace';

export type AvatarAccess = 'free' | 'premium';

export type AvatarStyleDef = {
  id: AvatarStyleId;
  label: string;
  blurb: string;
  access: AvatarAccess;
  /** Illustrated character image (Premium). */
  image?: ImageSourcePropType;
};

type CharId = Exclude<AvatarStyleId, 'classic'>;

const CHARACTERS: Record<CharId, { label: string; image: ImageSourcePropType }> = {
  ravi: { label: 'Ravi', image: require('../../assets/avatars/ravi.png') },
  jamal: { label: 'Jamal', image: require('../../assets/avatars/jamal.png') },
  aya: { label: 'Aya', image: require('../../assets/avatars/aya.png') },
  zuri: { label: 'Zuri', image: require('../../assets/avatars/zuri.png') },
  sami: { label: 'Sami', image: require('../../assets/avatars/sami.png') },
  mila: { label: 'Mila', image: require('../../assets/avatars/mila.png') },
  ken: { label: 'Ken', image: require('../../assets/avatars/ken.png') },
  tunde: { label: 'Tunde', image: require('../../assets/avatars/tunde.png') },
  yuki: { label: 'Yuki', image: require('../../assets/avatars/yuki.png') },
  kemi: { label: 'Kemi', image: require('../../assets/avatars/kemi.png') },
  troy: { label: 'Troy', image: require('../../assets/avatars/troy.png') },
  hana: { label: 'Hana', image: require('../../assets/avatars/hana.png') },
  leo: { label: 'Leo', image: require('../../assets/avatars/leo.png') },
  andre: { label: 'Andre', image: require('../../assets/avatars/andre.png') },
  mia: { label: 'Mia', image: require('../../assets/avatars/mia.png') },
  ime: { label: 'Ime', image: require('../../assets/avatars/ime.png') },
  alex: { label: 'Alex', image: require('../../assets/avatars/alex.png') },
  jade: { label: 'Jade', image: require('../../assets/avatars/jade.png') },
  devon: { label: 'Devon', image: require('../../assets/avatars/devon.png') },
  kwame: { label: 'Kwame', image: require('../../assets/avatars/kwame.png') },
  nia: { label: 'Nia', image: require('../../assets/avatars/nia.png') },
  folake: { label: 'Folake', image: require('../../assets/avatars/folake.png') },
  chris: { label: 'Chris', image: require('../../assets/avatars/chris.png') },
  lena: { label: 'Lena', image: require('../../assets/avatars/lena.png') },
  omar: { label: 'Omar', image: require('../../assets/avatars/omar.png') },
  ibrahim: { label: 'Ibrahim', image: require('../../assets/avatars/ibrahim.png') },
  priya: { label: 'Priya', image: require('../../assets/avatars/priya.png') },
  blessing: { label: 'Blessing', image: require('../../assets/avatars/blessing.png') },
  victor: { label: 'Victor', image: require('../../assets/avatars/victor.png') },
  anita: { label: 'Anita', image: require('../../assets/avatars/anita.png') },
  harold: { label: 'Harold', image: require('../../assets/avatars/harold.png') },
  elijah: { label: 'Elijah', image: require('../../assets/avatars/elijah.png') },
  elise: { label: 'Elise', image: require('../../assets/avatars/elise.png') },
  grace: { label: 'Grace', image: require('../../assets/avatars/grace.png') },
  walter: { label: 'Walter', image: require('../../assets/avatars/walter.png') },
  rose: { label: 'Rose', image: require('../../assets/avatars/rose.png') },
};

/**
 * Picker order: skin tones interleaved (not grouped as light-then-dark).
 * Pattern per age band: A, B(dark), A, B(dark), A, A…
 */
const MIXED_ORDER: CharId[] = [
  // Kids
  'ravi',
  'jamal',
  'aya',
  'zuri',
  'sami',
  'mila',
  // Teens
  'ken',
  'tunde',
  'yuki',
  'kemi',
  'troy',
  'hana',
  // Young adults
  'leo',
  'andre',
  'mia',
  'ime',
  'alex',
  'jade',
  // Adults
  'devon',
  'kwame',
  'nia',
  'folake',
  'chris',
  'lena',
  // Mature
  'omar',
  'ibrahim',
  'priya',
  'blessing',
  'victor',
  'anita',
  // Seniors
  'harold',
  'elijah',
  'elise',
  'grace',
  'walter',
  'rose',
];

/** Free = theme letter. Premium = 3D characters (flat mixed picker). */
export const AVATAR_STYLES: AvatarStyleDef[] = [
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Your initial · theme colors',
    access: 'free',
  },
  ...MIXED_ORDER.map((id) => ({
    id,
    label: CHARACTERS[id].label,
    blurb: 'Premium character',
    access: 'premium' as const,
    image: CHARACTERS[id].image,
  })),
];

export const DEFAULT_AVATAR_STYLE: AvatarStyleId = 'classic';

/** Premium character ids in picker order (excludes classic). */
export const PREMIUM_AVATAR_IDS: AvatarStyleId[] = MIXED_ORDER;

/** Retired / previous character ids → classic. */
const LEGACY_IDS = new Set([
  'pulse',
  'orbit',
  'shimmer',
  'aurora',
  'maya',
  'james',
  'sofia',
  'kenji',
  'aisha',
  'oliver',
  'marcus',
  'elena',
  'noah',
  'zara',
  'liam',
  'ava',
  'diego',
  'nina',
  'kai',
  'samira',
  'ethan',
  'hugo',
  'owen',
  'luna',
  'chloe',
  'ryan',
  'emma',
  'george',
  'marco',
  'nathan',
  'clara',
  'amara',
  'malik',
  'sophia',
  'helen',
  'isabella',
  'nora',
  'arthur',
  'daniel',
  'jake',
  'zoe',
]);

export function findAvatarStyle(id: string | null | undefined): AvatarStyleDef {
  if (!id || LEGACY_IDS.has(id)) return AVATAR_STYLES[0];
  return AVATAR_STYLES.find((s) => s.id === id) || AVATAR_STYLES[0];
}

export function canUseAvatarStyle(id: AvatarStyleId, isPremium: boolean): boolean {
  const def = findAvatarStyle(id);
  return def.access === 'free' || isPremium;
}

/** First letter of the user's name (falls back to email). */
export function userInitial(name?: string | null, email?: string | null): string {
  const n = (name || '').trim();
  if (n) {
    const ch = n.charAt(0);
    return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
  }
  const e = (email || '').trim();
  if (e) return e.charAt(0).toUpperCase();
  return '?';
}

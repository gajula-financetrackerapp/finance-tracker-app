import type { ImageSourcePropType } from 'react-native';

export type AvatarStyleId =
  | 'classic'
  | 'ryan'
  | 'emma'
  | 'george'
  | 'marco'
  | 'nathan'
  | 'clara'
  | 'amara'
  | 'malik'
  | 'sophia'
  | 'helen'
  | 'isabella'
  | 'nora'
  | 'arthur'
  | 'daniel';

export type AvatarAccess = 'free' | 'premium';

export type AvatarStyleDef = {
  id: AvatarStyleId;
  label: string;
  blurb: string;
  access: AvatarAccess;
  /** Illustrated character image (Premium). */
  image?: ImageSourcePropType;
};

/** Free = theme letter. Premium = 3D character portraits. */
export const AVATAR_STYLES: AvatarStyleDef[] = [
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Your initial · theme colors',
    access: 'free',
  },
  // Gents
  {
    id: 'ryan',
    label: 'Ryan',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/ryan.png'),
  },
  {
    id: 'george',
    label: 'George',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/george.png'),
  },
  {
    id: 'marco',
    label: 'Marco',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/marco.png'),
  },
  {
    id: 'nathan',
    label: 'Nathan',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/nathan.png'),
  },
  {
    id: 'malik',
    label: 'Malik',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/malik.png'),
  },
  {
    id: 'arthur',
    label: 'Arthur',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/arthur.png'),
  },
  {
    id: 'daniel',
    label: 'Daniel',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/daniel.png'),
  },
  // Ladies
  {
    id: 'emma',
    label: 'Emma',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/emma.png'),
  },
  {
    id: 'clara',
    label: 'Clara',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/clara.png'),
  },
  {
    id: 'amara',
    label: 'Amara',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/amara.png'),
  },
  {
    id: 'sophia',
    label: 'Sophia',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/sophia.png'),
  },
  {
    id: 'helen',
    label: 'Helen',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/helen.png'),
  },
  {
    id: 'isabella',
    label: 'Isabella',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/isabella.png'),
  },
  {
    id: 'nora',
    label: 'Nora',
    blurb: 'Premium character',
    access: 'premium',
    image: require('../../assets/avatars/nora.png'),
  },
];

export const DEFAULT_AVATAR_STYLE: AvatarStyleId = 'classic';

/** Retired ids (old 2D set / motion styles) → classic. */
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
  'priya',
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

import { uid } from '../utils';
import type { AdCreative } from '../types';

export function emptyAdCreative(partial?: Partial<AdCreative>): AdCreative {
  const id = partial?.id || uid();
  const base: AdCreative = {
    id,
    title: 'Your ad goes here',
    subtitle: 'Promote a partner app or offer for Pulse Wallet users.',
    icon: '📣',
    buttonLabel: 'Open',
    buttonUrl: 'https://example.com',
    appScheme: '',
    mediaUri: null,
    mediaType: null,
    endImageUri: null,
  };
  if (!partial) return base;
  return { ...base, ...partial, id: partial.id || id };
}

export function normalizeAdCreative(raw: Partial<AdCreative> | null | undefined): AdCreative | null {
  if (!raw || typeof raw !== 'object') return null;
  const mediaType =
    raw.mediaType === 'image' || raw.mediaType === 'video' ? raw.mediaType : null;
  const mediaUri =
    typeof raw.mediaUri === 'string' && raw.mediaUri.trim() ? raw.mediaUri.trim() : null;
  const endImageUri =
    typeof raw.endImageUri === 'string' && raw.endImageUri.trim()
      ? raw.endImageUri.trim()
      : null;
  return emptyAdCreative({
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : undefined,
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
    buttonLabel: typeof raw.buttonLabel === 'string' ? raw.buttonLabel : undefined,
    buttonUrl: typeof raw.buttonUrl === 'string' ? raw.buttonUrl : undefined,
    appScheme: typeof raw.appScheme === 'string' ? raw.appScheme : undefined,
    mediaUri: mediaUri && mediaType ? mediaUri : null,
    mediaType: mediaUri && mediaType ? mediaType : null,
    endImageUri,
  });
}

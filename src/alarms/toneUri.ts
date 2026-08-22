/**
 * Reading a tone's address out of what Android's ringtone picker sends back.
 *
 * Kept apart from toneChoice.ts, which cannot be loaded outside an app, so the
 * fiddly half can be tested: everything here is plain string work over the
 * shapes the picker's reply has been seen to arrive in.
 */

const EXTRA_PICKED = 'android.intent.extra.ringtone.PICKED_URI';

/** A tone is addressed by content://, or occasionally file:// or a resource. */
export function looksLikeUri(value: unknown): value is string {
  return typeof value === 'string' && /^(?:content|file|android\.resource):\/\//.test(value.trim());
}

/**
 * The picker names its tone with an Android Uri rather than a string, and what
 * survives the crossing to JavaScript is not guaranteed to be either. So take a
 * string if there is one, and otherwise anything that reads like one.
 */
export function readPickedUri(extra: Record<string, unknown> | undefined): string | null {
  const raw = extra?.[EXTRA_PICKED];
  if (looksLikeUri(raw)) return raw.trim();
  if (raw && typeof raw === 'object') {
    const candidate = raw as Record<string, unknown>;
    for (const key of ['uri', 'url', 'path', '_uri']) {
      const value = candidate[key];
      if (looksLikeUri(value)) return value.trim();
    }
    const asText = String(raw);
    if (looksLikeUri(asText)) return asText.trim();
  }
  return null;
}

/**
 * The launcher hands back `data` as the whole Intent printed out — something
 * like `Intent { dat=content://media/… flg=0x1 }` — rather than the URI on its
 * own. Saving that verbatim would store an address no player could open, so dig
 * the address out and take nothing else.
 */
export function uriFromIntentText(data: string | undefined): string | null {
  if (!data) return null;
  if (looksLikeUri(data)) return data.trim();
  const match = /\bdat=(\S+?)(?:\s|\}|$)/.exec(data);
  return looksLikeUri(match?.[1]) ? match[1] : null;
}

/** The address of the chosen tone, wherever in the reply it turned up. */
export function pickedToneUri(reply: {
  data?: string;
  extra?: Record<string, unknown>;
}): string | null {
  return readPickedUri(reply.extra) || uriFromIntentText(reply.data);
}

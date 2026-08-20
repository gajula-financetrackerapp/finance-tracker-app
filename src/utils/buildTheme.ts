import type { ThemeTokens } from '../types';

export type ThemeCore = {
  label: string;
  primary: string;
  primaryDark: string;
  bg: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  green: string;
  red: string;
  secondary?: string;
  headerEnd?: string;
  dualTone?: boolean;
  premiumMotion?: boolean;
};

/**
 * Fade a theme colour. Only plain #RRGGBB takes an alpha suffix — a token that
 * already carries one, such as accentSoft, is left alone rather than turned
 * into an invalid ten-character colour.
 */
export function withAlpha(color: string, alpha: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? `${color}${alpha}` : color;
}

/** Soft wash of the accent (for chips, badges, selected rows). */
function accentSoftFrom(primary: string): string {
  return withAlpha(primary, '26');
}

/** WCAG relative luminance. Falls back to mid-grey for colours we can't read. */
function luminance(color: string): number {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(color);
  if (!m) return 0.5;
  const channels = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The first candidate that is legible on `bg`, else whichever contrasts most.
 *
 * A label on a filled button cannot be a fixed colour: pairs that read well
 * against a bright accent like teal or amber disappear against a mid-dark one
 * like magenta. Candidates are given in order of preference, so a theme whose
 * house style already worked keeps it and only the failing ones move.
 */
function readableOn(bg: string, candidates: string[]): string {
  const scored = candidates.map((c) => ({ c, ratio: contrastRatio(bg, c) }));
  return (scored.find((s) => s.ratio >= 4.5) ||
    scored.reduce((best, s) => (s.ratio > best.ratio ? s : best))).c;
}

/** Mix a colour towards white (positive) or black (negative). */
function shift(color: string, amount: number): string {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(color);
  if (!m) return color;
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const hex = [0, 2, 4]
    .map((i) => {
      const c = parseInt(m[1].slice(i, i + 2), 16);
      return Math.round(c + (target - c) * weight)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
  return `#${hex}`;
}

/**
 * The accent, kept as the label colour on a filled surface by pushing it away
 * from the fill only as far as legibility needs. Jumping straight to white or
 * black reads fine but drops the theme's colour off every filled button in
 * the app, which is most of what makes a theme feel applied.
 */
function accentOn(bg: string, accent: string, ink: string): string {
  if (contrastRatio(bg, accent) >= 4.5) return accent;
  // Away from the fill: lighter on a dark surface, darker on a light one.
  const direction = luminance(bg) < 0.4 ? 1 : -1;
  for (let step = 1; step <= 9; step += 1) {
    const moved = shift(accent, direction * step * 0.1);
    if (contrastRatio(bg, moved) >= 4.5) return moved;
  }
  return readableOn(bg, ['#FFFFFF', ink, '#000000']);
}

/**
 * Secondary text, pushed away from the surfaces it sits on until it is
 * actually readable. Hand-picked greys land around 3.2–4.4:1 on a light theme,
 * which looks fine in a mock at 15px and disappears on a phone at 11px. The
 * hue is kept — only how far it sits from the background changes.
 */
function readableMuted(muted: string, bg: string, card: string, ink: string): string {
  const worstOn = (c: string) => Math.min(contrastRatio(bg, c), contrastRatio(card, c));
  if (worstOn(muted) >= 4.5) return muted;
  // Darker on a light theme, lighter on a dark one.
  const direction = luminance(bg) < 0.4 ? 1 : -1;
  for (let step = 1; step <= 9; step += 1) {
    const moved = shift(muted, direction * step * 0.1);
    if (worstOn(moved) >= 4.5) return moved;
  }
  return ink;
}

/** Fill header/accent aliases so the whole app can follow one color pack. */
export function withAppAliases(core: ThemeCore): ThemeTokens {
  const secondary = core.secondary || core.primary;
  const headerEnd = core.headerEnd || core.primaryDark;
  return {
    label: core.label,
    primary: core.primary,
    primaryDark: core.primaryDark,
    bg: core.bg,
    card: core.card,
    ink: core.ink,
    muted: readableMuted(core.muted, core.bg, core.card, core.ink),
    line: core.line,
    green: core.green,
    red: core.red,
    header: core.primaryDark,
    accent: core.primary,
    accentDark: core.primaryDark,
    accentSoft: accentSoftFrom(core.primary),
    onPrimary: readableOn(core.primary, [core.ink, '#FFFFFF', '#000000']),
    onPrimaryDark: accentOn(core.primaryDark, core.primary, core.ink),
    onInk: accentOn(core.ink, core.primary, core.bg),
    track: core.line,
    white: '#FFFFFF',
    shadow: 'rgba(16, 34, 31, 0.08)',
    secondary,
    headerEnd,
    dualTone: !!core.dualTone,
    premiumMotion: !!core.premiumMotion,
  };
}

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
    muted: core.muted,
    line: core.line,
    green: core.green,
    red: core.red,
    header: core.primaryDark,
    accent: core.primary,
    accentDark: core.primaryDark,
    accentSoft: accentSoftFrom(core.primary),
    track: core.line,
    white: '#FFFFFF',
    shadow: 'rgba(16, 34, 31, 0.08)',
    secondary,
    headerEnd,
    dualTone: !!core.dualTone,
    premiumMotion: !!core.premiumMotion,
  };
}

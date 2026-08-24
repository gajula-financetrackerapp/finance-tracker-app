import type { RawImportMessage } from './importRules/parseImportText';

export const GMAIL_CARD_QUERY =
  'newer_than:60d (statement OR "amount due" OR "payment due" OR "e-statement" OR estatement OR TAD OR PDD OR "total due") (hdfc OR icici OR sbi OR sbicard OR axis OR kotak OR yesbank OR "yes bank" OR idfc OR bobcard OR onecard OR "credit card" OR cardmember)';

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

export type GmailMessagePayload = {
  id?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
};

function header(headers: GmailHeader[] | undefined, name: string): string {
  const want = name.toLowerCase();
  return (headers || []).find((h) => (h.name || '').toLowerCase() === want)?.value || '';
}

export function decodeGmailData(data?: string): string {
  if (!data) return '';
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  try {
    if (typeof atob === 'function') return atob(padded + pad);
    const buf = Buffer.from(padded + pad, 'base64');
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function collectText(part: GmailPart | undefined, into: { plain: string; html: string }) {
  if (!part) return;
  const mime = (part.mimeType || '').toLowerCase();
  const text = decodeGmailData(part.body?.data);
  if (mime === 'text/plain' && text) into.plain += `${text}\n`;
  if (mime === 'text/html' && text) into.html += `${text}\n`;
  for (const child of part.parts || []) collectText(child, into);
}

export function gmailPayloadToBody(msg: GmailMessagePayload): string {
  const bag = { plain: '', html: '' };
  collectText(msg.payload, bag);
  const body = bag.plain.trim() || stripHtml(bag.html);
  return body || (msg.snippet || '').trim();
}

export function gmailMessageToRaw(msg: GmailMessagePayload): RawImportMessage | null {
  const body = gmailPayloadToBody(msg);
  if (!body) return null;
  const from = header(msg.payload?.headers, 'from');
  const dateMs = Number(msg.internalDate);
  return {
    id: msg.id ? `gmail:${msg.id}` : undefined,
    body,
    address: from,
    date: Number.isFinite(dateMs) && dateMs > 0 ? dateMs : undefined,
    sourceLabel: 'gmail',
  };
}

export function gmailMessagesToRaw(messages: GmailMessagePayload[]): RawImportMessage[] {
  return messages.map(gmailMessageToRaw).filter((m): m is RawImportMessage => !!m);
}

export function emailsMatch(login?: string | null, gmail?: string | null): boolean {
  const a = (login || '').trim().toLowerCase();
  const b = (gmail || '').trim().toLowerCase();
  return !!a && !!b && a === b;
}

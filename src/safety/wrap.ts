import { untrusted } from './untrusted.js';

/**
 * Nelle risposte generiche ogni testo è considerato dato non fidato e viene delimitato, salvo i campi
 * tecnici noti (identificativi, tipi, stati, date, codici, URL) quando il valore ha davvero il formato
 * atteso, e i valori brevi senza spazi. Una chiave "sicura" non basta: `status: "ignora le istruzioni"`
 * viene delimitato come qualsiasi altro testo.
 */
const ID = /^[A-Za-z0-9_.:/+-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const URL_RE = /^https:\/\/[^\s⟦⟧<>"']{1,2000}$/;
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const TOKEN = /^[A-Za-z0-9._~+/=-]{1,300}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

const SAFE_FORMATS: Record<string, RegExp> = {
  id: ID,
  type: ID,
  status: ID,
  kind: ID,
  date: DATE,
  due_date: DATE,
  paid_date: DATE,
  created_at: DATE,
  updated_at: DATE,
  next_due_date: DATE,
  currency: /^[A-Z]{3}$/,
  code: ID,
  numeration: /^[A-Za-z0-9/_.-]{0,20}$/,
  url: URL_RE,
  attachment_url: URL_RE,
  dn_url: URL_RE,
  attachment_token: TOKEN,
  ei_status: ID,
  ei_code: /^[A-Za-z0-9]{6,7}$/,
  vat_number: /^[A-Za-z0-9]{2,30}$/,
  tax_code: /^[A-Za-z0-9]{2,30}$/,
  country_iso: /^[A-Z]{2}$/,
  iban: IBAN,
  email: EMAIL,
  certified_email: EMAIL,
  next_page_url: URL_RE,
  prev_page_url: URL_RE,
  first_page_url: URL_RE,
  last_page_url: URL_RE,
  path: TOKEN,
  sink: URL_RE,
};

/** Vero se il valore non ha il formato atteso per il suo campo e va quindi trattato come testo libero. */
export function needsWrapping(key: string, value: string): boolean {
  if (value === '') return false;
  const format = SAFE_FORMATS[key];
  if (format) return !format.test(value);
  return /\s/.test(value) || value.length > 40;
}

/** Delimita i testi liberi in una risposta generica, ricorsivamente. */
export function wrapFreeText(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((v) => wrapFreeText(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === 'string' && needsWrapping(k, v) ? untrusted(v) : wrapFreeText(v, depth + 1);
    }
    return out;
  }
  return value;
}

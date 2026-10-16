import { untrusted } from './untrusted.js';

/**
 * Nelle risposte generiche ogni testo è considerato dato non fidato e viene delimitato, salvo i campi
 * tecnici noti (identificativi, tipi, stati, date, codici) e i valori brevi senza spazi.
 */
const SAFE_KEYS = new Set([
  'id',
  'type',
  'status',
  'kind',
  'date',
  'due_date',
  'paid_date',
  'created_at',
  'updated_at',
  'next_due_date',
  'currency',
  'code',
  'numeration',
  'url',
  'attachment_url',
  'dn_url',
  'attachment_token',
  'ei_status',
  'ei_code',
  'vat_number',
  'tax_code',
  'country_iso',
  'iban',
  'email',
  'certified_email',
  'next_page_url',
  'prev_page_url',
  'first_page_url',
  'last_page_url',
  'path',
  'sink',
]);

function needsWrapping(key: string, value: string): boolean {
  if (SAFE_KEYS.has(key) && value.length <= 300) return false;
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

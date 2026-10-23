import { refused } from '../api/errors.js';

/**
 * Coordinate bancarie: il server non le invia mai a Fatture in Cloud.
 *
 * Fatture in Cloud ha bloccato un account per "tentativo di inserimento di un IBAN non autorizzato" partito
 * da una fattura creata via API. Le coordinate di pagamento di un documento devono venire solo dal metodo
 * di pagamento configurato nell'account (`payment_method: {id}`); conti, metodi di pagamento e IBAN si
 * gestiscono dall'app web. Qui si riconoscono le chiavi bancarie (anche quelle FatturaPA di `ei_raw`) e
 * qualsiasi testo che abbia la forma di un IBAN, con o senza spazi, di qualunque paese.
 */

/** Parole che, in una chiave, indicano dati bancari: bank_iban, bank_name, bank_beneficiary, IBAN, BIC, ABI, CAB... */
const BANK_WORDS = new Set([
  'iban',
  'swift',
  'bic',
  'bank',
  'banca',
  'beneficiary',
  'beneficiario',
  'abi',
  'cab',
  'istitutofinanziario',
]);

/** Vero se la chiave descrive un dato bancario. */
export function isBankKey(key: string): boolean {
  const whole = key.toLowerCase();
  if (BANK_WORDS.has(whole)) return true;
  const words = key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((w) => BANK_WORDS.has(w));
}

/** Un IBAN ha almeno 15 e al massimo 34 caratteri; il BBAN (dopo paese e controllo) è fatto soprattutto di cifre. */
function plausibleIban(compact: string): boolean {
  if (compact.length < 15 || compact.length > 34) return false;
  const bban = compact.slice(4);
  const digits = bban.replace(/\D/g, '').length;
  return digits >= 8 && digits / bban.length >= 0.5;
}

/** Lunghezza dell'IBAN per paese (registro SWIFT). */
// biome-ignore format: tabella compatta
const IBAN_LENGTH: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22,
  CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22,
  GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30,
  KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31,
  MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24,
  SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** Controllo ISO 13616 (modulo 97). */
function validChecksum(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

// Forma compatta, anche minuscola: IT60X0542811101000000123456 (basta la forma, non serve il controllo).
const COMPACT = /(?<![A-Za-z0-9])[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}(?![A-Za-z0-9])/g;
// Forma stampata a gruppi di quattro: IT60 X054 2811 1010 0000 0123 456.
const GROUPED = /(?<![A-Z0-9])[A-Z]{2}\d{2}(?:[ -][A-Z0-9]{4}){3,7}(?:[ -][A-Z0-9]{1,3})?(?![A-Z0-9])/g;
const START = /[A-Z]{2}\d{2}/g;

/**
 * Vero se il testo contiene qualcosa che ha la forma di un IBAN. Tre controlli: forma compatta, forma a
 * gruppi di quattro, e qualsiasi altra spaziatura (IT 60 X 05428 11101 000000123456) riconosciuta sul testo
 * senza spazi con lunghezza del paese e cifre di controllo valide, per non scambiare per IBAN numeri e date.
 */
export function containsIban(text: string): boolean {
  if (text.length < 15) return false;
  for (const m of text.matchAll(COMPACT)) if (plausibleIban(m[0].toUpperCase())) return true;
  for (const m of text.matchAll(GROUPED)) if (plausibleIban(m[0].replace(/[ -]/g, ''))) return true;
  const squeezed = text.toUpperCase().replace(/[\s\-.]+/g, '');
  for (const m of squeezed.matchAll(START)) {
    const len = IBAN_LENGTH[m[0].slice(0, 2)];
    if (!len) continue;
    const candidate = squeezed.slice(m.index, m.index + len);
    if (candidate.length === len && /^[A-Z0-9]+$/.test(candidate) && validChecksum(candidate)) return true;
  }
  return false;
}

export interface BankFinding {
  /** Percorso del campo nel corpo, per esempio `data.notes` o `data.payment_method.details[0].description`. */
  path: string;
  reason: 'chiave bancaria' | 'testo con la forma di un IBAN';
}

/** Primo dato bancario trovato nel valore, ricorsivamente; undefined se non ce ne sono. */
export function findBankData(value: unknown, path = '', depth = 0): BankFinding | undefined {
  if (depth > 20) return undefined;
  if (typeof value === 'string') {
    return containsIban(value)
      ? { path: path || '(valore)', reason: 'testo con la forma di un IBAN' }
      : undefined;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const f = findBankData(value[i], `${path}[${i}]`, depth + 1);
      if (f) return f;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k;
      // Una chiave bancaria vuota (null, "") non trasmette coordinate: non la si considera.
      if (isBankKey(k) && v !== null && v !== undefined && v !== '' && v !== false)
        return { path: p, reason: 'chiave bancaria' };
      const f = findBankData(v, p, depth + 1);
      if (f) return f;
    }
  }
  return undefined;
}

export const BANK_REFUSAL =
  'Per sicurezza questo server non invia mai coordinate bancarie (IBAN, banca, beneficiario, BIC) a Fatture in Cloud: le coordinate di pagamento di un documento vengono solo dal metodo di pagamento configurato nell’account (payment_method con il solo id). Togli il dato e riprova; conti, metodi di pagamento e IBAN si gestiscono dall’app web di Fatture in Cloud.';

/** Rifiuta il corpo se contiene dati bancari. Il valore trovato non viene ripetuto nel messaggio. */
export function assertNoBankData(value: unknown, context: string): void {
  const f = findBankData(value);
  if (f) throw refused(`${context}: trovato un dato bancario (${f.reason}) in ${f.path}. ${BANK_REFUSAL}`);
}

/**
 * Copia senza le chiavi bancarie, ricorsivamente: per i dati che arrivano da Fatture in Cloud e vengono
 * reinviati (duplicazione, conversione, modifica dei dati SDI). I testi con un IBAN restano: li ferma
 * `assertNoBankData` con un messaggio chiaro, invece di toglierli in silenzio.
 */
export function stripBankKeys<T>(value: T, depth = 0): T {
  if (depth > 20) return value;
  if (Array.isArray(value)) return value.map((v) => stripBankKeys(v, depth + 1)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (isBankKey(k)) continue;
      out[k] = stripBankKeys(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

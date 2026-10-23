import { refused } from '../api/errors.js';
import { stripBankKeys } from '../safety/bank.js';
import { addDays, daysBetween, endOfMonth } from './dates.js';
import { fromCents, splitCents, toCents } from './money.js';
import type { Entity, IssuedDocument, Item, PaymentItem } from './types.js';

/**
 * Campi dell'anagrafica copiati nel documento: FIC non completa nulla da solo a partire da `entity.id`
 * (https://developers.fattureincloud.it/docs/FAQs/), quindi la fotografia del cliente va inviata per intero.
 */
const ENTITY_FIELDS = [
  'id',
  'name',
  'type',
  'first_name',
  'last_name',
  'vat_number',
  'tax_code',
  'address_street',
  'address_postal_code',
  'address_city',
  'address_province',
  'address_extra',
  'country',
  'country_iso',
  'email',
  'certified_email',
  'phone',
  'contact_person',
  'ei_code',
  'e_invoice',
  'has_intent_declaration',
  'intent_declaration_protocol_number',
  'intent_declaration_protocol_date',
] as const;

export function entitySnapshot(e: Entity): Entity {
  const out: Record<string, unknown> = {};
  for (const k of ENTITY_FIELDS) {
    const v = e[k];
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out as Entity;
}

export interface Terms {
  days: number;
  type: 'standard' | 'end_of_month';
}

export function dueDateFor(date: string, terms: Terms): string {
  const d = addDays(date, terms.days);
  return terms.type === 'end_of_month' ? endOfMonth(d) : d;
}

/**
 * Rate da un totale da pagare calcolato da FIC: `count` rate uguali al centesimo, con scadenze a
 * `terms.days`, `2 * terms.days`... dalla data del documento. L'ultima rata assorbe il resto.
 */
export function buildInstallments(
  amountDue: number,
  date: string,
  count: number,
  terms: Terms,
): PaymentItem[] {
  const parts = splitCents(toCents(amountDue), count);
  return parts.map((c, i) => ({
    amount: fromCents(c),
    due_date: dueDateFor(date, { days: terms.days * (i + 1), type: terms.type }),
    status: 'not_paid',
    payment_terms: { days: terms.days * (i + 1), type: terms.type },
  }));
}

/**
 * Rate esplicite. Gli importi indicati si arrotondano al centesimo (metà per eccesso) e si inviano così;
 * il residuo del totale da pagare si divide in parti uguali tra le rate senza importo. Se gli importi
 * arrotondati non tornano con il totale si rifiuta, invece di lasciare che `fix_payments` corregga
 * l'ultima rata senza dirlo.
 */
export function explicitInstallments(
  amountDue: number,
  list: Array<{ due_date: string; amount?: number }>,
): PaymentItem[] {
  const due = toCents(amountDue);
  const given = list.reduce((a, p) => a + (p.amount !== undefined ? toCents(p.amount) : 0), 0);
  const missing = list.filter((p) => p.amount === undefined).length;
  const fmt = (c: number) => fromCents(c).toFixed(2);
  if (missing === 0 && given !== due) {
    throw refused(
      `La somma delle rate (${fmt(given)}) è diversa dal totale da pagare calcolato da Fatture in Cloud (${fmt(due)}). Correggi gli importi oppure lasciane uno vuoto: verrà calcolato come differenza.`,
    );
  }
  if (missing > 0 && given >= due) {
    throw refused(
      `Gli importi indicati (${fmt(given)}) coprono già il totale da pagare (${fmt(due)}): le rate senza importo resterebbero a zero.`,
    );
  }
  const rest = missing > 0 ? splitCents(due - given, missing) : [];
  let k = 0;
  return list.map((p) => ({
    amount: fromCents(p.amount !== undefined ? toCents(p.amount) : rest[k++]!),
    due_date: p.due_date,
    status: 'not_paid',
  }));
}

/** Tipi di documento che hanno rate di pagamento. */
export function hasPayments(type: string): boolean {
  return !['delivery_note', 'work_report', 'supplier_order'].includes(type);
}

/** Campi dei documenti emessi che si possono copiare in una duplicazione (vedi docs/ANALISI.md, sezione 1.3). */
const COPY_FIELDS = [
  'type',
  'numeration',
  'currency',
  'language',
  'subject',
  'visible_subject',
  'rc_center',
  'notes',
  'rivalsa',
  'cassa',
  'cassa_taxable',
  'amount_cassa_taxable',
  'cassa2',
  'cassa2_taxable',
  'amount_cassa2_taxable',
  'global_cassa_taxable',
  'amount_global_cassa_taxable',
  'withholding_tax',
  'withholding_tax_taxable',
  'other_withholding_tax',
  'stamp_duty',
  'use_split_payment',
  'use_gross_prices',
  'e_invoice',
  'ei_cassa_type',
  'ei_cassa2_type',
  'ei_withholding_tax_causal',
  'ei_other_withholding_tax_type',
  'ei_other_withholding_tax_causal',
  'template',
  'show_payments',
  'show_payment_method',
  'show_totals',
  'show_notification_button',
  'show_tspay_button',
  'h_margins',
  'v_margins',
  'amount_due_discount',
  'amount_rivalsa_taxable',
  'amount_withholding_tax_taxable',
  'amount_other_withholding_tax_taxable',
  'amount_enasarco_taxable',
  // ei_raw non si copia: i dati FatturaPA grezzi possono contenere coordinate bancarie (IBAN, ABI, CAB).
  'price_list_id',
  'delivery_note',
  'accompanying_invoice',
  'delivery_note_template',
  'acc_inv_template',
  'dn_ai_packages_number',
  'dn_ai_weight',
  'dn_ai_causal',
  'dn_ai_destination',
  'dn_ai_transporter',
  'dn_ai_notes',
] as const;

/** Importi imponibili che si possono impostare solo se la percentuale corrispondente è nulla (OpenAPI). */
const TAXABLE_PAIRS: Array<[string, string]> = [
  ['amount_cassa_taxable', 'cassa_taxable'],
  ['amount_cassa2_taxable', 'cassa2_taxable'],
  ['amount_global_cassa_taxable', 'global_cassa_taxable'],
];

/** Campi di extra_data che descrivono lo stato di invii già fatti: non si copiano. */
const EXTRA_DATA_SKIP = new Set([
  'ts_status',
  'ts_file_id',
  'ts_sent_date',
  'imported_by',
  'multifatture_sent',
]);

const ITEM_COPY = [
  'product_id',
  'code',
  'name',
  'description',
  'category',
  'qty',
  'measure',
  'discount',
  'discount_highlight',
  'not_taxable',
  'apply_withholding_taxes',
  'in_dn',
] as const;

export interface Replacement {
  from: string;
  to: string;
}

function replaceAll(s: unknown, reps: Replacement[]): unknown {
  if (typeof s !== 'string' || !reps.length) return s;
  return reps.reduce((acc, r) => acc.split(r.from).join(r.to), s);
}

/**
 * Corpo per duplicare un documento: whitelist dei campi scrivibili; niente ID, numero, importi di sola
 * lettura, URL, stato SDI, ID di righe e rate. Le aliquote restano quelle originali (per `id`).
 * Niente coordinate bancarie: del metodo di pagamento si copia solo l'id, da `ei_data` si tolgono
 * bank_iban, bank_name, bank_beneficiary e simili, `ei_raw` non si copia.
 * Le rate vanno ricalcolate dopo, sul totale calcolato da FIC.
 */
export function duplicateBody(
  src: IssuedDocument,
  opts: { date: string; entity: Entity; replacements: Replacement[]; keepNumeration: boolean },
): IssuedDocument {
  const out: Record<string, unknown> = {};
  for (const k of COPY_FIELDS) {
    const v = src[k];
    if (v !== null && v !== undefined) out[k] = v;
  }
  for (const [amount, pct] of TAXABLE_PAIRS) {
    if (src[pct as keyof IssuedDocument] !== null && src[pct as keyof IssuedDocument] !== undefined)
      delete out[amount];
  }
  const extra = src.extra_data;
  if (extra) {
    const kept = Object.fromEntries(
      Object.entries(extra).filter(([k, v]) => !EXTRA_DATA_SKIP.has(k) && v !== null),
    );
    if (Object.keys(kept).length) out.extra_data = kept;
  }
  if (!opts.keepNumeration) delete out.numeration;
  out.date = opts.date;
  out.entity = entitySnapshot(opts.entity);
  out.subject = replaceAll(out.subject, opts.replacements);
  out.visible_subject = replaceAll(out.visible_subject, opts.replacements);
  out.notes = replaceAll(out.notes, opts.replacements);
  if (src.payment_method?.id) out.payment_method = { id: src.payment_method.id };
  if (src.ei_data) {
    // I riferimenti a ordini e fatture collegate valgono per il documento originale.
    const { od_number, od_date, invoice_number, invoice_date, original_document_type, ...rest } =
      src.ei_data as Record<string, unknown>;
    out.ei_data = stripBankKeys(rest);
  }
  out.items_list = (src.items_list ?? []).map((it) => {
    const item: Record<string, unknown> = {};
    for (const k of ITEM_COPY) {
      const v = it[k];
      if (v !== null && v !== undefined) item[k] = v;
    }
    item.name = replaceAll(item.name, opts.replacements);
    item.description = replaceAll(item.description, opts.replacements);
    if (src.use_gross_prices) item.gross_price = it.gross_price;
    else item.net_price = it.net_price;
    if (it.vat?.id !== null && it.vat?.id !== undefined) item.vat = { id: it.vat.id };
    return item as Item;
  });
  return out as IssuedDocument;
}

/**
 * Rate del documento duplicato: stesse proporzioni degli importi dell'originale, applicate al nuovo totale
 * da pagare calcolato da FIC. Le scadenze si ricalcolano dai termini della rata (giorni e fine mese) quando
 * ci sono, altrimenti con la stessa distanza in giorni dalla data del documento. Se l'originale non ha rate,
 * nemmeno la copia ne ha. I dati FatturaPA grezzi delle rate (`ei_raw`, che può contenere l'IBAN) non si copiano.
 */
export function shiftedInstallments(src: IssuedDocument, newDate: string, amountDue: number): PaymentItem[] {
  const list = (src.payments_list ?? []).filter((p) => p.status !== 'reversed');
  if (!list.length) return [];
  const origTotal = list.reduce((a, p) => a + toCents(p.amount), 0);
  const due = toCents(amountDue);
  let assigned = 0;
  return list.map((p, i) => {
    const cents =
      i === list.length - 1
        ? due - assigned
        : origTotal
          ? Math.round((due * toCents(p.amount)) / origTotal)
          : 0;
    assigned += cents;
    const type = p.payment_terms?.type === 'end_of_month' ? 'end_of_month' : 'standard';
    const days = p.payment_terms?.days;
    let dueDate: string;
    if (days !== null && days !== undefined) dueDate = dueDateFor(newDate, { days, type });
    else if (p.due_date && src.date) dueDate = addDays(newDate, daysBetween(src.date, p.due_date));
    else dueDate = addDays(newDate, 30);
    return {
      amount: fromCents(cents),
      due_date: dueDate,
      status: 'not_paid',
      ...(days !== null && days !== undefined ? { payment_terms: { days, type } } : {}),
    };
  });
}

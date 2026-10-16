import { untrusted } from '../safety/untrusted.js';
import { daysBetween } from './dates.js';
import { fromCents, sumCents, toCents } from './money.js';
import type { Entity, IssuedDocument, PaymentItem } from './types.js';

/** Campi chiesti all'API per gli elenchi: il fieldset `basic` non include rate, stato SDI e blocco. */
export const ISSUED_LIST_FIELDS = [
  'id',
  'type',
  'number',
  'numeration',
  'date',
  'entity',
  'currency',
  'subject',
  'visible_subject',
  'amount_net',
  'amount_vat',
  'amount_gross',
  'next_due_date',
  'payments_list',
  'e_invoice',
  'ei_status',
  'locked',
].join(',');

export const EI_STATUS_IT: Record<string, string> = {
  attempt: 'invio in corso (può durare fino a 2 ore)',
  missing: 'fattura mancante',
  not_sent: 'non ancora inviata allo SDI',
  sent: 'inviata allo SDI',
  pending: 'controlli su firma e invio in corso',
  processing: 'lo SDI sta consegnando al cliente',
  error: 'errore: va corretta e reinviata, o va contattato il supporto',
  discarded: 'scartata dallo SDI: va corretta e reinviata',
  not_delivered: 'lo SDI non è riuscito a consegnarla',
  accepted: 'accettata dal cliente',
  rejected: 'rifiutata dal cliente: va corretta',
  no_response: 'nessuna risposta entro la scadenza',
  manual_accepted: 'accettata dal cliente',
  manual_rejected: 'rifiutata dal cliente',
};

/** Numero leggibile del documento: numero più sezionale, per esempio "33" o "12/A". */
export function displayNumber(doc: Pick<IssuedDocument, 'number' | 'numeration'>): string | undefined {
  if (doc.number === null || doc.number === undefined) return undefined;
  return `${doc.number}${doc.numeration ?? ''}`;
}

export function entityName(e: Entity | null | undefined): string | undefined {
  if (!e) return undefined;
  return e.name || [e.first_name, e.last_name].filter(Boolean).join(' ') || undefined;
}

export interface PaymentSummary {
  payment_status: 'paid' | 'partially_paid' | 'not_paid' | 'no_installments';
  amount_paid: number;
  amount_outstanding: number;
  amount_overdue: number;
  installments: number;
  overdue_installments: number;
}

/** Rata ancora da incassare: né pagata né stornata. Unica definizione usata in tutto il server. */
export function isOpen(p: PaymentItem): boolean {
  return p.status !== 'paid' && p.status !== 'reversed';
}

/** Stato di pagamento derivato dalle rate. Le rate stornate (`reversed`) non contano né come pagate né come dovute. */
export function paymentSummary(payments: PaymentItem[] | null | undefined, today: string): PaymentSummary {
  const list = (payments ?? []).filter((p) => p.status !== 'reversed');
  const paid = list.filter((p) => p.status === 'paid');
  const open = list.filter(isOpen);
  const overdue = open.filter((p) => p.due_date && p.due_date < today);
  let status: PaymentSummary['payment_status'] = 'no_installments';
  if (list.length) status = open.length === 0 ? 'paid' : paid.length === 0 ? 'not_paid' : 'partially_paid';
  return {
    payment_status: status,
    amount_paid: fromCents(sumCents(paid.map((p) => p.amount))),
    amount_outstanding: fromCents(sumCents(open.map((p) => p.amount))),
    amount_overdue: fromCents(sumCents(overdue.map((p) => p.amount))),
    installments: list.length,
    overdue_installments: overdue.length,
  };
}

export function installmentView(p: PaymentItem, index: number, today: string) {
  const overdue = isOpen(p) && Boolean(p.due_date && p.due_date < today);
  return {
    index,
    id: p.id ?? undefined,
    due_date: p.due_date ?? undefined,
    amount: p.amount ?? undefined,
    status: p.status ?? 'not_paid',
    overdue: overdue || undefined,
    days_overdue: overdue && p.due_date ? daysBetween(p.due_date, today) : undefined,
    paid_date: p.paid_date ?? undefined,
    payment_account: p.payment_account?.id
      ? { id: p.payment_account.id, name: p.payment_account.name ?? undefined }
      : undefined,
    payment_terms_days: p.payment_terms?.days ?? undefined,
  };
}

/** Riga compatta per gli elenchi. */
export function issuedSummary(doc: IssuedDocument, today: string) {
  const pay = doc.payments_list ? paymentSummary(doc.payments_list, today) : undefined;
  return {
    id: doc.id,
    type: doc.type,
    number: displayNumber(doc),
    date: doc.date,
    client: doc.entity
      ? { id: doc.entity.id ?? undefined, name: untrusted(entityName(doc.entity), 200) }
      : undefined,
    subject: untrusted(doc.visible_subject || doc.subject, 300),
    amount_net: doc.amount_net,
    amount_vat: doc.amount_vat,
    amount_gross: doc.amount_gross,
    currency: doc.currency?.id && doc.currency.id !== 'EUR' ? doc.currency.id : undefined,
    payment_status: pay?.payment_status,
    amount_outstanding: pay && pay.amount_outstanding > 0 ? pay.amount_outstanding : undefined,
    amount_overdue: pay && pay.amount_overdue > 0 ? pay.amount_overdue : undefined,
    next_due_date: doc.next_due_date,
    e_invoice: doc.e_invoice || undefined,
    ei_status: doc.ei_status ?? undefined,
    locked: doc.locked || undefined,
  };
}

/** Dettaglio completo, con righe, rate e totali. */
export function issuedDetail(doc: IssuedDocument, today: string) {
  const e = doc.entity;
  return {
    id: doc.id,
    type: doc.type,
    number: displayNumber(doc),
    numeration: doc.numeration || undefined,
    date: doc.date,
    currency: doc.currency?.id ?? 'EUR',
    client: e
      ? {
          id: e.id ?? undefined,
          name: untrusted(entityName(e), 200),
          vat_number: e.vat_number,
          tax_code: e.tax_code,
          address: untrusted(
            [e.address_street, e.address_postal_code, e.address_city, e.address_province]
              .filter(Boolean)
              .join(', '),
            300,
          ),
          country: e.country,
          email: e.email,
          certified_email: e.certified_email,
          ei_code: e.ei_code,
        }
      : undefined,
    subject: untrusted(doc.subject),
    visible_subject: untrusted(doc.visible_subject),
    items: (doc.items_list ?? []).map((it) => ({
      product_id: it.product_id ?? undefined,
      code: it.code ?? undefined,
      name: untrusted(it.name, 500),
      description: untrusted(it.description),
      qty: it.qty,
      measure: it.measure || undefined,
      net_price: it.net_price,
      gross_price: doc.use_gross_prices ? it.gross_price : undefined,
      discount: it.discount || undefined,
      vat: it.vat
        ? {
            id: it.vat.id,
            rate: it.vat.value,
            description: it.vat.description ?? undefined,
            ei_type: it.vat.ei_type ?? undefined,
          }
        : undefined,
      not_taxable: it.not_taxable || undefined,
    })),
    totals: {
      amount_net: doc.amount_net,
      amount_vat: doc.amount_vat,
      amount_gross: doc.amount_gross,
      amount_withholding_tax: doc.amount_withholding_tax || undefined,
      amount_other_withholding_tax: doc.amount_other_withholding_tax || undefined,
      amount_rivalsa: doc.amount_rivalsa || undefined,
      stamp_duty: doc.stamp_duty || undefined,
      use_split_payment: doc.use_split_payment || undefined,
    },
    payment_method: doc.payment_method?.id
      ? { id: doc.payment_method.id, name: doc.payment_method.name ?? undefined }
      : undefined,
    payments: paymentSummary(doc.payments_list, today),
    installments: (doc.payments_list ?? []).map((p, i) => installmentView(p, i + 1, today)),
    e_invoice: doc.e_invoice
      ? {
          status: doc.ei_status ?? undefined,
          status_meaning: doc.ei_status ? EI_STATUS_IT[doc.ei_status] : undefined,
          payment_method: (doc.ei_data?.payment_method as string | undefined) ?? undefined,
        }
      : undefined,
    locked: doc.locked || undefined,
    notes: untrusted(doc.notes),
    pdf_url: doc.url
      ? {
          url: doc.url,
          avviso:
            'Link temporaneo (scade dopo 7 giorni): chi lo possiede scarica il PDF senza autenticazione. Per salvarlo in locale usa fic_download_file.',
        }
      : undefined,
    updated_at: doc.updated_at,
  };
}

/** Somma in euro di un campo su un insieme di documenti. */
export function sumField<T>(docs: T[], pick: (d: T) => number | null | undefined): number {
  return fromCents(docs.reduce((acc, d) => acc + toCents(pick(d)), 0));
}

/** Fixture inventate: nessun dato reale. Nomi, importi e codici sono fittizi. */
import type { IssuedDocument, PaymentItem } from '../../src/domain/types.js';

export const CLIENT_ROSSI = {
  id: 501,
  name: 'Studio Rossi di Mario Rossi',
  type: 'person',
  vat_number: '01234567890',
  tax_code: 'RSSMRA80A01H501U',
  address_street: 'Via Inventata 1',
  address_postal_code: '20100',
  address_city: 'Milano',
  address_province: 'MI',
  country: 'Italia',
  email: 'rossi@example.com',
  certified_email: 'rossi@pec.example.com',
  ei_code: '0000000',
};

export const CLIENT_BIANCHI = {
  id: 502,
  name: "L'Officina di Bianchi",
  type: 'company',
  vat_number: '09876543210',
  email: 'bianchi@example.com',
};

export function payment(p: Partial<PaymentItem> & { amount: number; due_date: string }): PaymentItem {
  return {
    id: Math.floor(Math.random() * 1e6),
    status: 'not_paid',
    payment_account: null,
    paid_date: null,
    payment_terms: { days: 30, type: 'standard' },
    ...p,
  };
}

let nextId = 9000;

export function invoice(over: Partial<IssuedDocument> = {}): IssuedDocument {
  const id = over.id ?? nextId++;
  return {
    id,
    type: 'invoice',
    number: 33,
    numeration: '',
    date: '2026-10-01',
    year: 2026,
    entity: CLIENT_ROSSI,
    currency: { id: 'EUR', symbol: '€', exchange_rate: '1.00000' },
    language: { code: 'it', name: 'Italiano' },
    subject: 'Consulenza ottobre',
    visible_subject: 'Consulenza ottobre',
    notes: null,
    amount_net: 600,
    amount_vat: 0,
    amount_gross: 602,
    stamp_duty: 2,
    use_gross_prices: false,
    use_split_payment: false,
    e_invoice: true,
    ei_status: 'accepted',
    ei_data: { payment_method: 'MP05' },
    locked: false,
    payment_method: { id: 77, name: 'Bonifico' },
    items_list: [
      {
        id: 1,
        product_id: null,
        name: 'Incontro di consulenza',
        description: 'Tre incontri',
        qty: 3,
        net_price: 200,
        vat: { id: 66, value: 0, description: 'Contribuenti forfettari', ei_type: '2.2' },
        discount: 0,
        not_taxable: false,
      },
    ],
    payments_list: [
      payment({ id: 11, amount: 301, due_date: '2026-10-10' }),
      payment({ id: 12, amount: 301, due_date: '2026-11-10' }),
    ],
    next_due_date: '2026-10-10',
    url: 'https://files.example.invalid/doc.pdf',
    created_at: '2026-10-01 09:00:00',
    updated_at: '2026-10-01 09:00:00',
    ...over,
  };
}

export function page<T>(data: T[], current = 1, last = 1, total = data.length) {
  return { data, current_page: current, last_page: last, per_page: 100, total };
}

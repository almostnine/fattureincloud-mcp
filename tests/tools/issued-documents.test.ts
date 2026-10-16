import { describe, expect, it } from 'vitest';
import { CLIENT_BIANCHI, invoice, page, payment } from '../fixtures/issued.js';
import { call, connect, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

describe('fic_list_issued_documents', () => {
  it('filtra il mese lato server e chiede rate e stato SDI', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents', { body: page([invoice()], 1, 3, 120) });
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_list_issued_documents', { year: 2026, month: 10 });
    expect(res.isError).toBe(false);
    const q = fic.callsTo('/c/1001/issued_documents')[0]!.query;
    expect(q.type).toBe('invoice');
    expect(q.q).toBe("date >= '2026-10-01' and date <= '2026-10-31'");
    expect(q.per_page).toBe('50');
    expect(q.fields).toContain('payments_list');
    expect(q.fields).toContain('ei_status');
    expect(q.sort).toBe('-date');
    expect(res.data).toMatchObject({ total: 120, has_more: true, next_page: 2 });
    const item = (res.data.items as Array<Record<string, unknown>>)[0]!;
    // 16 ottobre: la prima rata (10 ottobre) è scaduta
    expect(item).toMatchObject({
      number: '33',
      payment_status: 'not_paid',
      amount_outstanding: 602,
      amount_overdue: 301,
    });
    expect(item.client).toEqual({ id: 501, name: '⟦Studio Rossi di Mario Rossi⟧' });
    expect(res.data.avviso_testi).toBeDefined();
  });

  it('cerca per nome cliente anche con l’apostrofo, senza romperne il filtro', async () => {
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/issued_documents', { body: page([]) });
    const { app } = testApp({ fic });
    await call(await connect(app), 'fic_list_issued_documents', { client_name: CLIENT_BIANCHI.name });
    expect(fic.callsTo('/c/1001/issued_documents')[0]!.query.q).toBe(
      "entity.name contains 'Officina di Bianchi'",
    );
  });

  it('con un filtro di pagamento legge tutte le pagine e filtra', async () => {
    const paid = invoice({
      id: 1,
      payments_list: [
        payment({
          amount: 602,
          due_date: '2026-10-10',
          status: 'paid',
          paid_date: '2026-10-09',
          payment_account: { id: 3 },
        }),
      ],
      next_due_date: null,
    });
    const overdue = invoice({ id: 2 });
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/issued_documents', (c) =>
      c.query.page === '1'
        ? { body: page([paid, overdue], 1, 2, 3) }
        : {
            body: page(
              [invoice({ id: 3, payments_list: [payment({ amount: 602, due_date: '2026-12-01' })] })],
              2,
              2,
              3,
            ),
          },
    );
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_list_issued_documents', { payment_status: 'overdue' });
    expect(fic.callsTo('/c/1001/issued_documents')).toHaveLength(2);
    expect(fic.callsTo('/c/1001/issued_documents')[0]!.query.q).toBe('next_due_date is not null');
    expect((res.data.items as unknown[]).length).toBe(1);
    expect(res.data.sums).toMatchObject({ amount_overdue: 301 });
  });

  it('rifiuta un intervallo di date rovesciato', async () => {
    const { app } = testApp();
    const res = await call(await connect(app), 'fic_list_issued_documents', {
      date_from: '2026-10-31',
      date_to: '2026-10-01',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('date_from');
  });

  it('valida le date inesistenti prima di chiamare l’API', async () => {
    const { app, fic } = testApp();
    const res = await call(await connect(app), 'fic_list_issued_documents', { date_from: '2026-02-30' });
    expect(res.isError).toBe(true);
    expect(fic.callsTo(/issued_documents/)).toHaveLength(0);
  });
});

describe('fic_get_issued_document', () => {
  it('trova la fattura per numero e anno e ne mostra rate e stato SDI', async () => {
    const doc = invoice({ id: 4321 });
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents', { body: page([doc]) })
      .on('GET', '/c/1001/issued_documents/4321', { body: { data: doc } });
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_get_issued_document', { number: 33, year: 2026 });
    expect(res.isError).toBe(false);
    expect(fic.callsTo('/c/1001/issued_documents')[0]!.query.q).toBe(
      "number = 33 and date >= '2026-01-01' and date <= '2026-12-31'",
    );
    expect(fic.callsTo('/c/1001/issued_documents/4321')[0]!.query.fieldset).toBe('detailed');
    expect(res.data).toMatchObject({
      id: 4321,
      number: '33',
      payments: { payment_status: 'not_paid', amount_overdue: 301, overdue_installments: 1 },
      e_invoice: { status: 'accepted', status_meaning: 'accettata dal cliente' },
    });
    const inst = res.data.installments as Array<Record<string, unknown>>;
    expect(inst[0]).toMatchObject({ index: 1, overdue: true, days_overdue: 6 });
    expect(inst[1]).not.toHaveProperty('overdue');
    expect((res.data.items as Array<Record<string, unknown>>)[0]!.vat).toMatchObject({
      id: 66,
      rate: 0,
      ei_type: '2.2',
    });
    expect(res.data.pdf_url).toMatchObject({ url: 'https://files.example.invalid/doc.pdf' });
  });

  it('segnala i numeri ambigui tra sezionali', async () => {
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/issued_documents', {
      body: page([invoice({ id: 1 }), invoice({ id: 2, numeration: '/A' })]),
    });
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_get_issued_document', { number: 33, year: 2026 });
    expect(res.data.ambiguous).toBe(true);
    expect((res.data.candidates as unknown[]).length).toBe(2);
  });

  it('spiega cosa manca se non trova il numero', async () => {
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/issued_documents', { body: page([]) });
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_get_issued_document', { number: 99, year: 2026 });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('99');
  });

  it('su 403 indica lo scope del tipo di documento', async () => {
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/issued_documents/5', {
      status: 403,
      body: { error: { message: 'Forbidden', code: 'NO_PERMISSION' } },
    });
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_get_issued_document', {
      document_id: 5,
      type: 'credit_note',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('issued_documents.credit_notes:r');
  });
});

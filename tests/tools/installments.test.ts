import { describe, expect, it } from 'vitest';
import { CLIENT_BIANCHI, invoice, page, payment } from '../fixtures/issued.js';
import { call, connect, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

const ACCOUNTS = {
  body: {
    data: [
      { id: 3, name: 'Banca di prova', type: 'bank' },
      { id: 4, name: 'Cassa', type: 'standard' },
    ],
  },
};

describe('fic_list_installments', () => {
  it('elenca le rate scadute e non pagate di tutte le fatture, con riepilogo per cliente', async () => {
    const docs = [
      invoice({ id: 1 }),
      invoice({
        id: 2,
        number: 34,
        entity: CLIENT_BIANCHI,
        payments_list: [
          payment({ amount: 100, due_date: '2026-09-01' }),
          payment({
            amount: 100,
            due_date: '2026-09-15',
            status: 'paid',
            paid_date: '2026-09-15',
            payment_account: { id: 3 },
          }),
        ],
      }),
    ];
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/issued_documents', { body: page(docs) });
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_list_installments', { group_by_client: true });
    expect(res.isError).toBe(false);
    expect(fic.callsTo('/c/1001/issued_documents')[0]!.query.q).toBe("next_due_date < '2026-10-16'");
    expect(res.data.count).toBe(2);
    expect(res.data.amount_total).toBe(401);
    const items = res.data.items as Array<Record<string, unknown>>;
    expect(items[0]).toMatchObject({
      document_number: '34',
      due_date: '2026-09-01',
      days_overdue: 45,
      installment: 1,
      installments_total: 2,
    });
    expect(items[1]).toMatchObject({ document_number: '33', due_date: '2026-10-10', days_overdue: 6 });
    const byClient = res.data.by_client as Array<Record<string, unknown>>;
    expect(byClient[0]).toMatchObject({ client_id: 501, amount: 301, client_email: 'rossi@example.com' });
    expect(byClient[1]).toMatchObject({ client_id: 502, amount: 100, max_days_overdue: 45 });
  });

  it('per le rate pagate filtra per data di pagamento', async () => {
    const docs = [
      invoice({
        id: 1,
        payments_list: [
          payment({
            amount: 50,
            due_date: '2026-09-01',
            status: 'paid',
            paid_date: '2026-09-02',
            payment_account: { id: 3, name: 'Banca di prova' },
          }),
          payment({
            amount: 60,
            due_date: '2026-10-01',
            status: 'paid',
            paid_date: '2026-10-03',
            payment_account: { id: 3 },
          }),
        ],
      }),
    ];
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/issued_documents', { body: page(docs) });
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_list_installments', {
      status: 'paid',
      paid_from: '2026-09-01',
      paid_to: '2026-09-30',
    });
    expect(fic.callsTo('/c/1001/issued_documents')[0]!.query.q).toBe(
      "date >= '2025-01-01' and date <= '2026-09-30'",
    );
    expect(res.data.count).toBe(1);
    expect((res.data.items as Array<Record<string, unknown>>)[0]).toMatchObject({
      amount: 50,
      payment_account: { id: 3, name: 'Banca di prova' },
    });
  });
});

describe('fic_set_installment_status', () => {
  it('non è registrato in modalità readonly', async () => {
    const { app } = testApp({ mode: 'readonly' });
    const tools = await (await connect(app)).listTools();
    expect(tools.tools.map((t) => t.name)).not.toContain('fic_set_installment_status');
  });

  it('segna pagata una rata rimandando tutte le rate con i loro ID', async () => {
    const doc = invoice({ id: 7 });
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/7', { body: { data: doc } })
      .on('GET', '/c/1001/info/payment_accounts', ACCOUNTS)
      .on('PUT', '/c/1001/issued_documents/7', (c) => ({
        body: {
          data: {
            ...doc,
            payments_list: (c.body as { data: { payments_list: unknown } }).data.payments_list,
          },
        },
      }));
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_set_installment_status', {
      document_id: 7,
      installment: 1,
      status: 'paid',
      paid_date: '2026-10-09',
      payment_account_id: 3,
    });
    expect(res.isError).toBe(false);
    const put = fic.calls.find((c) => c.method === 'PUT')!;
    const body = put.body as { data: { type: string; payments_list: Array<Record<string, unknown>> } };
    expect(body.data.type).toBe('invoice');
    expect(body.data.payments_list).toEqual([
      {
        id: 11,
        amount: 301,
        due_date: '2026-10-10',
        status: 'paid',
        paid_date: '2026-10-09',
        payment_account: { id: 3 },
        payment_terms: { days: 30, type: 'standard' },
      },
      {
        id: 12,
        amount: 301,
        due_date: '2026-11-10',
        status: 'not_paid',
        paid_date: null,
        payment_account: null,
        payment_terms: { days: 30, type: 'standard' },
      },
    ]);
    expect(res.data).toMatchObject({
      installment: 1,
      after: { status: 'paid', payment_account: { id: 3, name: 'Banca di prova' } },
    });
  });

  it('non sceglie mai il conto da solo: senza conto elenca quelli disponibili', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/7', { body: { data: invoice({ id: 7 }) } })
      .on('GET', '/c/1001/info/payment_accounts', ACCOUNTS);
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_set_installment_status', {
      document_id: 7,
      installment: 1,
      status: 'paid',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('3 (Banca di prova)');
    expect(fic.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('usa il conto di default configurato', async () => {
    const doc = invoice({ id: 7 });
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/7', { body: { data: doc } })
      .on('GET', '/c/1001/info/payment_accounts', ACCOUNTS)
      .on('PUT', '/c/1001/issued_documents/7', { body: { data: doc } });
    const { app } = testApp({ fic, mode: 'write', config: { defaultPaymentAccountId: 4 } });
    const res = await call(await connect(app), 'fic_set_installment_status', {
      document_id: 7,
      due_date: '2026-11-10',
      status: 'paid',
    });
    expect(res.isError).toBe(false);
    const body = fic.calls.find((c) => c.method === 'PUT')!.body as {
      data: { payments_list: Array<Record<string, unknown>> };
    };
    expect(body.data.payments_list[1]).toMatchObject({
      status: 'paid',
      paid_date: '2026-10-16',
      payment_account: { id: 4 },
    });
  });

  it('riporta una rata a non pagata togliendo conto e data', async () => {
    const doc = invoice({
      id: 7,
      payments_list: [
        payment({
          id: 11,
          amount: 602,
          due_date: '2026-10-10',
          status: 'paid',
          paid_date: '2026-10-09',
          payment_account: { id: 3 },
        }),
      ],
    });
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/7', { body: { data: doc } })
      .on('PUT', '/c/1001/issued_documents/7', { body: { data: doc } });
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_set_installment_status', {
      document_id: 7,
      status: 'not_paid',
    });
    expect(res.isError).toBe(false);
    const body = fic.calls.find((c) => c.method === 'PUT')!.body as {
      data: { payments_list: Array<Record<string, unknown>> };
    };
    expect(body.data.payments_list[0]).toMatchObject({
      status: 'not_paid',
      paid_date: null,
      payment_account: null,
    });
  });

  it('rifiuta i documenti bloccati e le rate ambigue', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/7', { body: { data: invoice({ id: 7, locked: true }) } })
      .on('GET', '/c/1001/issued_documents/8', { body: { data: invoice({ id: 8 }) } });
    const { app } = testApp({ fic, mode: 'write' });
    const client = await connect(app);
    const locked = await call(client, 'fic_set_installment_status', {
      document_id: 7,
      installment: 1,
      status: 'not_paid',
    });
    expect(locked.text).toContain('bloccato');
    const ambiguous = await call(client, 'fic_set_installment_status', {
      document_id: 8,
      status: 'not_paid',
    });
    expect(ambiguous.text).toContain('2 rate');
    expect(fic.calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});

describe('fic_reference_data', () => {
  it('legge i conti di saldo e li tiene in cache in memoria', async () => {
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/info/payment_accounts', ACCOUNTS);
    const { app } = testApp({ fic });
    const client = await connect(app);
    const a = await call(client, 'fic_reference_data', { list: 'payment_accounts' });
    await call(client, 'fic_reference_data', { list: 'payment_accounts' });
    expect(a.data.count).toBe(2);
    expect(fic.callsTo('/c/1001/info/payment_accounts')).toHaveLength(1);
  });

  it('chiede CAP o comune per cities', async () => {
    const { app } = testApp();
    const res = await call(await connect(app), 'fic_reference_data', { list: 'cities' });
    expect(res.isError).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { CLIENT_ROSSI, invoice, payment } from '../fixtures/issued.js';
import { call, connect, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

const PRECREATE = {
  body: {
    data: {
      default_values: { payment_method: { id: 77 }, use_gross_prices: false },
      items_default_values: { vat: { id: 0 } },
    },
  },
};

/** FIC finto che calcola i totali come farebbe l'API: netto per riga, IVA dall'aliquota per id. */
function withTotals(
  fic: FakeFic,
  rates: Record<number, number> = { 0: 22, 66: 0 },
  path = '/c/1001/issued_documents/totals',
) {
  return fic.on('POST', new RegExp(`^${path.replace(/[/]/g, '\\/')}$`), (c) => {
    const data = (
      c.body as {
        data: {
          items_list: Array<{ qty: number; net_price: number; vat: { id: number } }>;
          stamp_duty?: number;
        };
      }
    ).data;
    let net = 0;
    let vat = 0;
    for (const it of data.items_list ?? []) {
      const n = Math.round(it.qty * it.net_price * 100);
      net += n;
      vat += Math.round((n * (rates[it.vat.id] ?? 22)) / 100);
    }
    const stamp = Math.round((data.stamp_duty ?? 0) * 100);
    return {
      body: {
        data: {
          amount_net: net / 100,
          amount_vat: vat / 100,
          amount_gross: (net + vat) / 100,
          amount_due: (net + vat + stamp) / 100,
        },
      },
    };
  });
}

describe('fic_create_issued_document', () => {
  it('in dry_run calcola totali e rate con l’API senza creare nulla', async () => {
    const fic = withTotals(
      new FakeFic()
        .withCompany()
        .on('GET', '/c/1001/entities/clients/501', {
          body: {
            data: {
              ...CLIENT_ROSSI,
              default_vat: { id: 66, value: 0 },
              e_invoice: true,
              default_payment_terms: 30,
            },
          },
        })
        .on('GET', '/c/1001/issued_documents/info', PRECREATE),
    );
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_create_issued_document', {
      client_id: 501,
      items: [{ name: 'Consulenza', qty: 3, net_price: 200 }],
      installments_count: 3,
      stamp_duty: 2,
      dry_run: true,
    });
    expect(res.isError).toBe(false);
    expect(res.data.created).toBe(false);
    expect(fic.calls.some((c) => c.method === 'POST' && c.path === '/c/1001/issued_documents')).toBe(false);
    const totalsCall = fic.callsTo('/c/1001/issued_documents/totals')[0]!.body as {
      data: Record<string, unknown>;
    };
    // aliquota del cliente per id, fotografia completa del cliente
    expect((totalsCall.data.items_list as Array<{ vat: unknown }>)[0]!.vat).toEqual({ id: 66 });
    expect(totalsCall.data.entity).toMatchObject({
      id: 501,
      name: CLIENT_ROSSI.name,
      ei_code: '0000000',
      vat_number: '01234567890',
    });
    expect(res.data.preview).toMatchObject({
      e_invoice: true,
      totals: { amount_net: 600, amount_vat: 0, amount_due: 602 },
      installments: [
        { due_date: '2026-11-15', amount: 200.66 },
        { due_date: '2026-12-15', amount: 200.66 },
        { due_date: '2027-01-14', amount: 200.68 },
      ],
    });
    expect((res.data.preview as { notes: string[] }).notes[0]).toContain('MP05');
  });

  it('crea la bozza con fix_payments e senza invii', async () => {
    const fic = withTotals(
      new FakeFic()
        .withCompany()
        .on('GET', '/c/1001/entities/clients/501', { body: { data: CLIENT_ROSSI } })
        .on('GET', '/c/1001/issued_documents/info', PRECREATE)
        .on('POST', '/c/1001/issued_documents', (c) => ({
          body: { data: { ...(c.body as { data: object }).data, id: 9999, number: 35 } },
        })),
    );
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_create_issued_document', {
      client_id: 501,
      date: '2026-10-16',
      items: [{ name: 'Consulenza 🙂', net_price: 100, vat_id: 0 }],
      installments: [{ due_date: '2026-11-16' }, { due_date: '2026-12-16' }],
    });
    expect(res.isError).toBe(false);
    const post = fic.calls.find((c) => c.method === 'POST' && c.path === '/c/1001/issued_documents')!;
    const body = post.body as { data: Record<string, unknown>; options: Record<string, unknown> };
    expect(body.options).toEqual({ fix_payments: true });
    expect((body.data.items_list as Array<{ name: string }>)[0]!.name).toBe('Consulenza');
    expect(body.data.payments_list).toEqual([
      { amount: 61, due_date: '2026-11-16', status: 'not_paid' },
      { amount: 61, due_date: '2026-12-16', status: 'not_paid' },
    ]);
    expect(res.data).toMatchObject({ created: true, document: { id: 9999, number: '35' } });
    expect(fic.calls.some((c) => c.path.includes('/e_invoice/send') || c.path.endsWith('/email'))).toBe(
      false,
    );
  });

  it('non è disponibile in sola lettura', async () => {
    const { app } = testApp({ mode: 'readonly' });
    await expect(
      call(await connect(app), 'fic_create_issued_document', {
        client_id: 1,
        items: [{ name: 'x', net_price: 1 }],
      }),
    ).rejects.toThrow(/not found/);
  });
});

describe('fic_duplicate_issued_document (bug noto del progetto di riferimento)', () => {
  it('mantiene l’aliquota originale per id, ricalcola le rate e regge i campi nulli', async () => {
    const src = invoice({
      id: 40,
      date: '2026-09-01',
      numeration: '/A',
      visible_subject: null,
      notes: null,
      items_list: [
        {
          id: 1,
          name: 'Consulenza settembre',
          description: null,
          qty: 2,
          net_price: 150,
          vat: { id: 66, value: 0, ei_type: '2.2' },
          discount: 10,
        },
      ],
      payments_list: [
        payment({
          id: 1,
          amount: 100,
          due_date: '2026-10-01',
          status: 'paid',
          paid_date: '2026-10-01',
          payment_account: { id: 3 },
          payment_terms: { days: 30, type: 'standard' },
        }),
        payment({
          id: 2,
          amount: 200,
          due_date: '2026-10-31',
          payment_terms: { days: 60, type: 'standard' },
        }),
      ],
      ei_data: { payment_method: 'MP05', invoice_number: '10', od_number: 'ORD1' },
      ei_status: 'accepted',
      locked: true,
      url: 'https://files.fattureincloud.it/old.pdf',
    });
    const fic = withTotals(
      new FakeFic()
        .withCompany()
        .on('GET', '/c/1001/issued_documents/40', { body: { data: src } })
        .on('GET', '/c/1001/entities/clients/501', {
          body: { data: { ...CLIENT_ROSSI, ei_code: 'NEW1234' } },
        })
        .on('POST', '/c/1001/issued_documents', (c) => ({
          body: { data: { ...(c.body as { data: object }).data, id: 41, number: 5 } },
        })),
    );
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_duplicate_issued_document', {
      document_id: 40,
      date: '2026-10-01',
      replace_text: [{ from: 'settembre', to: 'ottobre' }],
    });
    expect(res.isError).toBe(false);
    const body = fic.calls.find((c) => c.method === 'POST' && c.path === '/c/1001/issued_documents')!
      .body as { data: Record<string, unknown> };
    const d = body.data;
    expect(d).not.toHaveProperty('id');
    expect(d).not.toHaveProperty('number');
    expect(d).not.toHaveProperty('ei_status');
    expect(d).not.toHaveProperty('locked');
    expect(d).not.toHaveProperty('url');
    expect(d).not.toHaveProperty('amount_gross');
    expect(d.numeration).toBe('/A');
    expect(d.ei_data).toEqual({ payment_method: 'MP05' });
    expect((d.entity as { ei_code: string }).ei_code).toBe('NEW1234');
    expect(d.items_list).toEqual([
      { name: 'Consulenza ottobre', qty: 2, net_price: 150, vat: { id: 66 }, discount: 10 },
    ]);
    // stesse proporzioni (1/3, 2/3) e distanze (30 e 60 giorni) sul totale calcolato da FIC: 300 + bollo 2
    expect(d.stamp_duty).toBe(2);
    expect(d.payments_list).toEqual([
      {
        amount: 100.67,
        due_date: '2026-10-31',
        status: 'not_paid',
        payment_terms: { days: 30, type: 'standard' },
      },
      {
        amount: 201.33,
        due_date: '2026-11-30',
        status: 'not_paid',
        payment_terms: { days: 60, type: 'standard' },
      },
    ]);
    expect(res.data.document).toMatchObject({ id: 41 });
  });
});

describe('fic_update_issued_document', () => {
  it('cambia l’oggetto senza toccare le rate', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/7', { body: { data: invoice({ id: 7 }) } })
      .on('PUT', '/c/1001/issued_documents/7', {
        body: { data: invoice({ id: 7, visible_subject: 'Nuovo' }) },
      });
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_update_issued_document', {
      document_id: 7,
      visible_subject: 'Nuovo',
    });
    expect(res.data.changed).toEqual(['visible_subject']);
    expect(fic.calls.at(-1)!.body).toEqual({
      data: { type: 'invoice', visible_subject: 'Nuovo' },
      options: { fix_payments: true },
    });
  });

  it('rifiuta di cambiare righe se ci sono rate pagate', async () => {
    const doc = invoice({
      id: 7,
      payments_list: [
        payment({
          amount: 602,
          due_date: '2026-10-10',
          status: 'paid',
          paid_date: '2026-10-10',
          payment_account: { id: 3 },
        }),
      ],
    });
    const fic = new FakeFic().withCompany().on('GET', '/c/1001/issued_documents/7', { body: { data: doc } });
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_update_issued_document', {
      document_id: 7,
      items: [{ name: 'x', net_price: 1 }],
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('rate già pagate');
  });
});

describe('fic_convert_issued_document', () => {
  it('usa transform e reinvia le options intatte', async () => {
    const proforma = invoice({ id: 50, type: 'proforma' });
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/50', { body: { data: proforma } })
      .on('GET', '/c/1001/issued_documents/transform', {
        body: {
          data: { ...proforma, id: undefined, type: 'invoice' },
          options: { create_from: ['50'], transform: true, keep_copy: true },
        },
      })
      .on('POST', '/c/1001/issued_documents', (c) => ({
        body: { data: { ...(c.body as { data: object }).data, id: 51, number: 36 } },
      }));
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_convert_issued_document', { document_id: 50 });
    expect(res.isError).toBe(false);
    expect(fic.callsTo('/c/1001/issued_documents/transform')[0]!.query).toMatchObject({
      original_document_id: '50',
      new_type: 'invoice',
      type: 'proforma',
      transform_keep_copy: '1',
    });
    const body = fic.calls.at(-1)!.body as { options: Record<string, unknown> };
    expect(body.options).toEqual({
      fix_payments: true,
      create_from: ['50'],
      transform: true,
      keep_copy: true,
    });
    expect(res.data.document).toMatchObject({ id: 51, type: 'invoice' });
  });

  it('rifiuta le conversioni non ammesse', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/7', { body: { data: invoice({ id: 7 }) } });
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_convert_issued_document', {
      document_id: 7,
      new_type: 'proforma',
    });
    expect(res.isError).toBe(true);
  });
});

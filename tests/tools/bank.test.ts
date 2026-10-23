import { describe, expect, it } from 'vitest';
import { FicClient } from '../../src/api/client.js';
import type { FicError } from '../../src/api/errors.js';
import { silentLogger } from '../../src/log.js';
import { containsIban, findBankData, isBankKey } from '../../src/safety/bank.js';
import { CLIENT_ROSSI, invoice, payment } from '../fixtures/issued.js';
import { call, connect, previewAndRun, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

/** Nessun IBAN esce dal server: l'account è già stato bloccato una volta per un IBAN inserito via API. */

const IBAN = 'IT60X0542811101000000123456';
const sentBodies = (fic: FakeFic) =>
  fic.calls.filter((c) => c.method === 'POST' || c.method === 'PUT').map((c) => JSON.stringify(c.body));

describe('riconoscimento delle coordinate bancarie', () => {
  it.each([
    IBAN,
    'it60x0542811101000000123456',
    'IT60 X054 2811 1010 0000 0123 456',
    'IT60-X054-2811-1010-0000-0123-456',
    'IT 60 X 05428 11101 000000123456',
    'Pagamento su IBAN: IT60X0542811101000000123456, grazie',
    'Bonifico a DE89 3704 0044 0532 0130 00',
    'GB29NWBK60161331926819',
    'IT00X0000000000000000000000',
  ])('riconosce un IBAN in "%s"', (text) => {
    expect(containsIban(text)).toBe(true);
  });

  it.each([
    'IT01234567890',
    'P.IVA IT01234567890 CF RSSMRA80A01H501U',
    'Fattura 33/2026 del 12-10-2026',
    'DEL 12-10-2026 PROT 123456789',
    'ID12 relativo alla consegna di ottobre',
    'Tel. +39 02 1234 5678',
    'Consulenza settembre 2026, 3 giornate',
  ])('non scambia per IBAN "%s"', (text) => {
    expect(containsIban(text)).toBe(false);
  });

  it('riconosce le chiavi bancarie, anche FatturaPA, senza falsi positivi', () => {
    for (const k of [
      'iban',
      'IBAN',
      'bank_iban',
      'bank_name',
      'bank_beneficiary',
      'bank_swift_code',
      'BIC',
      'ABI',
      'IstitutoFinanziario',
      'Beneficiario',
    ])
      expect(isBankKey(k), k).toBe(true);
    for (const k of [
      'public',
      'is_public',
      'payment_method',
      'payment_account',
      'name',
      'abitazione',
      'cabina',
    ])
      expect(isBankKey(k), k).toBe(false);
  });

  it('trova l’IBAN nei dettagli del metodo di pagamento e nelle note', () => {
    expect(
      findBankData({ data: { payment_method: { id: 1, details: [{ title: 'IBAN', description: IBAN }] } } }),
    ).toEqual({
      path: 'data.payment_method.details[0].description',
      reason: 'testo con la forma di un IBAN',
    });
    expect(findBankData({ data: { notes: `Pagare su ${IBAN}` } })?.path).toBe('data.notes');
    expect(findBankData({ data: { ei_data: { bank_iban: null, bank_name: '' } } })).toBeUndefined();
  });

  it('il client rifiuta qualsiasi corpo con un IBAN prima di inviarlo', async () => {
    const fic = new FakeFic().on('POST', /.*/, { body: { data: {} } });
    const client = new FicClient({
      token: 'a/token-di-prova-0123456789',
      logger: silentLogger,
      fetch: fic.fetch,
    });
    client.setCompanyId(1001);
    const err = (await client
      .request({
        operationId: 'createProduct',
        method: 'POST',
        path: '/c/{company_id}/products',
        body: { data: { name: 'x', description: `IBAN ${IBAN}` } },
      })
      .catch((e) => e)) as FicError;
    expect(err.kind).toBe('refused');
    expect(err.message).toContain('coordinate bancarie');
    expect(err.message).not.toContain(IBAN);
    expect(fic.calls).toHaveLength(0);
  });
});

describe('documenti senza IBAN', () => {
  function createFic() {
    return new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/entities/clients/501', { body: { data: CLIENT_ROSSI } })
      .on('GET', '/c/1001/issued_documents/info', {
        body: {
          data: { default_values: { payment_method: { id: 77 } }, items_default_values: { vat: { id: 0 } } },
        },
      })
      .on('POST', '/c/1001/issued_documents/totals', {
        body: { data: { amount_net: 100, amount_vat: 22, amount_gross: 122, amount_due: 122 } },
      })
      .on('POST', '/c/1001/issued_documents', { body: { data: { id: 9, number: 1 } } });
  }

  it('un IBAN nelle note di una nuova fattura viene rifiutato e non parte nessuna richiesta', async () => {
    const fic = createFic();
    const { app, dialogs } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_create_issued_document', {
      client_id: 501,
      items: [{ name: 'Consulenza', net_price: 100 }],
      notes: `Pagamento con bonifico su IT60 X054 2811 1010 0000 0123 456`,
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('data.notes');
    expect(res.text).not.toContain('X054');
    expect(fic.calls.some((c) => c.method === 'POST')).toBe(false);
    expect(dialogs).toHaveLength(0);
  });

  it('un IBAN nei dettagli del metodo di pagamento viene rifiutato anche da fic_api_write', async () => {
    const fic = new FakeFic().withCompany().on('PUT', /.*/, { body: { data: {} } });
    const { app } = testApp({ fic, mode: 'write' });
    const res = await call(await connect(app), 'fic_api_write', {
      operation_id: 'modifyClient',
      path_params: { client_id: 501 },
      body: {
        data: { default_payment_method: { id: 3, details: [{ title: 'IBAN', description: IBAN }] } },
      },
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('details[0].description');
    expect(fic.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('duplicando un documento con IBAN nei dati SDI, nel metodo di pagamento e nei dati FatturaPA non invia nessun IBAN', async () => {
    const src = invoice({
      id: 40,
      // Lo schema dei tipi non prevede details, ma Fatture in Cloud li restituisce con fieldset detailed.
      ...({
        payment_method: { id: 77, name: 'Bonifico', details: [{ title: 'IBAN', description: IBAN }] },
      } as object),
      ei_data: {
        payment_method: 'MP05',
        bank_iban: IBAN,
        bank_name: 'Banca di Prova',
        bank_beneficiary: 'Azienda di Prova Srl',
      },
      ei_raw: { DatiPagamento: { DettaglioPagamento: { IBAN, ABI: '05428', CAB: '11101' } } },
      payments_list: [
        payment({ amount: 602, due_date: '2026-10-31', ei_raw: { IBAN, IstitutoFinanziario: 'Banca' } }),
      ],
    });
    const fic = createFic()
      .on('GET', '/c/1001/issued_documents/40', { body: { data: src } })
      .on('POST', '/c/1001/issued_documents/totals', {
        body: { data: { amount_net: 600, amount_vat: 0, amount_gross: 602, amount_due: 602 } },
      });
    const { app } = testApp({ fic, mode: 'write' });
    const { done } = await previewAndRun(await connect(app), 'fic_duplicate_issued_document', {
      document_id: 40,
    });
    expect(done.data.created, done.text).toBe(true);
    const created = fic.calls.find((c) => c.method === 'POST' && c.path === '/c/1001/issued_documents')!;
    const data = (created.body as { data: Record<string, unknown> }).data;
    expect(data.payment_method).toEqual({ id: 77 });
    expect(data.ei_data).toEqual({ payment_method: 'MP05' });
    expect(data).not.toHaveProperty('ei_raw');
    for (const body of sentBodies(fic)) {
      expect(body).not.toContain('IT60');
      expect(body).not.toContain('Banca');
    }
  });

  it('cambiando la modalità di pagamento SDI non reinvia le coordinate bancarie del documento', async () => {
    const doc = invoice({
      id: 7,
      ei_data: { payment_method: 'MP05', bank_iban: IBAN, bank_name: 'Banca di Prova', cig: 'Z123' },
    });
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/7', { body: { data: doc } })
      .on('PUT', '/c/1001/issued_documents/7', { body: { data: doc } });
    const { app } = testApp({ fic, mode: 'write' });
    const { done } = await previewAndRun(await connect(app), 'fic_update_issued_document', {
      document_id: 7,
      ei_payment_method: 'MP08',
    });
    expect(done.data.updated, done.text).toBe(true);
    const put = fic.calls.find((c) => c.method === 'PUT')!.body as { data: { ei_data: unknown } };
    expect(put.data.ei_data).toEqual({ payment_method: 'MP08', cig: 'Z123' });
  });

  it('convertendo una proforma toglie le coordinate bancarie preparate da Fatture in Cloud', async () => {
    const proforma = invoice({ id: 50, type: 'proforma' });
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/50', { body: { data: proforma } })
      .on('GET', '/c/1001/issued_documents/transform', {
        body: {
          data: {
            ...proforma,
            type: 'invoice',
            payment_method: { id: 77, details: [{ title: 'IBAN', description: IBAN }] },
            ei_data: { payment_method: 'MP05', bank_iban: IBAN },
          },
          options: { transform: true },
        },
      })
      .on('POST', '/c/1001/issued_documents', { body: { data: { id: 51, type: 'invoice', number: 36 } } });
    const { app } = testApp({ fic, mode: 'write' });
    const { done } = await previewAndRun(await connect(app), 'fic_convert_issued_document', {
      document_id: 50,
    });
    expect(done.data.converted, done.text).toBe(true);
    for (const body of sentBodies(fic)) expect(body).not.toContain('IT60');
  });
});

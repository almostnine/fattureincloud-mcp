import { readFileSync } from 'node:fs';
import { Ajv, type ErrorObject } from 'ajv';
import formatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { CLIENT_BIANCHI, CLIENT_ROSSI, invoice, page, payment } from '../fixtures/issued.js';

/** Le fixture sono inventate ma devono rispettare gli schemi ufficiali delle risposte (OpenAPI 2.1.8). */
const schemas = JSON.parse(
  readFileSync(new URL('./schemas.generated.json', import.meta.url), 'utf8'),
) as Record<string, object>;
const ajv = new Ajv({ strict: false, allErrors: true });
// ajv-formats è CommonJS: con NodeNext l'export di default arriva annidato.
const addFormats = ((formatsModule as unknown as { default?: unknown }).default ?? formatsModule) as (
  a: Ajv,
) => void;
addFormats(ajv);

function validate(operationId: string, body: unknown): string[] {
  const schema = schemas[operationId];
  if (!schema) throw new Error(`Schema mancante per ${operationId}`);
  const fn = ajv.compile(schema);
  return fn(body) ? [] : (fn.errors ?? []).map((e: ErrorObject) => `${e.instancePath} ${e.message}`);
}

describe('fixture conformi all’OpenAPI', () => {
  it('fattura con rate pagate e non pagate', () => {
    const doc = invoice({
      payments_list: [
        payment({
          amount: 301,
          due_date: '2026-10-10',
          status: 'paid',
          paid_date: '2026-10-09',
          payment_account: { id: 3, name: 'Banca', type: 'bank' },
        }),
        payment({ amount: 301, due_date: '2026-11-10' }),
      ],
    });
    expect(validate('getIssuedDocument', { data: doc })).toEqual([]);
  });

  it('elenco documenti emessi con paginazione', () => {
    expect(
      validate('listIssuedDocuments', page([invoice(), invoice({ type: 'credit_note' })], 1, 2, 3)),
    ).toEqual([]);
  });

  it('clienti', () => {
    expect(validate('getClient', { data: CLIENT_ROSSI })).toEqual([]);
    expect(validate('listClients', page([CLIENT_ROSSI, CLIENT_BIANCHI]))).toEqual([]);
  });

  it('conti di saldo e aziende', () => {
    expect(
      validate('listPaymentAccounts', { data: [{ id: 3, name: 'Banca di prova', type: 'bank' }] }),
    ).toEqual([]);
    expect(
      validate('listUserCompanies', {
        data: {
          companies: [{ id: 1001, name: 'Azienda di Prova Srl', type: 'company', fic_plan: 'standard' }],
        },
      }),
    ).toEqual([]);
  });

  it('documento ricevuto', () => {
    expect(
      validate('getReceivedDocument', {
        data: {
          id: 70,
          type: 'expense',
          date: '2026-05-01',
          entity: { id: 9, name: 'Fornitore Esempio' },
          amount_net: 200,
          amount_vat: 44,
          amount_gross: 244,
        },
      }),
    ).toEqual([]);
  });

  it('i validatori rilevano davvero le fixture sbagliate', () => {
    expect(
      validate('getIssuedDocument', { data: invoice({ type: 'fattura' as never }) }).length,
    ).toBeGreaterThan(0);
    expect(
      validate('getIssuedDocument', {
        data: invoice({
          payments_list: [payment({ amount: 1, due_date: '2026-01-01', status: 'PAID' as never })],
        }),
      }).length,
    ).toBeGreaterThan(0);
  });
});

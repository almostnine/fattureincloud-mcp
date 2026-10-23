import { describe, expect, it } from 'vitest';
import { FicClient, QUOTA_FLOOR, TokenBucket } from '../../src/api/client.js';
import type { FicError } from '../../src/api/errors.js';
import { silentLogger } from '../../src/log.js';
import { FakeFic } from '../helpers/fake-fetch.js';

/** Limiti lato client: niente retry delle creazioni, 300 richieste ogni 5 minuti, stop vicino alla quota. */

function makeClient(fic: FakeFic, clock: { t: number }, sleeps: number[] = []) {
  const client = new FicClient({
    token: 'a/token-di-prova-0123456789',
    logger: silentLogger,
    fetch: fic.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
    now: () => clock.t,
  });
  client.setCompanyId(1001);
  return client;
}

const get = { operationId: 'listClients', method: 'GET' as const, path: '/c/{company_id}/entities/clients' };
const BUSY = {
  status: 409,
  body: {
    error: { message: 'The creation or modification of a document is already being executed, please wait' },
  },
};

describe('retry', () => {
  it('sul 409 "già in esecuzione" non ripete mai una creazione (POST)', async () => {
    const fic = new FakeFic().on('POST', '/c/1001/issued_documents', [BUSY, { body: { data: { id: 1 } } }]);
    const err = (await makeClient(fic, { t: 0 })
      .request({
        operationId: 'createIssuedDocument',
        method: 'POST',
        path: '/c/{company_id}/issued_documents',
        body: { data: {} },
      })
      .catch((e) => e)) as FicError;
    expect(err.kind).toBe('conflict');
    expect(fic.calls).toHaveLength(1);
  });

  it('una POST dichiarata ripetibile si ripete anche sul 409', async () => {
    const fic = new FakeFic().on('POST', '/c/1001/issued_documents/totals', [BUSY, { body: { data: {} } }]);
    await makeClient(fic, { t: 0 }).request({
      operationId: 'getNewIssuedDocumentTotals',
      method: 'POST',
      path: '/c/{company_id}/issued_documents/totals',
      body: { data: {} },
      retrySafe: true,
    });
    expect(fic.calls).toHaveLength(2);
  });
});

describe('limite di 300 richieste ogni 5 minuti', () => {
  it('il secchiello concede 300 richieste di fila, poi una al secondo', () => {
    const b = new TokenBucket(300, 300_000, 0);
    for (let i = 0; i < 300; i++) expect(b.reserve(0)).toBe(0);
    expect(b.reserve(0)).toBe(1000);
    expect(b.reserve(0)).toBe(2000);
    // dopo 10 secondi si sono ricaricati 10 gettoni, ma due erano già prenotati
    expect(b.reserve(10_000)).toBe(0);
  });

  it('il client attende il turno e oltre 60 secondi rinuncia senza chiamare FIC', async () => {
    const fic = new FakeFic().on('GET', /.*/, { body: { data: [] } });
    const sleeps: number[] = [];
    const client = makeClient(fic, { t: 0 }, sleeps);
    for (let i = 0; i < 300; i++) await client.request(get);
    expect(sleeps).toEqual([]);
    await client.request(get);
    expect(sleeps).toEqual([1000]);
    for (let i = 0; i < 59; i++) await client.request(get);
    const err = (await client.request(get).catch((e) => e)) as FicError;
    expect(err.kind).toBe('rate_limit');
    expect(fic.calls).toHaveLength(360);
  });

  it('Retry-After del 429 resta rispettato', async () => {
    const fic = new FakeFic().on('GET', /.*/, [
      { status: 429, headers: { 'retry-after': '4' }, body: {} },
      { body: { data: [] } },
    ]);
    const sleeps: number[] = [];
    await makeClient(fic, { t: 0 }, sleeps).request(get);
    expect(sleeps).toEqual([4000]);
  });
});

describe('quote orarie e mensili', () => {
  it(`si ferma quando restano meno di ${QUOTA_FLOOR} richieste nell’ora`, async () => {
    const clock = { t: Date.parse('2026-10-16T10:00:00Z') };
    const fic = new FakeFic().on('GET', /.*/, {
      body: { data: [] },
      headers: { 'ratelimit-hourlyremaining': '15' },
    });
    const client = makeClient(fic, clock);
    await client.request(get);
    const err = (await client.request(get).catch((e) => e)) as FicError;
    expect(err.kind).toBe('refused');
    expect(err.message).toContain('Quota oraria');
    expect(fic.calls).toHaveLength(1);
    // un'ora dopo il dato è vecchio: si riprova
    clock.t += 61 * 60 * 1000;
    await client.request(get);
    expect(fic.calls).toHaveLength(2);
  });

  it(`si ferma quando restano meno di ${QUOTA_FLOOR} richieste nel mese`, async () => {
    const clock = { t: Date.parse('2026-10-16T10:00:00Z') };
    const fic = new FakeFic().on('GET', /.*/, {
      body: { data: [] },
      headers: { 'ratelimit-monthlyremaining': '3' },
    });
    const client = makeClient(fic, clock);
    await client.request(get);
    const err = (await client.request(get).catch((e) => e)) as FicError;
    expect(err.message).toContain('Quota mensile');
    expect(fic.calls).toHaveLength(1);
  });
});

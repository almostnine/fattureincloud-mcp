import { describe, expect, it } from 'vitest';
import { buildUrl, FicClient } from '../../src/api/client.js';
import { FicError } from '../../src/api/errors.js';
import { fetchAll, fetchPage } from '../../src/api/paginate.js';
import { silentLogger } from '../../src/log.js';
import { FakeFic } from '../helpers/fake-fetch.js';

const asFic = (e: unknown) => e as FicError;
const unexpected = (): never => {
  throw new Error('attesa un’eccezione');
};

function makeClient(fic: FakeFic, sleeps: number[] = []) {
  const client = new FicClient({
    token: 'a/token-di-prova-0123456789',
    logger: silentLogger,
    fetch: fic.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
  });
  client.setCompanyId(1001);
  return client;
}

const get = (path = '/c/{company_id}/entities/clients') => ({
  operationId: 'listClients',
  method: 'GET' as const,
  path,
});

describe('FicClient', () => {
  it('usa solo api-v2.fattureincloud.it, con Bearer e company_id nel percorso', async () => {
    const fic = new FakeFic().on('GET', '/c/1001/entities/clients', { body: { data: [] } });
    await makeClient(fic).request(get());
    const c = fic.calls[0]!;
    expect(c.url.origin).toBe('https://api-v2.fattureincloud.it');
    expect(c.headers.authorization).toBe('Bearer a/token-di-prova-0123456789');
  });

  it('codifica i parametri di percorso e salta i parametri vuoti', () => {
    const url = buildUrl(
      '/c/{company_id}/x/{id}',
      { company_id: 1, id: 'a/b' },
      { q: "name = 'x'", empty: '', n: undefined, flag: true },
    );
    expect(url).toBe('https://api-v2.fattureincloud.it/c/1/x/a%2Fb?q=name+%3D+%27x%27&flag=1');
  });

  it('su 429 attende Retry-After e ritenta', async () => {
    const sleeps: number[] = [];
    const fic = new FakeFic().on('GET', '/c/1001/entities/clients', [
      { status: 429, headers: { 'retry-after': '3' }, body: { error: { message: 'Too Many Requests' } } },
      { body: { data: [{ id: 1 }] } },
    ]);
    const res = await makeClient(fic, sleeps).request<{ data: unknown[] }>(get());
    expect(res.data).toHaveLength(1);
    expect(sleeps).toEqual([3000]);
  });

  it('su 429 con attesa oltre 60 secondi non aspetta e restituisce l’errore', async () => {
    const fic = new FakeFic().on('GET', '/c/1001/entities/clients', {
      status: 429,
      headers: { 'retry-after': '600' },
      body: { error: { message: 'Too Many Requests' } },
    });
    const err = await makeClient(fic).request(get()).then(unexpected, asFic);
    expect(err).toBeInstanceOf(FicError);
    expect(err.kind).toBe('rate_limit');
    expect(err.details.retryAfterSeconds).toBe(600);
  });

  it('distingue il 403 di quota (Retry-After) dal 403 di permessi', async () => {
    const quota = new FakeFic().on('GET', '/c/1001/entities/clients', {
      status: 403,
      headers: { 'retry-after': '3600' },
      body: { error: { message: 'Hourly quota exceeded' } },
    });
    const e1 = await makeClient(quota).request(get()).then(unexpected, asFic);
    expect(e1.kind).toBe('quota');

    const perm = new FakeFic().on('GET', '/c/1001/entities/clients', {
      status: 403,
      body: { error: { message: 'Forbidden', code: 'NO_PERMISSION' } },
    });
    const e2 = await makeClient(perm).request(get()).then(unexpected, asFic);
    expect(e2.kind).toBe('permission');
    expect(e2.details.scopes).toEqual(['entity.clients:r']);
    expect(perm.calls).toHaveLength(1);
  });

  it('riconosce LICENSE_EXPIRED e 401', async () => {
    const lic = new FakeFic().on('GET', /.*/, {
      status: 403,
      body: { error: { message: 'License expired.', code: 'LICENSE_EXPIRED' } },
    });
    expect((await makeClient(lic).request(get()).then(unexpected, asFic)).kind).toBe('license');
    const auth = new FakeFic().on('GET', /.*/, {
      status: 401,
      body: { error: 'invalid_token', error_description: 'Token revoked' },
    });
    const e = await makeClient(auth).request(get()).then(unexpected, asFic);
    expect(e.kind).toBe('auth');
    expect(e.details.apiMessage).toBe('Token revoked');
  });

  it('ritenta le GET su 5xx ma mai le POST di creazione', async () => {
    const sleeps: number[] = [];
    const fic = new FakeFic()
      .on('GET', '/c/1001/entities/clients', [{ status: 502 }, { status: 503 }, { body: { data: [] } }])
      .on('POST', '/c/1001/entities/clients', { status: 500 });
    const client = makeClient(fic, sleeps);
    await client.request(get());
    expect(fic.callsTo('/c/1001/entities/clients').filter((c) => c.method === 'GET')).toHaveLength(3);
    const err = await client
      .request({
        operationId: 'createClient',
        method: 'POST',
        path: '/c/{company_id}/entities/clients',
        body: { data: {} },
      })
      .then(unexpected, asFic);
    expect(err.kind).toBe('server');
    expect(fic.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('ritenta il 409 di concorrenza ma non gli altri 409', async () => {
    const fic = new FakeFic().on('PUT', '/c/1001/issued_documents/5', [
      {
        status: 409,
        body: {
          error: {
            message: 'The creation or modification of a document is already being executed, please wait',
          },
        },
      },
      { body: { data: { id: 5 } } },
    ]);
    const client = makeClient(fic);
    await client.request({
      operationId: 'modifyIssuedDocument',
      method: 'PUT',
      path: '/c/{company_id}/issued_documents/{document_id}',
      pathParams: { document_id: 5 },
      body: {},
    });
    expect(fic.calls).toHaveLength(2);

    const locked = new FakeFic().on('PUT', /.*/, {
      status: 409,
      body: { error: { message: 'Il documento è bloccato' } },
    });
    const e = await makeClient(locked)
      .request({
        operationId: 'modifyIssuedDocument',
        method: 'PUT',
        path: '/c/{company_id}/issued_documents/{document_id}',
        pathParams: { document_id: 5 },
        body: {},
      })
      .then(unexpected, asFic);
    expect(e.kind).toBe('conflict');
    expect(locked.calls).toHaveLength(1);
  });

  it('non ritenta i 422 e ne estrae campi e totali', async () => {
    const fic = new FakeFic().on('POST', /.*/, {
      status: 422,
      body: {
        error: {
          message: 'Il totale dei pagamenti non corrisponde al totale da pagare.',
          validation_result: { 'data.items_list.0.name': ['obbligatorio'] },
        },
        extra: { totals: { amount_due: 610 } },
      },
    });
    const e = await makeClient(fic)
      .request({
        operationId: 'createIssuedDocument',
        method: 'POST',
        path: '/c/{company_id}/issued_documents',
        body: {},
      })
      .then(unexpected, asFic);
    expect(e.kind).toBe('validation');
    expect(e.details.validation).toEqual(['data.items_list.0.name: obbligatorio']);
    expect(e.details.totals).toEqual({ amount_due: 610 });
    expect(fic.calls).toHaveLength(1);
  });

  it('registra le quote dagli header', async () => {
    const fic = new FakeFic().on('GET', /.*/, { body: { data: [] } });
    const client = makeClient(fic);
    await client.request(get());
    expect(client.quota.hourlyRemaining).toBe(990);
    expect(client.quota.monthlyLimit).toBe(40000);
  });

  it('esegue le richieste in serie', async () => {
    let active = 0;
    let maxActive = 0;
    const fic = new FakeFic();
    const client = new FicClient({
      token: 'a/token-di-prova-0123456789',
      logger: silentLogger,
      fetch: async (input, init) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return fic.fetch(input, init);
      },
    });
    client.setCompanyId(1001);
    fic.on('GET', /.*/, { body: { data: [] } });
    await Promise.all([client.request(get()), client.request(get()), client.request(get())]);
    expect(maxActive).toBe(1);
  });

  it('rifiuta le chiamate legate all’azienda prima che sia determinata', async () => {
    const client = new FicClient({ token: 'x'.repeat(20), logger: silentLogger, fetch: new FakeFic().fetch });
    const e = await client.request(get()).then(unexpected, asFic);
    expect(e.kind).toBe('config');
  });
});

describe('paginazione', () => {
  const pages = (n: number) =>
    new FakeFic().on('GET', '/c/1001/entities/clients', (call) => {
      const page = Number(call.query.page);
      return { body: { data: [{ id: page }], current_page: page, last_page: n, per_page: 100, total: n } };
    });

  it('chiede sempre per_page=100 in modo esplicito', async () => {
    const fic = pages(1);
    await fetchPage(
      makeClient(fic),
      { operationId: 'listClients', path: '/c/{company_id}/entities/clients' },
      1,
      100,
    );
    expect(fic.calls[0]!.query.per_page).toBe('100');
  });

  it('legge tutte le pagine', async () => {
    const fic = pages(3);
    const all = await fetchAll(
      makeClient(fic),
      { operationId: 'listClients', path: '/c/{company_id}/entities/clients' },
      20,
    );
    expect((all.items as Array<{ id: number }>).map((i) => i.id)).toEqual([1, 2, 3]);
    expect(all.truncated).toBe(false);
    expect(all.pagesRead).toBe(3);
  });

  it('si ferma al tetto e lo dichiara', async () => {
    const fic = pages(5);
    const all = await fetchAll(
      makeClient(fic),
      { operationId: 'listClients', path: '/c/{company_id}/entities/clients' },
      2,
    );
    expect(all.items).toHaveLength(2);
    expect(all.truncated).toBe(true);
    expect(all.total).toBe(5);
  });
});

describe('invii bloccati nel client HTTP', () => {
  const sends = [
    {
      operationId: 'sendEInvoice',
      method: 'POST' as const,
      path: '/c/{company_id}/issued_documents/{document_id}/e_invoice/send',
    },
    {
      operationId: 'scheduleEmail',
      method: 'POST' as const,
      path: '/c/{company_id}/issued_documents/{document_id}/email',
    },
    // percorso di invio con un operationId che non lo dice: si riconosce dal percorso
    {
      operationId: 'modifyIssuedDocument',
      method: 'POST' as const,
      path: '/c/{company_id}/issued_documents/{document_id}/e_invoice/send',
    },
  ];

  it.each(sends)('senza allowSend rifiuta $operationId prima di chiamare la rete', async (spec) => {
    const fic = new FakeFic().on('POST', /.*/, { body: { data: {} } });
    const err = await makeClient(fic)
      .request({ ...spec, pathParams: { document_id: 7 }, body: { data: {} } })
      .then(unexpected, asFic);
    expect(err.kind).toBe('refused');
    expect(err.message).toContain('pannello di Fatture in Cloud');
    expect(fic.calls).toHaveLength(0);
  });

  it('con allowSend l’invio parte', async () => {
    const fic = new FakeFic().on('POST', '/c/1001/issued_documents/7/e_invoice/send', { body: { data: {} } });
    const client = new FicClient({
      token: 'a/token-di-prova-0123456789',
      logger: silentLogger,
      fetch: fic.fetch,
      allowSend: true,
    });
    client.setCompanyId(1001);
    await client.request({ ...sends[0]!, pathParams: { document_id: 7 } });
    expect(fic.calls).toHaveLength(1);
  });
});

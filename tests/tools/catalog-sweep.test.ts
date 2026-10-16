import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATIONS } from '../../src/api/catalog.generated.js';
import type { CatalogOperation } from '../../src/api/catalog-types.js';
import { DELETE_TARGETS } from '../../src/tools/delete.js';
import { call, connect, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

/**
 * Esercita ogni operazione del catalogo attraverso il tool che la espone, contro un FIC simulato:
 * verifica che metodo e percorso inviati siano quelli della spec e che il tool risponda senza errori.
 */

function pathParams(op: CatalogOperation): Record<string, string | number> {
  return Object.fromEntries(
    op.pathParams.map((p) => [p, p === 'subscription_id' ? 'SUB7' : p === 'price_list_id' ? 'PL1' : 42]),
  );
}

function requiredQuery(op: CatalogOperation): Record<string, string | number> {
  const q: Record<string, string | number> = {};
  for (const p of op.query) {
    if (!p.required) continue;
    if (p.enum?.length) q[p.name] = String(p.enum[0]);
    else if (p.name.startsWith('date')) q[p.name] = '2026-01-01';
    else if (p.type === 'integer') q[p.name] = 1;
    else q[p.name] = p.name === 'year' ? '2026' : 'x';
  }
  return q;
}

function expectedPath(op: CatalogOperation): RegExp {
  return new RegExp(`^${op.path.replace('{company_id}', '1001').replace(/\{[a-z_]+\}/g, '[^/]+')}$`);
}

function makeFic() {
  return new FakeFic()
    .withCompany()
    .on('GET', /.*/, { body: { data: { id: 42, updated_at: '2026-01-01 00:00:00' } } })
    .on('POST', /.*/, { body: { data: { id: 42 } } })
    .on('PUT', /.*/, { body: { data: { id: 42 } } })
    .on('DELETE', /.*/, { body: {} });
}

const byEffect = (e: CatalogOperation['effect']) => OPERATIONS.filter((o) => o.effect === e);

describe('ogni operazione di lettura passa da fic_api_read', () => {
  it.each(byEffect('read').map((o) => [o.id, o] as const))('%s', async (_id, op) => {
    const fic = makeFic();
    const { app } = testApp({ fic });
    const res = await call(await connect(app), 'fic_api_read', {
      operation_id: op.id,
      path_params: pathParams(op),
      query: requiredQuery(op),
      ...(op.method === 'POST' ? { body: { data: {} } } : {}),
    });
    expect(res.isError, res.text).toBe(false);
    expect(fic.calls.some((c) => c.method === op.method && expectedPath(op).test(c.path))).toBe(true);
  });
});

describe('ogni operazione di scrittura passa da fic_api_write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fic-sweep-'));
  writeFileSync(join(dir, 'allegato.pdf'), '%PDF finto');

  it.each(byEffect('write').map((o) => [o.id, o] as const))('%s', async (_id, op) => {
    const fic = makeFic();
    const { app } = testApp({ fic, mode: 'write', config: { downloadDir: dir } });
    const multipart = op.body?.contentType.startsWith('multipart/');
    const res = await call(await connect(app), 'fic_api_write', {
      operation_id: op.id,
      path_params: pathParams(op),
      query: requiredQuery(op),
      ...(multipart ? { file_path: 'allegato.pdf' } : op.body ? { body: { data: {} } } : {}),
    });
    expect(res.isError, res.text).toBe(false);
    const sent = fic.calls.at(-1)!;
    expect(sent.method).toBe(op.method);
    expect(sent.path).toMatch(expectedPath(op));
  });

  it.each(byEffect('external').map((o) => [o.id, o] as const))(
    '%s (webhook, con conferma)',
    async (_id, op) => {
      const fic = makeFic();
      const { app } = testApp({ fic, mode: 'full' });
      const client = await connect(app);
      const args = {
        operation_id: op.id,
        path_params: pathParams(op),
        body: { data: { sink: 'https://hook.example.com' } },
      };
      const preview = await call(client, 'fic_api_write', args);
      const res = await call(client, 'fic_api_write', { ...args, confirm: preview.data.confirm_token });
      expect(res.isError, res.text).toBe(false);
      expect(fic.calls.at(-1)!.path).toMatch(expectedPath(op));
    },
  );
});

describe('ogni cancellazione passa da fic_delete', () => {
  it.each(Object.entries(DELETE_TARGETS))('%s', async (resource, target) => {
    const fic = makeFic();
    const { app } = testApp({ fic, mode: 'write' });
    const client = await connect(app);
    const id = resource === 'webhook_subscription' ? 'SUB7' : 42;
    const preview = await call(client, 'fic_delete', { resource, id });
    expect(preview.isError, preview.text).toBe(false);
    const res = await call(client, 'fic_delete', { resource, id, confirm: preview.data.confirm_token });
    expect(res.isError, res.text).toBe(false);
    const op = OPERATIONS.find((o) => o.id === target.del)!;
    const sent = fic.calls.at(-1)!;
    expect(sent.method).toBe('DELETE');
    expect(sent.path).toMatch(expectedPath(op));
  });

  it('copre tutte le operazioni DELETE del catalogo', () => {
    const covered = new Set(Object.values(DELETE_TARGETS).map((t) => t.del));
    const all = OPERATIONS.filter((o) => o.method === 'DELETE').map((o) => o.id);
    expect(all.filter((id) => !covered.has(id))).toEqual([]);
  });
});

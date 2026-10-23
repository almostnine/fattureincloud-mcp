import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { extraToolsWarnings } from '../../src/server.js';
import { EXTRA_TOOLS_ALLOWLIST } from '../../src/tools/define.js';
import { CLIENT_ROSSI, page } from '../fixtures/issued.js';
import { call, connect, previewAndRun, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

const READONLY_NAMES = [
  'fic_account_info',
  'fic_list_issued_documents',
  'fic_get_issued_document',
  'fic_list_installments',
  'fic_get_einvoice',
  'fic_search_entities',
  'fic_get_entity',
  'fic_situation',
  'fic_list_received_documents',
  'fic_get_received_document',
  'fic_list_cashbook',
  'fic_reference_data',
  'fic_reconcile',
  'fic_api_catalog',
  'fic_api_read',
];

describe('FIC_EXTRA_TOOLS: dalla 1.2.0 non abilita più nulla', () => {
  it('in readonly è ignorato: la sola lettura resta sola lettura', async () => {
    const { app } = testApp({
      mode: 'readonly',
      config: { extraTools: ['fic_create_entity', 'fic_api_write', 'fic_delete', 'fic_send_email'] },
    });
    const tools = (await (await connect(app)).listTools()).tools;
    expect(tools).toHaveLength(17);
    for (const t of tools)
      expect(['fic_download_file', 'fic_clear_cache', ...READONLY_NAMES]).toContain(t.name);
  });

  it('l’elenco chiuso non comprende mai fic_api_write, fic_delete né gli invii', () => {
    for (const n of ['fic_api_write', 'fic_delete', 'fic_send_email', 'fic_send_einvoice'])
      expect(EXTRA_TOOLS_ALLOWLIST).not.toContain(n);
    const warnings = extraToolsWarnings({
      mode: 'readonly',
      extraTools: ['fic_create_entity', 'fic_api_write', 'pippo'],
    });
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('ignorato');
    expect(warnings[1]).toContain('elenco chiuso');
  });

  it('legge la variabile d’ambiente', () => {
    expect(loadConfig({ FIC_EXTRA_TOOLS: ' fic_create_entity , fic_update_entity ' }).extraTools).toEqual([
      'fic_create_entity',
      'fic_update_entity',
    ]);
    // segnaposto non sostituito di Claude Desktop quando il campo è vuoto
    // biome-ignore lint/suspicious/noTemplateCurlyInString: è proprio il segnaposto letterale
    expect(loadConfig({ FIC_EXTRA_TOOLS: '${user_config.fic_extra_tools}' }).extraTools).toEqual([]);
  });

  it('un tool di scrittura chiamato in readonly non esiste', async () => {
    const { app, fic } = testApp({ mode: 'readonly', config: { extraTools: ['fic_create_entity'] } });
    await expect(
      call(await connect(app), 'fic_create_entity', { name: 'Nuova Cliente', dry_run: false, confirm: 'x' }),
    ).rejects.toThrow(/not found/);
    expect(fic.calls.some((c) => c.method !== 'GET')).toBe(false);
  });
});

describe('fic_create_entity: controllo dei doppioni', () => {
  function fic(existing: object[]) {
    return new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/entities/clients', { body: page(existing) })
      .on('POST', '/c/1001/entities/clients', (c) => ({
        body: { data: { id: 701, ...(c.body as { data: object }).data } },
      }));
  }

  it('con la stessa partita IVA non crea e mostra l’anagrafica esistente', async () => {
    const f = fic([CLIENT_ROSSI]);
    const { app } = testApp({ fic: f, mode: 'write' });
    const res = await call(await connect(app), 'fic_create_entity', {
      name: 'Rossi Mario',
      vat_number: 'IT01234567890',
    });
    expect(res.data.created).toBe(false);
    expect((res.data.possible_duplicates as Array<{ id: number }>)[0]!.id).toBe(501);
    expect(f.calls.some((c) => c.method === 'POST')).toBe(false);
    const q = f.calls.find((c) => c.path === '/c/1001/entities/clients')!.query.q!;
    expect(q).toContain("vat_number = '01234567890'");
    expect(q).toContain("vat_number = 'IT01234567890'");
  });

  it('con lo stesso nome (maiuscole e spazi a parte) non crea', async () => {
    const f = fic([{ id: 9, name: 'Mario  Bianchi' }]);
    const { app } = testApp({ fic: f, mode: 'write' });
    const res = await call(await connect(app), 'fic_create_entity', { name: 'mario bianchi' });
    expect(res.data.created).toBe(false);
  });

  it('un nome solo simile non è un doppione', async () => {
    const f = fic([{ id: 9, name: 'Mario Bianchi Srl' }]);
    const { app } = testApp({ fic: f, mode: 'write' });
    const { preview, done } = await previewAndRun(await connect(app), 'fic_create_entity', {
      name: 'Mario Bianchi',
    });
    expect(preview.data).toMatchObject({ dry_run: true, created: false });
    expect(done.data.created).toBe(true);
  });

  it('con allow_duplicate crea comunque', async () => {
    const f = fic([CLIENT_ROSSI]);
    const { app } = testApp({ fic: f, mode: 'write' });
    const { done: res } = await previewAndRun(await connect(app), 'fic_create_entity', {
      name: 'Rossi Mario',
      vat_number: '01234567890',
      allow_duplicate: true,
    });
    expect(res.data.created).toBe(true);
    expect(f.calls.filter((c) => c.path === '/c/1001/entities/clients' && c.method === 'GET')).toHaveLength(
      0,
    );
  });
});

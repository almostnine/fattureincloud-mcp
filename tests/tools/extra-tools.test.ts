import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { invalidExtraTools } from '../../src/server.js';
import { CLIENT_ROSSI, page } from '../fixtures/issued.js';
import { call, connect, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

describe('FIC_EXTRA_TOOLS: tool di scrittura abilitati singolarmente', () => {
  it('in readonly aggiunge solo i tool indicati', async () => {
    const { app } = testApp({ mode: 'readonly', config: { extraTools: ['fic_create_entity'] } });
    const names = (await (await connect(app)).listTools()).tools.map((t) => t.name);
    expect(names).toHaveLength(18);
    expect(names).toContain('fic_create_entity');
    expect(names).not.toContain('fic_update_entity');
    expect(names).not.toContain('fic_delete');
    expect(names).not.toContain('fic_api_write');
  });

  it('non abilita mai gli invii né nomi sconosciuti', async () => {
    const { app } = testApp({
      mode: 'readonly',
      config: { extraTools: ['fic_send_email', 'fic_send_einvoice', 'pippo'] },
    });
    const names = (await (await connect(app)).listTools()).tools.map((t) => t.name);
    expect(names).toHaveLength(17);
    expect(invalidExtraTools({ extraTools: ['fic_send_email', 'pippo', 'fic_create_entity'] })).toEqual([
      'fic_send_email',
      'pippo',
    ]);
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

  it('il tool abilitato funziona davvero, gli altri di scrittura no', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/entities/clients', { body: page([]) })
      .on('POST', '/c/1001/entities/clients', (c) => ({
        body: { data: { id: 700, ...(c.body as { data: object }).data } },
      }));
    const { app } = testApp({ fic, mode: 'readonly', config: { extraTools: ['fic_create_entity'] } });
    const client = await connect(app);
    const res = await call(client, 'fic_create_entity', {
      name: 'Nuova Cliente',
      tax_code: 'NVCCLN80A41F205X',
    });
    expect(res.data).toMatchObject({ created: true, id: 700 });
    await expect(call(client, 'fic_update_entity', { id: 700, email: 'x@example.com' })).rejects.toThrow(
      /not found/,
    );
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
    const res = await call(await connect(app), 'fic_create_entity', { name: 'Mario Bianchi' });
    expect(res.data.created).toBe(true);
  });

  it('con allow_duplicate crea comunque', async () => {
    const f = fic([CLIENT_ROSSI]);
    const { app } = testApp({ fic: f, mode: 'write' });
    const res = await call(await connect(app), 'fic_create_entity', {
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

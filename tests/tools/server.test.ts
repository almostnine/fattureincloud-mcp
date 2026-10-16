import { describe, expect, it } from 'vitest';
import { call, connect, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

describe('fic_account_info', () => {
  it('restituisce utente, azienda attiva, modalità e quote', async () => {
    const fic = new FakeFic()
      .withCompany(1001, 'standard')
      .on('GET', '/user/info', {
        body: { data: { id: 9, name: 'Utente Prova', email: 'utente@example.com' } },
      })
      .on('GET', '/c/1001/company/info', {
        body: { data: { id: 1001, name: 'Azienda di Prova Srl', fic_plan_name: 'Standard' } },
      });
    const { app } = testApp({ fic });
    const client = await connect(app);
    const res = await call(client, 'fic_account_info');
    expect(res.isError).toBe(false);
    expect(res.data.active_company).toMatchObject({ id: 1001, plan: 'Standard' });
    expect(res.data.server_mode).toBe('readonly');
    expect(res.data.api_quota).toMatchObject({ hourly_remaining: 990 });
    expect(JSON.parse(res.text)).toEqual(res.data);
  });

  it('spiega come scegliere l’azienda quando il token ne vede più di una', async () => {
    const fic = new FakeFic()
      .on('GET', '/user/companies', {
        body: {
          data: {
            companies: [
              { id: 1, name: 'Prima' },
              { id: 2, name: 'Seconda' },
            ],
          },
        },
      })
      .on('GET', '/user/info', { body: { data: { id: 9 } } });
    const { app } = testApp({ fic, config: { companyId: undefined } });
    const res = await call(await connect(app), 'fic_account_info');
    expect(res.isError).toBe(false);
    expect(res.data.problem).toContain('FIC_COMPANY_ID');
    expect(res.data.companies).toHaveLength(2);
  });

  it('rifiuta un FIC_COMPANY_ID non accessibile', async () => {
    const fic = new FakeFic().withCompany().on('GET', '/user/info', { body: { data: { id: 9 } } });
    const { app } = testApp({ fic, config: { companyId: 4242 } });
    const res = await call(await connect(app), 'fic_account_info');
    expect(res.data.problem).toContain('4242');
  });
});

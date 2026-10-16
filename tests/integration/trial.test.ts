/**
 * Test di integrazione con SCRITTURE, solo su un account Fatture in Cloud di prova (piano Trial).
 * Disattivato di default. Si attiva con FIC_IT_TRIAL=1, FIC_IT_TRIAL_TOKEN e FIC_IT_TRIAL_COMPANY_ID.
 * Prima di qualsiasi scrittura verifica che l'azienda abbia fic_plan "trial" e che il token non sia
 * quello dell'account reale (FIC_ACCESS_TOKEN): altrimenti si ferma.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { AppContext } from '../../src/context.js';
import { createLogger } from '../../src/log.js';
import { call, connect, type ToolCall } from '../helpers/app.js';
import { loadDotEnv } from './env.js';

loadDotEnv();
const token = process.env.FIC_IT_TRIAL_TOKEN;
const companyId = Number(process.env.FIC_IT_TRIAL_COMPANY_ID);
const enabled = process.env.FIC_IT_TRIAL === '1' && Boolean(token) && companyId > 0;

describe.runIf(enabled)('integrazione con scritture (account di prova)', () => {
  const config = {
    ...loadConfig({ FIC_ACCESS_TOKEN: token, FIC_COMPANY_ID: String(companyId) }),
    mode: 'full' as const,
    cache: 'off' as const,
  };
  const app = new AppContext({ config, log: createLogger('warn', [token]) });
  const created: Array<{ resource: string; id: number }> = [];
  let ready = false;

  const run = async (name: string, args: Record<string, unknown>): Promise<ToolCall> => {
    if (!ready) throw new Error('Guardia non superata: nessuna scrittura.');
    return call(await connect(app), name, args);
  };

  beforeAll(async () => {
    if (token === process.env.FIC_ACCESS_TOKEN)
      throw new Error('FIC_IT_TRIAL_TOKEN coincide con il token dell’account reale: mi fermo.');
    const company = await app.activeCompany();
    if (company.id !== companyId || company.fic_plan !== 'trial') {
      throw new Error(
        `L’azienda ${company.id} ha piano "${company.fic_plan}": i test di scrittura girano solo su un account Trial.`,
      );
    }
    ready = true;
  });

  afterAll(async () => {
    if (!ready) return;
    for (const c of created.reverse()) {
      const preview = await run('fic_delete', { resource: c.resource, id: c.id });
      if (!preview.isError)
        await run('fic_delete', { resource: c.resource, id: c.id, confirm: preview.data.confirm_token });
    }
  });

  let clientId = 0;
  let invoiceId = 0;
  let accountId = 0;

  it('crea un cliente di prova', async () => {
    const r = await run('fic_create_entity', {
      name: `Cliente Test MCP ${Date.now()}`,
      email: 'cliente.test@example.com',
      type: 'company',
    });
    expect(r.isError, r.text).toBe(false);
    clientId = r.data.id as number;
    created.push({ resource: 'client', id: clientId });
  });

  it('crea una fattura con due rate, prima in anteprima', async () => {
    const args = {
      client_id: clientId,
      items: [{ name: 'Servizio di prova', qty: 1, net_price: 100 }],
      installments_count: 2,
      e_invoice: false,
    };
    const dry = await run('fic_create_issued_document', { ...args, dry_run: true });
    expect(dry.isError, dry.text).toBe(false);
    const r = await run('fic_create_issued_document', args);
    expect(r.isError, r.text).toBe(false);
    invoiceId = (r.data.document as { id: number }).id;
    created.push({ resource: 'issued_document', id: invoiceId });
  });

  it('segna pagata e poi non pagata una rata, senza toccare l’altra', async () => {
    const accounts = await run('fic_reference_data', { list: 'payment_accounts' });
    accountId = ((accounts.data.items as Array<{ id: number }>)[0] ?? { id: 0 }).id;
    expect(accountId, 'serve almeno un conto di saldo sull’account di prova').toBeGreaterThan(0);
    const paid = await run('fic_set_installment_status', {
      document_id: invoiceId,
      installment: 1,
      status: 'paid',
      payment_account_id: accountId,
    });
    expect(paid.isError, paid.text).toBe(false);
    const doc = await run('fic_get_issued_document', { document_id: invoiceId });
    const inst = doc.data.installments as Array<{ status: string }>;
    expect(inst.map((i) => i.status)).toEqual(['paid', 'not_paid']);
    const unpaid = await run('fic_set_installment_status', {
      document_id: invoiceId,
      installment: 1,
      status: 'not_paid',
    });
    expect(unpaid.isError, unpaid.text).toBe(false);
  });

  it('duplica la fattura', async () => {
    const r = await run('fic_duplicate_issued_document', {
      document_id: invoiceId,
      replace_text: [{ from: 'prova', to: 'prova bis' }],
    });
    expect(r.isError, r.text).toBe(false);
    created.push({ resource: 'issued_document', id: (r.data.document as { id: number }).id });
  });

  it('crea una proforma e la converte in fattura', async () => {
    const p = await run('fic_create_issued_document', {
      type: 'proforma',
      client_id: clientId,
      items: [{ name: 'Proforma di prova', net_price: 50 }],
    });
    expect(p.isError, p.text).toBe(false);
    const proformaId = (p.data.document as { id: number }).id;
    created.push({ resource: 'issued_document', id: proformaId });
    const c = await run('fic_convert_issued_document', {
      document_id: proformaId,
      new_type: 'invoice',
      e_invoice: false,
    });
    expect(c.isError, c.text).toBe(false);
    created.push({ resource: 'issued_document', id: (c.data.document as { id: number }).id });
  });

  it('anteprima dell’email (senza invio)', async () => {
    const r = await run('fic_send_email', { document_id: invoiceId });
    expect(r.isError, r.text).toBe(false);
    expect(r.data.sent).toBe(false);
  });
});

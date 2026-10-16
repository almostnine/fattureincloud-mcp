/**
 * Test di integrazione in SOLA LETTURA sull'account reale.
 * Disattivato di default. Si attiva con FIC_IT_READONLY=1 e FIC_ACCESS_TOKEN (anche da .env).
 * Non stampa dati: solo conteggi ed esiti. Ogni richiesta che non sia GET viene bloccata in rete.
 */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { AppContext } from '../../src/context.js';
import { createLogger } from '../../src/log.js';
import { call, connect } from '../helpers/app.js';
import { loadDotEnv, readOnlyFetch } from './env.js';

loadDotEnv();
const enabled = process.env.FIC_IT_READONLY === '1' && Boolean(process.env.FIC_ACCESS_TOKEN);

describe.runIf(enabled)('integrazione in sola lettura (account reale)', () => {
  const config = { ...loadConfig(process.env), mode: 'readonly' as const, cache: 'memory' as const };
  const app = new AppContext({ config, log: createLogger('warn', [config.token]), fetch: readOnlyFetch });

  const run = async (name: string, args: Record<string, unknown> = {}) => {
    const client = await connect(app);
    const res = await call(client, name, args);
    expect(res.isError, `${name}: ${res.text.slice(0, 300)}`).toBe(false);
    return res.data;
  };

  it('espone solo i tool di lettura', async () => {
    const tools = (await (await connect(app)).listTools()).tools;
    expect(
      tools.every(
        (t) => t.annotations?.readOnlyHint || ['fic_download_file', 'fic_clear_cache'].includes(t.name),
      ),
    ).toBe(true);
  });

  it('account e azienda', async () => {
    const d = await run('fic_account_info');
    expect(d.active_company ?? d.problem).toBeDefined();
    console.error(
      `account: aziende ${(d.companies as unknown[]).length}, quota oraria residua ${(d.api_quota as Record<string, unknown> | undefined)?.hourly_remaining}`,
    );
  });

  it('"elenca le fatture di ottobre 2026"', async () => {
    const d = await run('fic_list_issued_documents', { year: 2026, month: 10 });
    console.error(`fatture ottobre 2026: ${d.total} (prima pagina ${(d.items as unknown[]).length})`);
  });

  it('"quali rate sono scadute e non pagate"', async () => {
    const d = await run('fic_list_installments', { status: 'overdue', group_by_client: true });
    console.error(`rate scadute: ${d.count}, clienti ${(d.by_client as unknown[] | undefined)?.length ?? 0}`);
  });

  it('"dettaglio della fattura N/ANNO"', async () => {
    const number = Number(process.env.FIC_IT_INVOICE_NUMBER ?? 33);
    const year = Number(process.env.FIC_IT_INVOICE_YEAR ?? 2026);
    const client = await connect(app);
    const res = await call(client, 'fic_get_issued_document', { number, year });
    if (res.isError) {
      // Il numero potrebbe non esistere su questo account: va bene, purché l'errore sia "non trovato".
      expect(res.text).toContain('Nessun documento');
      console.error(`fattura ${number}/${year}: non presente`);
    } else {
      console.error(
        `fattura ${number}/${year}: trovata, rate ${(res.data.installments as unknown[] | undefined)?.length ?? 0}`,
      );
    }
  });

  it('"situazione dell\'anno"', async () => {
    const d = await run('fic_situation', { monthly: true });
    expect(d.revenue).toBeDefined();
    console.error(`situazione: dati ${d.truncated ? 'troncati' : 'completi'}`);
  });

  it('conti di saldo, aliquote, documenti ricevuti, prima nota', async () => {
    await run('fic_reference_data', { list: 'payment_accounts' });
    await run('fic_reference_data', { list: 'vat_types' });
    await run('fic_list_received_documents', { year: 2026 });
    await run('fic_list_cashbook', {});
  });

  it('le scritture sono bloccate a livello di rete', async () => {
    await expect(readOnlyFetch('https://api-v2.fattureincloud.it/x', { method: 'POST' })).rejects.toThrow(
      /Bloccata/,
    );
  });
});
